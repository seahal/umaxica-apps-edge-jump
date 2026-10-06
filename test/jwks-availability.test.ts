import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createApp } from '../src';
import { raceAbort } from '../src/core/deadline';
import { JwksCache } from '../src/core/jwks_cache';
import { JoseOutboundSigner } from '../src/core/sign_outbound';
import { JumpError, type IssuerConfig, type IssuerRegistry } from '../src/core/types';

const SERVICE = 'https://jump.example.net';
const ISS_A = 'https://app.example.com';
const ISS_B = 'https://other.example.com';
const NOW = 1_800_000_000;
const T0 = NOW * 1000;
const TTL = 30_000;
const NEGATIVE_TTL = 30_000;
const COOLDOWN = 10_000;

type Pair = Awaited<ReturnType<typeof generateKeyPair>>;
type Upstream = 'ok' | 'unavailable' | 'bad_gateway';

function issuerConfig(iss: string): IssuerConfig {
  return {
    iss,
    jwks_uri: `${iss}/.well-known/jwks.json`,
    allowed_dst_internal: ['https://docs.example.com'],
    allowed_dst_external: false,
    revoked_kids: [],
  };
}

async function publicJwk(pair: Pair, kid: string): Promise<JWK> {
  return { ...(await exportJWK(pair.publicKey)), kid, alg: 'ES384', use: 'sig' };
}

async function harness() {
  const [current, next, stranger, jumpKeys] = await Promise.all([
    generateKeyPair('ES384'),
    generateKeyPair('ES384'),
    generateKeyPair('ES384'),
    generateKeyPair('ES384'),
  ]);
  const registry: IssuerRegistry = { [ISS_A]: issuerConfig(ISS_A), [ISS_B]: issuerConfig(ISS_B) };
  const keysets: Record<string, JWK[]> = {
    [ISS_A]: [await publicJwk(current, 'kid-1')],
    [ISS_B]: [await publicJwk(current, 'kid-1')],
  };
  const upstream: Record<string, Upstream> = { [ISS_A]: 'ok', [ISS_B]: 'ok' };
  const fetchJwks = vi.fn(async (issuer: IssuerConfig) => {
    const state = upstream[issuer.iss];
    if (state === 'unavailable') throw new JumpError('jwks_unavailable');
    if (state === 'bad_gateway') throw new JumpError('jwks_bad_gateway');
    return { keys: keysets[issuer.iss] ?? [] };
  });
  const cache = new JwksCache(fetchJwks);
  const sign = vi.fn((claim: Parameters<JoseOutboundSigner['sign']>[0]) =>
    new JoseOutboundSigner(jumpKeys.privateKey, 'jump-test').sign(claim),
  );
  const app = createApp({
    registry,
    jwksCache: cache,
    config: { serviceOrigin: SERVICE },
    signer: { sign },
    now: () => NOW,
  });
  const token = (pair: Pair, kid: string, iss = ISS_A) =>
    new SignJWT({
      schema: 1,
      rpl: 'reuse',
      iss,
      aud: SERVICE,
      sub: 'jump-redirect',
      iat: NOW,
      nbf: NOW,
      exp: NOW + 30,
      jti: crypto.randomUUID(),
      dst: 'internal',
      url: 'https://docs.example.com/path',
    })
      .setProtectedHeader({ typ: 'JWT', alg: 'ES384', kid })
      .sign(pair.privateKey);
  const jump = async (rt: string) => {
    const response = await app.request(`${SERVICE}/?rt=${rt}`);
    return { status: response.status, error: response.headers.get('X-Jump-Error') };
  };
  const fetchesFor = (iss: string) =>
    fetchJwks.mock.calls.filter(([issuer]) => issuer.iss === iss).length;
  return {
    registry,
    keysets,
    upstream,
    fetchJwks,
    fetchesFor,
    cache,
    sign,
    jump,
    current,
    next,
    stranger,
    valid: () => token(current, 'kid-1'),
    forged: () => token(stranger, 'kid-1'),
    unknownKid: (kid = 'kid-unknown') => token(stranger, kid),
    token,
  };
}

const ACCEPTED = { status: 302, error: null };
const TEMPORARY = { status: 503, error: 'temporarily_unavailable' };
const DENIED = { status: 400, error: 'invalid_request' };

describe('issuer JWKS availability semantics', () => {
  let clock = T0;
  beforeEach(() => {
    clock = T0;
    vi.spyOn(Date, 'now').mockImplementation(() => clock);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  test('an outage recorded by a forced refresh does not invalidate the warm keyset', async () => {
    const h = await harness();
    expect(await h.jump(await h.valid())).toEqual(ACCEPTED);
    expect(h.fetchJwks).toHaveBeenCalledTimes(1);

    h.upstream[ISS_A] = 'unavailable';
    clock = T0 + 1000;
    // A failed signature forces a refresh; the refresh is what fails.
    expect(await h.jump(await h.forged())).toEqual(TEMPORARY);
    expect(h.fetchJwks).toHaveBeenCalledTimes(2);

    // The warm key still verifies the genuine token, without another fetch.
    expect(await h.jump(await h.valid())).toEqual(ACCEPTED);
    expect(h.fetchJwks).toHaveBeenCalledTimes(2);

    // A request that needs the refresh stays a dependency failure, never a
    // warm-key "probably invalid" 400, and does not hammer the issuer.
    expect(await h.jump(await h.forged())).toEqual(TEMPORARY);
    expect(h.fetchJwks).toHaveBeenCalledTimes(2);
    expect(h.sign).toHaveBeenCalledTimes(2);
  });

  test.each([
    ['5xx/429/network class', 'unavailable', TEMPORARY],
    ['unusable issuer document', 'bad_gateway', DENIED],
  ] as const)(
    'unknown kid whose refresh fails (%s) leaves known kids usable',
    async (_label, state, expected) => {
      const h = await harness();
      expect(await h.jump(await h.valid())).toEqual(ACCEPTED);

      h.upstream[ISS_A] = state;
      expect(await h.jump(await h.unknownKid())).toEqual(expected);
      expect(h.fetchJwks).toHaveBeenCalledTimes(2);

      expect(await h.jump(await h.valid())).toEqual(ACCEPTED);
      expect(h.fetchJwks).toHaveBeenCalledTimes(2);
    },
  );

  test('a second unknown kid during the outage is answered from the outage negative', async () => {
    const h = await harness();
    await h.jump(await h.valid());
    h.upstream[ISS_A] = 'unavailable';
    expect(await h.jump(await h.unknownKid('kid-a'))).toEqual(TEMPORARY);
    expect(await h.jump(await h.unknownKid('kid-b'))).toEqual(TEMPORARY);
    expect(h.fetchJwks).toHaveBeenCalledTimes(2);
  });

  test('without a warm keyset the outage negative answers 503 until it expires', async () => {
    const h = await harness();
    h.upstream[ISS_A] = 'unavailable';
    expect(await h.jump(await h.valid())).toEqual(TEMPORARY);
    expect(h.fetchJwks).toHaveBeenCalledTimes(1);

    clock = T0 + NEGATIVE_TTL - 1;
    expect(await h.jump(await h.valid())).toEqual(TEMPORARY);
    expect(h.fetchJwks).toHaveBeenCalledTimes(1);

    // At the boundary the negative is spent and the issuer is asked again.
    clock = T0 + NEGATIVE_TTL;
    expect(await h.jump(await h.valid())).toEqual(TEMPORARY);
    expect(h.fetchJwks).toHaveBeenCalledTimes(2);

    h.upstream[ISS_A] = 'ok';
    clock = T0 + 2 * NEGATIVE_TTL;
    expect(await h.jump(await h.valid())).toEqual(ACCEPTED);
    expect(h.fetchJwks).toHaveBeenCalledTimes(3);
  });

  test('the warm keyset is used up to its TTL boundary and not past it', async () => {
    const h = await harness();
    await h.jump(await h.valid());
    h.upstream[ISS_A] = 'unavailable';
    clock = T0 + 1000;
    expect(await h.jump(await h.forged())).toEqual(TEMPORARY);
    const outageExpiry = T0 + 1000 + NEGATIVE_TTL;

    clock = T0 + TTL - 1;
    expect(await h.jump(await h.valid())).toEqual(ACCEPTED);

    // Expired keyset: no stale-key fallback while the outage negative holds.
    clock = T0 + TTL;
    expect(await h.jump(await h.valid())).toEqual(TEMPORARY);
    clock = outageExpiry - 1;
    expect(await h.jump(await h.valid())).toEqual(TEMPORARY);
    expect(h.fetchJwks).toHaveBeenCalledTimes(2);

    h.upstream[ISS_A] = 'ok';
    clock = outageExpiry;
    expect(await h.jump(await h.valid())).toEqual(ACCEPTED);
    expect(h.fetchJwks).toHaveBeenCalledTimes(3);
  });

  test('a successful refresh clears the outage negative', async () => {
    const h = await harness();
    h.upstream[ISS_A] = 'unavailable';
    expect(await h.jump(await h.valid())).toEqual(TEMPORARY);
    h.upstream[ISS_A] = 'ok';
    clock = T0 + NEGATIVE_TTL;
    expect(await h.jump(await h.valid())).toEqual(ACCEPTED);
    // No leftover negative: a forced refresh right after reaches the issuer.
    clock = T0 + NEGATIVE_TTL + COOLDOWN;
    expect(await h.jump(await h.forged())).toEqual(DENIED);
    expect(h.fetchJwks).toHaveBeenCalledTimes(3);
  });

  test('a revoked kid is rejected over a warm keyset and an outage negative, without a fetch', async () => {
    const h = await harness();
    await h.jump(await h.valid());
    h.upstream[ISS_A] = 'unavailable';
    expect(await h.jump(await h.forged())).toEqual(TEMPORARY);
    expect(h.fetchJwks).toHaveBeenCalledTimes(2);

    const issuer = h.registry[ISS_A];
    if (!issuer) throw new Error('fixture issuer missing');
    issuer.revoked_kids = ['kid-1'];
    expect(await h.jump(await h.valid())).toEqual(DENIED);
    expect(await h.jump(await h.forged())).toEqual(DENIED);
    expect(h.fetchJwks).toHaveBeenCalledTimes(2);
    expect(h.sign).toHaveBeenCalledTimes(1);
  });

  test('a revoked kid is rejected on a cold cache without a fetch', async () => {
    const h = await harness();
    await expect(
      h.cache.getKey({ ...issuerConfig(ISS_A), revoked_kids: ['kid-1'] }, 'kid-1', 'ES384'),
    ).rejects.toMatchObject({ code: 'invalid_signature' });
    expect(h.fetchJwks).not.toHaveBeenCalled();
  });

  test('rotation to a new kid refreshes once and succeeds', async () => {
    const h = await harness();
    await h.jump(await h.valid());
    h.keysets[ISS_A] = [await publicJwk(h.current, 'kid-1'), await publicJwk(h.next, 'kid-2')];
    expect(await h.jump(await h.token(h.next, 'kid-2'))).toEqual(ACCEPTED);
    expect(h.fetchJwks).toHaveBeenCalledTimes(2);
    expect(await h.jump(await h.valid())).toEqual(ACCEPTED);
    expect(h.fetchJwks).toHaveBeenCalledTimes(2);
  });

  test('forced-refresh cooldown bounds upstream fetches at its boundary', async () => {
    const h = await harness();
    await h.jump(await h.valid());
    clock = T0 + 1000;
    expect(await h.jump(await h.forged())).toEqual(DENIED);
    expect(h.fetchJwks).toHaveBeenCalledTimes(2);

    clock = T0 + 1000 + COOLDOWN - 1;
    expect(await h.jump(await h.forged())).toEqual(DENIED);
    expect(h.fetchJwks).toHaveBeenCalledTimes(2);

    clock = T0 + 1000 + COOLDOWN;
    expect(await h.jump(await h.forged())).toEqual(DENIED);
    expect(h.fetchJwks).toHaveBeenCalledTimes(3);
  });

  test('concurrent refreshes share one upstream fetch', async () => {
    const pair = await generateKeyPair('ES384');
    const keys = [await publicJwk(pair, 'kid-1')];
    let release: (value: { keys: JWK[] }) => void = () => {};
    const fetchJwks = vi.fn(
      () => new Promise<{ keys: JWK[] }>((resolve) => void (release = resolve)),
    );
    const cache = new JwksCache(fetchJwks);
    const issuer = issuerConfig(ISS_A);
    const pending = [
      cache.getKey(issuer, 'kid-1', 'ES384'),
      cache.getKey(issuer, 'kid-1', 'ES384'),
      cache.getKey(issuer, 'kid-1', 'ES384', true),
    ];
    release({ keys });
    await expect(Promise.all(pending)).resolves.toHaveLength(3);
    expect(fetchJwks).toHaveBeenCalledTimes(1);
  });

  test('concurrent refreshes share one upstream failure', async () => {
    let fail: (error: Error) => void = () => {};
    const fetchJwks = vi.fn(
      () => new Promise<{ keys: JWK[] }>((_resolve, reject) => void (fail = reject)),
    );
    const cache = new JwksCache(fetchJwks);
    const issuer = issuerConfig(ISS_A);
    const pending = [
      cache.getKey(issuer, 'kid-1', 'ES384'),
      cache.getKey(issuer, 'kid-1', 'ES384'),
    ];
    const settled = Promise.allSettled(pending);
    fail(new JumpError('jwks_unavailable'));
    for (const result of await settled)
      expect(result).toMatchObject({ status: 'rejected', reason: { code: 'jwks_unavailable' } });
    await expect(cache.getKey(issuer, 'kid-1', 'ES384')).rejects.toMatchObject({
      code: 'jwks_unavailable',
    });
    expect(fetchJwks).toHaveBeenCalledTimes(1);
  });

  test('a fetch that resolves after the deadline neither succeeds nor warms the cache', async () => {
    const pair = await generateKeyPair('ES384');
    const keys = [await publicJwk(pair, 'kid-1')];
    let release: (value: { keys: JWK[] }) => void = () => {};
    const fetchJwks = vi.fn(
      () => new Promise<{ keys: JWK[] }>((resolve) => void (release = resolve)),
    );
    const cache = new JwksCache(fetchJwks);
    const issuer = issuerConfig(ISS_A);
    const controller = new AbortController();
    const pending = cache.getKey(issuer, 'kid-1', 'ES384', false, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'deadline_exceeded' });
    release({ keys });
    await Promise.resolve();

    fetchJwks.mockResolvedValueOnce({ keys });
    await expect(cache.getKey(issuer, 'kid-1', 'ES384')).resolves.toBeDefined();
    expect(fetchJwks).toHaveBeenCalledTimes(2);
  });

  test('a request that hits its deadline during the JWKS fetch emits no acceptance', async () => {
    const h = await harness();
    const audit = vi.fn();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => void (release = resolve));
    const slow = new JwksCache(async (issuer, signal) => {
      await raceAbort(gate, signal);
      return { keys: h.keysets[issuer.iss] ?? [] };
    });
    const app = createApp({
      registry: h.registry,
      jwksCache: slow,
      config: { serviceOrigin: SERVICE },
      signer: { sign: h.sign },
      now: () => NOW,
      deadlineMs: 10,
      auditLog: audit,
    });
    const response = await app.request(`${SERVICE}/?rt=${await h.valid()}`);
    release();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(response.status).toBe(504);
    expect(response.headers.get('Location')).toBeNull();
    expect(h.sign).not.toHaveBeenCalled();
    expect(audit.mock.calls.filter(([entry]) => entry.event === 'jump_accept')).toEqual([]);
  });

  test('an unknown-kid flood on one issuer cannot evict another issuer outage negative', async () => {
    const h = await harness();
    h.upstream[ISS_A] = 'unavailable';
    await expect(h.cache.getKey(issuerConfig(ISS_A), 'kid-1', 'ES384')).rejects.toMatchObject({
      code: 'jwks_unavailable',
    });
    expect(h.fetchesFor(ISS_A)).toBe(1);

    // 1024 is the unknown-kid bound; exceed it so the oldest entries are evicted.
    for (let index = 0; index < 1100; index++)
      await expect(
        h.cache.getKey(issuerConfig(ISS_B), `flood-${index}`, 'ES384'),
      ).rejects.toMatchObject({ code: 'invalid_signature' });

    await expect(h.cache.getKey(issuerConfig(ISS_A), 'kid-1', 'ES384')).rejects.toMatchObject({
      code: 'jwks_unavailable',
    });
    expect(h.fetchesFor(ISS_A)).toBe(1);
    // The flood itself stays behind the forced-refresh cooldown.
    expect(h.fetchesFor(ISS_B)).toBe(2);
  });

  test('an unknown kid stays negative-cached per issuer and kid', async () => {
    const h = await harness();
    await h.jump(await h.valid());
    expect(await h.jump(await h.unknownKid())).toEqual(DENIED);
    expect(await h.jump(await h.unknownKid())).toEqual(DENIED);
    expect(h.fetchJwks).toHaveBeenCalledTimes(2);
    expect(await h.jump(await h.valid())).toEqual(ACCEPTED);
    expect(h.fetchJwks).toHaveBeenCalledTimes(2);
  });
});

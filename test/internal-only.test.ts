import { beforeAll, describe, expect, test, vi } from 'vitest';
import { exportJWK, generateKeyPair, jwtVerify, SignJWT } from 'jose';
import { createApp } from '../src';
import { JwksCache } from '../src/core/jwks_cache';
import { JoseOutboundSigner } from '../src/core/sign_outbound';
import type { InboundJumpClaim, IssuerRegistry, OutboundJumpClaim } from '../src/core/types';
import receiverContract from './fixtures/receiver-contract.json';
import { assertDefined } from './assert-defined';

const now = 1_800_000_000;
const issuer = 'https://auth.umaxica.app';
const internal = 'https://www.umaxica.app';
const external = 'https://example.com';
const jump = 'https://jump.umaxica.net';
let issuerKeys: Awaited<ReturnType<typeof generateKeyPair>>;
let jumpKeys: Awaited<ReturnType<typeof generateKeyPair>>;

beforeAll(async () => {
  issuerKeys = await generateKeyPair('ES384');
  jumpKeys = await generateKeyPair('ES384');
});

function claim(): InboundJumpClaim {
  return {
    schema: 1,
    rpl: 'reuse',
    iss: issuer,
    aud: jump,
    sub: 'jump-redirect',
    iat: now,
    nbf: now,
    exp: now + 30,
    jti: 'inbound-internal-only',
    dst: 'internal',
    url: `${internal}/receive?state=keep&q=a%20b`,
  };
}

async function fixture() {
  const publicJwk = await exportJWK(issuerKeys.publicKey);
  const registry: IssuerRegistry = {
    [issuer]: {
      iss: issuer,
      jwks_uri: `${issuer}/.well-known/jwks.json`,
      allowed_dst_internal: [internal],
      // Deliberately permits both URL classes as external: dst must never be
      // inferred from the URL or rescued by an accidental configuration change.
      allowed_dst_external: [external, internal],
    },
  };
  const outboundSigner = new JoseOutboundSigner(jumpKeys.privateKey, 'jump-test');
  const sign = vi.fn((payload: OutboundJumpClaim) => outboundSigner.sign(payload));
  const auditLog = vi.fn();
  const app = createApp({
    registry,
    config: { serviceOrigin: jump },
    jwksCache: new JwksCache(async () => ({
      keys: [{ ...publicJwk, kid: 'issuer-test', alg: 'ES384', use: 'sig' }],
    })),
    signer: { sign },
    auditLog,
    now: () => now,
    randomJti: () => 'outbound-internal-only',
  });
  return {
    sign,
    auditLog,
    request: async (payload: Record<string, unknown>) => {
      const rt = await new SignJWT(payload)
        .setProtectedHeader({ typ: 'JWT', alg: 'ES384', kid: 'issuer-test' })
        .sign(issuerKeys.privateKey);
      return app.request(`${jump}/?rt=${rt}`);
    },
  };
}

async function expectDenied(response: Response) {
  expect(response.status).toBe(400);
  expect(response.status >= 300 && response.status < 400).toBe(false);
  expect(response.headers.get('X-Jump-Error')).toBe('invalid_request');
  expect(response.headers.get('Location')).toBeNull();
  const html = await response.text();
  expect(html).toContain('<body class="splash">');
  expect(html).not.toContain('class="continue"');
  expect(html).not.toContain('history.replaceState');
  expect(html).not.toContain('away.umaxica.net');
  expect(html).not.toContain(`href="${external}`);
  expect(html).not.toContain(`href="${internal}`);
}

describe('permanent internal-only gateway contract', () => {
  test('A: internal discriminator and allowed URL preserve the semantic redirect contract', async () => {
    const { request, sign } = await fixture();
    const response = await request(claim());
    expect(response.status).toBe(302);
    const location = new URL(assertDefined(response.headers.get('Location')));
    expect(location.origin).toBe(internal);
    expect(location.pathname).toBe('/receive');
    expect(location.searchParams.getAll('rt')).toHaveLength(1);
    const rt = assertDefined(location.searchParams.get('rt'));
    location.searchParams.delete('rt');
    const verified = await jwtVerify(rt, jumpKeys.publicKey, {
      issuer: jump,
      audience: internal,
      algorithms: ['ES384'],
      currentDate: new Date(now * 1000),
    });
    expect(verified.protectedHeader).toEqual({ typ: 'JWT', alg: 'ES384', kid: 'jump-test' });
    expect(Object.keys(verified.payload).sort()).toEqual(
      [...receiverContract.required_claims].sort(),
    );
    expect(verified.payload).toEqual({
      schema: 1,
      rpl: 'reuse',
      iss: jump,
      aud: internal,
      sub: 'jump-redirect',
      src: issuer,
      dst: 'internal',
      url: location.href,
      iat: now,
      nbf: now,
      exp: now + receiverContract.ttl_seconds,
      jti: 'outbound-internal-only',
    });
    expect(location.searchParams.get('state')).toBe('keep');
    expect(location.searchParams.get('q')).toBe('a b');
    expect(sign).toHaveBeenCalledTimes(1);
  });

  test.each([
    { partition: 'B: internal with external URL', dst: 'internal', url: `${external}/` },
    { partition: 'C: allowlisted external', dst: 'external', url: `${external}/` },
    { partition: 'D: external with allowed internal URL', dst: 'external', url: `${internal}/` },
  ])('$partition is rejected without signing or navigation', async ({ dst, url }) => {
    const { request, sign, auditLog } = await fixture();
    await expectDenied(await request({ ...claim(), dst, url }));
    expect(sign).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalledWith(expect.objectContaining({ result: 'accepted' }));
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ result: 'rejected' }));
  });

  // EP: unknown/case variants, missing, malformed type, empty and whitespace.
  // BVA: zero/one-character strings, NUL boundaries, and encoding anomalies.
  // undefined has no JSON wire value: test omission separately and explicitly.
  test.each(
    [
      undefined,
      null,
      '',
      ' ',
      'foo',
      'INTERNAL',
      'Internal',
      'External',
      'i',
      'internal ',
      ' internal',
      '\0',
      'internal\0',
      '\0internal',
      '%69nternal',
      'internal%00',
      'ｉｎｔｅｒｎａｌ',
      0,
      false,
      true,
      [],
      {},
      ['internal'],
    ].map((dst) => ({ dst })),
  )('E/F: invalid dst $dst is not inferred from an allowed internal URL', async ({ dst }) => {
    const { request, sign } = await fixture();
    const payload: Record<string, unknown> = { ...claim(), dst };
    if (dst === undefined) delete payload.dst;
    await expectDenied(await request(payload));
    expect(sign).not.toHaveBeenCalled();
  });
});

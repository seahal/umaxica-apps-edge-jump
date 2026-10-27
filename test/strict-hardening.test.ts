// Strict stateless profile (2026-10-07 hardening plan): explicit typing per
// deployment, closed JOSE header and claim sets, bounded issuer JWKS handling,
// raw entry-query form, and the outbound return token.
import {
  decodeProtectedHeader,
  exportJWK,
  exportPKCS8,
  generateKeyPair,
  jwtVerify,
  type JWK,
} from 'jose';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { createApp, resolveJumpConfig } from '../src';
import worker, { resetIsolateCachesForTest, type CloudflareEnv } from '../src/cloudflare';
import { fetchRegistryJwks, MAX_JWKS_BYTES } from '../src/core/fetch_jwks';
import { handleJump } from '../src/core/handle_jump';
import { importIssuerJwks, MAX_ISSUER_JWKS_KEYS } from '../src/core/issuer_jwks';
import { JwksCache } from '../src/core/jwks_cache';
import { JoseOutboundSigner } from '../src/core/sign_outbound';
import { tokenTypes } from '../src/core/token_profile';
import type { IssuerConfig, IssuerRegistry, JumpEnvironment } from '../src/core/types';
import { MAX_TOKEN_LENGTH } from '../src/core/verify_jwt';
import { verifyJumpJwt } from './app-fixture';

const JUMP = 'https://jump.example.net';
const ISSUER = 'https://app.example.com';
const TARGET = 'https://docs.example.com';
const NOW = 1_800_000_000;
const KID = 'issuer-2026-10';

const ISSUER_CONFIG: IssuerConfig = {
  iss: ISSUER,
  jwks_uri: `${ISSUER}/.well-known/jwks.json`,
  allowed_dst_internal: [TARGET],
};
const REGISTRY: IssuerRegistry = { [ISSUER]: ISSUER_CONFIG };

type Pair = Awaited<ReturnType<typeof generateKeyPair>>;
let issuerKeys: Pair;
let jumpKeys: Pair;
let issuerJwk: JWK;

beforeAll(async () => {
  issuerKeys = await generateKeyPair('ES384');
  jumpKeys = await generateKeyPair('ES384', { extractable: true });
  issuerJwk = { ...(await exportJWK(issuerKeys.publicKey)), kid: KID, alg: 'ES384', use: 'sig' };
});

const b64 = (value: unknown) =>
  Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

/** Signs arbitrary header/payload JSON with ES384 (raw r||s), bypassing jose's header rules. */
async function rawToken(
  header: unknown,
  payload: unknown,
  key: CryptoKey = issuerKeys.privateKey as CryptoKey,
) {
  const input = `${b64(header)}.${b64(payload)}`;
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-384' },
    key,
    new TextEncoder().encode(input),
  );
  return `${input}.${Buffer.from(signature).toString('base64url')}`;
}

function claims(overrides: Record<string, unknown> = {}) {
  return {
    schema: 1,
    rpl: 'reuse',
    iss: ISSUER,
    aud: JUMP,
    sub: 'jump-redirect',
    iat: NOW,
    nbf: NOW,
    exp: NOW + 30,
    jti: 'jti-0123456789',
    dst: 'internal',
    url: `${TARGET}/receive?state=s1`,
    ...overrides,
  };
}

function header(environment: JumpEnvironment = 'production', overrides = {}) {
  return { typ: tokenTypes(environment).inbound, alg: 'ES384', kid: KID, ...overrides };
}

function app(environment: JumpEnvironment = 'production', keys: JWK[] = [issuerJwk]) {
  const fetchJwks = vi.fn(async () => ({ keys }));
  const audit = vi.fn();
  return {
    fetchJwks,
    audit,
    app: createApp({
      registry: REGISTRY,
      fetchJwks,
      config: { serviceOrigin: JUMP, environment },
      signer: new JoseOutboundSigner(jumpKeys.privateKey, 'jump-active'),
      now: () => NOW,
      auditLog: audit,
    }),
  };
}

const NAV = {
  'Sec-Fetch-Site': 'cross-site',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Dest': 'document',
};

async function expectDenied(response: Response) {
  expect(response.status).toBe(400);
  expect(response.headers.get('X-Jump-Error')).toBe('invalid_request');
  expect(response.headers.get('Location')).toBeNull();
  expect(response.headers.get('Cache-Control')).toBe('no-store');
}

describe('explicit typing per deployment', () => {
  test('staging accepts jump-request+jwt and signs jump-return+jwt', async () => {
    const { app: staging } = app('staging');
    const rt = await rawToken(header('staging'), claims());
    const response = await staging.request(`${JUMP}/?rt=${rt}`, { headers: NAV });
    expect(response.status).toBe(302);
    const outbound = new URL(String(response.headers.get('Location'))).searchParams.get('rt');
    expect(decodeProtectedHeader(String(outbound))).toEqual({
      typ: 'jump-return+jwt',
      alg: 'ES384',
      kid: 'jump-active',
    });
    await expect(
      jwtVerify(String(outbound), jumpKeys.publicKey, {
        typ: 'jump-return+jwt',
        algorithms: ['ES384'],
        currentDate: new Date(NOW * 1000),
      }),
    ).resolves.toBeDefined();
  });

  test('production keeps schema-1 JWT in and out', async () => {
    const { app: production } = app('production');
    const response = await production.request(
      `${JUMP}/?rt=${await rawToken(header('production'), claims())}`,
    );
    expect(response.status).toBe(302);
    const outbound = new URL(String(response.headers.get('Location'))).searchParams.get('rt');
    expect(decodeProtectedHeader(String(outbound)).typ).toBe('JWT');
  });

  test.each([
    ['staging', 'JWT'],
    ['staging', undefined],
    ['staging', 'jwt'],
    ['staging', 'Jump-Request+JWT'],
    ['staging', 'application/jump-request+jwt'],
    ['staging', 'jump-return+jwt'],
    ['staging', ' jump-request+jwt'],
    ['staging', ['jump-request+jwt']],
    ['production', 'jump-request+jwt'],
    ['production', 'jump-return+jwt'],
    ['production', undefined],
    ['production', 'JOSE'],
  ] as const)('%s refuses typ %j before any JWKS fetch', async (environment, typ) => {
    const { app: instance, fetchJwks } = app(environment);
    const h: Record<string, unknown> = { ...header(environment), typ };
    if (typ === undefined) delete h.typ;
    await expectDenied(await instance.request(`${JUMP}/?rt=${await rawToken(h, claims())}`));
    expect(fetchJwks).not.toHaveBeenCalled();
  });

  test('an unknown deployment environment is a configuration failure', () => {
    expect(() =>
      resolveJumpConfig(
        { edge: 'cloudflare', production: true },
        { serviceOrigin: JUMP, environment: 'preview' as JumpEnvironment },
      ),
    ).toThrow(expect.objectContaining({ code: 'signer_unavailable' }));
  });
});

describe('closed protected header', () => {
  test.each([
    ['crit', ['exp']],
    ['jku', `${ISSUER}/.well-known/jwks.json`],
    ['jwk', { kty: 'EC' }],
    ['x5u', 'https://evil.example/cert'],
    ['x5c', ['AAAA']],
    ['x5t', 'AAAA'],
    ['x5t#S256', 'AAAA'],
    ['cty', 'JWT'],
    ['b64', false],
    ['zip', 'DEF'],
    ['enc', 'A256GCM'],
    ['url', 'https://evil.example'],
    ['nonce', 'n'],
    ['iss', ISSUER],
    ['custom', 1],
  ])('member %s is refused before fetch', async (name, value) => {
    const { app: instance, fetchJwks } = app();
    const rt = await rawToken({ ...header(), [name]: value }, claims());
    await expectDenied(await instance.request(`${JUMP}/?rt=${rt}`));
    expect(fetchJwks).not.toHaveBeenCalled();
  });

  test.each([
    'none',
    'HS256',
    'HS384',
    'RS256',
    'PS384',
    'ES256',
    'ES512',
    'EdDSA',
    'es384',
    '',
    null,
    1,
  ])('alg %j is refused before fetch', async (alg) => {
    const { app: instance, fetchJwks } = app();
    await expectDenied(
      await instance.request(`${JUMP}/?rt=${await rawToken({ ...header(), alg }, claims())}`),
    );
    expect(fetchJwks).not.toHaveBeenCalled();
  });

  test.each([
    ['empty', ''],
    ['129 characters', 'k'.repeat(129)],
    ['NUL', 'kid\u0000x'],
    ['LF', 'kid\nx'],
    ['DEL', 'kid\u007f'],
    ['C1 NEL', 'kid\u0085'],
    ['number', 1],
    ['null', null],
    ['array', [KID]],
    ['object', { kid: KID }],
    ['boolean', true],
  ])('kid %s is refused before fetch', async (_label, kid) => {
    const { app: instance, fetchJwks } = app();
    await expectDenied(
      await instance.request(`${JUMP}/?rt=${await rawToken({ ...header(), kid }, claims())}`),
    );
    expect(fetchJwks).not.toHaveBeenCalled();
  });

  test('kid is compared exactly: 128 characters works, a case variant does not', async () => {
    const long = 'K'.repeat(128);
    const { app: instance } = app('production', [{ ...issuerJwk, kid: long }]);
    const ok = await instance.request(
      `${JUMP}/?rt=${await rawToken({ ...header(), kid: long }, claims())}`,
    );
    expect(ok.status).toBe(302);
    const variant = await instance.request(
      `${JUMP}/?rt=${await rawToken({ ...header(), kid: long.toLowerCase() }, claims())}`,
    );
    await expectDenied(variant);
  });
});

describe('compact serialization', () => {
  test.each([
    ['two segments', (t: string) => t.split('.').slice(0, 2).join('.')],
    ['four segments', (t: string) => `${t}.AAAA`],
    ['empty payload', (t: string) => t.replace(/\.[^.]+\./, '..')],
    ['padding', (t: string) => `${t.split('.')[0]}=.${t.split('.').slice(1).join('.')}`],
    ['signature 127 characters', (t: string) => t.slice(0, -1)],
    ['signature 129 characters', (t: string) => `${t}A`],
    [
      'impossible base64 length',
      (t: string) => `${t.split('.')[0]}A.${t.split('.').slice(1).join('.')}`,
    ],
  ])('%s is rejected before fetch', async (_label, mutate) => {
    const { app: instance, fetchJwks, audit } = app();
    const rt = mutate(await rawToken(header(), claims()));
    await expectDenied(await instance.request(`${JUMP}/?rt=${encodeURIComponent(rt)}`));
    expect(fetchJwks).not.toHaveBeenCalled();
    expect(JSON.stringify(audit.mock.calls)).not.toContain(rt.slice(0, 40));
  });

  test('invalid UTF-8 in the header is malformed, not a 500', async () => {
    const { app: instance, fetchJwks } = app();
    const bytes = Buffer.from([0x7b, 0xff, 0x7d]).toString('base64url');
    const token = `${bytes}.${b64(claims())}.${'A'.repeat(128)}`;
    await expectDenied(await instance.request(`${JUMP}/?rt=${token}`));
    expect(fetchJwks).not.toHaveBeenCalled();
  });

  test.each([MAX_TOKEN_LENGTH, MAX_TOKEN_LENGTH + 1])(
    'a %i-character token is refused; only the larger one skips decoding',
    async (length) => {
      const { app: instance, fetchJwks } = app();
      const base = await rawToken(header(), claims());
      const [h, p] = base.split('.');
      const padded = `${h}.${String(p)}${'A'.repeat(length - base.length)}.${'A'.repeat(128)}`;
      expect(padded).toHaveLength(length);
      await expectDenied(await instance.request(`${JUMP}/?rt=${padded}`));
      expect(fetchJwks).not.toHaveBeenCalled();
    },
  );
});

describe('raw entry query form', () => {
  test.each([
    ['duplicate rt', (t: string) => `?rt=${t}&rt=${t}`],
    ['rt[]', (t: string) => `?rt[]=${t}`],
    ['rt[x]', (t: string) => `?rt[x]=${t}`],
    ['percent-encoded key %72t', (t: string) => `?%72t=${t}`],
    ['percent-encoded key r%74', (t: string) => `?r%74=${t}`],
    ['uppercase key', (t: string) => `?RT=${t}`],
    ['empty rt', () => '?rt='],
    ['space %20', (t: string) => `?rt=%20${t}`],
    ['plus', (t: string) => `?rt=+${t}`],
    ['encoded plus %2B', (t: string) => `?rt=${t}%2B`],
    ['encoded dot', (t: string) => `?rt=${t.replace('.', '%2E')}`],
    ['semicolon', (t: string) => `?rt=${t};x=1`],
    ['malformed percent', (t: string) => `?rt=${t}%zz`],
    ['leading parameter', (t: string) => `?x=1&rt=${t}`],
    ['trailing parameter', (t: string) => `?rt=${t}&x=1`],
    ['trailing ampersand', (t: string) => `?rt=${t}&`],
    ['bare rt key', () => '?rt'],
    ['slash in value', (t: string) => `?rt=${t}/`],
    ['backslash in value', (t: string) => `?rt=${t}%5C`],
  ])('%s is refused before fetch', async (_label, query) => {
    const { app: instance, fetchJwks } = app();
    const rt = await rawToken(header(), claims());
    await expectDenied(await instance.request(`${JUMP}/${query(rt)}`));
    expect(fetchJwks).not.toHaveBeenCalled();
  });

  test('handleJump itself refuses a non-canonical entry query', async () => {
    const response = await handleJump(new Request(`${JUMP}/?rt=a.b.c&x=1`), {
      registry: REGISTRY,
      jwksCache: new JwksCache(async () => ({ keys: [issuerJwk] })),
      runtime: { edge: 'cloudflare', production: true },
      signer: new JoseOutboundSigner(jumpKeys.privateKey, 'jump-active'),
      config: { serviceOrigin: JUMP, environment: 'production' },
    });
    expect(response.status).toBe(400);
  });
});

describe('closed request claim set', () => {
  const verify = (payload: Record<string, unknown>) =>
    rawToken(header(), payload).then((token) =>
      verifyJumpJwt(token, REGISTRY, new JwksCache(async () => ({ keys: [issuerJwk] })), NOW, JUMP),
    );

  const SUBSTITUTES: Array<[string, unknown]> = [
    ['null', null],
    ['empty string', ''],
    ['zero', 0],
    ['negative', -1],
    ['fraction', 1.5],
    ['huge', Number.MAX_SAFE_INTEGER],
    ['NUL string', 'a\u0000b'],
    ['array', []],
    ['object', {}],
    ['boolean', true],
  ];
  const FIELDS = ['schema', 'rpl', 'iss', 'aud', 'sub', 'iat', 'nbf', 'exp', 'jti', 'dst', 'url'];

  test.each(FIELDS)('missing %s is rejected', async (field) => {
    const payload: Record<string, unknown> = claims();
    delete payload[field];
    await expect(verify(payload)).rejects.toHaveProperty('code');
  });

  test.each(FIELDS.flatMap((field) => SUBSTITUTES.map(([label, value]) => [field, label, value])))(
    '%s as %s is rejected',
    async (field, _label, value) => {
      await expect(verify(claims({ [String(field)]: value }))).rejects.toHaveProperty('code');
    },
  );

  test.each([
    ['unknown claim', { extra: 1 }],
    ['outbound-only src', { src: ISSUER }],
    ['outbound claim nonce', { nonce: 'x' }],
    ['aud as array containing Jump', { aud: [JUMP] }],
    ['dst external', { dst: 'external' }],
    ['schema 2', { schema: 2 }],
    ['schema "1"', { schema: '1' }],
    ['rpl once', { rpl: 'once' }],
    ['jti with space', { jti: 'a b' }],
    ['jti non-ASCII', { jti: 'jtié' }],
    ['jti 129 characters', { jti: 'j'.repeat(129) }],
    ['url 2049 characters', { url: `${TARGET}/?q=${'a'.repeat(2049 - 28)}` }],
    ['url with CR', { url: `${TARGET}/\r` }],
    ['url with DEL', { url: `${TARGET}/\u007f` }],
    ['iat after year 2100', { iat: 4_102_444_801 }],
  ])('%s is rejected', async (_label, overrides) => {
    await expect(verify(claims(overrides))).rejects.toHaveProperty('code');
  });

  test.each([
    ['jti 128 characters', { jti: 'j'.repeat(128) }],
    ['jti 1 character', { jti: 'j' }],
    ['url 2048 characters', { url: `${TARGET}/?q=${'a'.repeat(2048 - 28)}` }],
    ['TTL 1', { exp: NOW + 1 }],
    ['TTL 30', { exp: NOW + 30 }],
  ])('%s is accepted', async (_label, overrides) => {
    await expect(verify(claims(overrides))).resolves.toBeDefined();
  });

  test.each([
    ['TTL 31', { exp: NOW + 31 }],
    ['exp equal to iat', { exp: NOW }],
    ['expired beyond skew', { iat: NOW - 40, nbf: NOW - 40, exp: NOW - 10 }],
    ['nbf beyond skew', { iat: NOW + 6, nbf: NOW + 6, exp: NOW + 30 }],
    ['nbf after exp', { iat: NOW, nbf: NOW + 3, exp: NOW + 1 }],
    ['iat beyond skew', { iat: NOW + 6, nbf: NOW, exp: NOW + 30 }],
  ])('%s is rejected', async (_label, overrides) => {
    await expect(verify(claims(overrides))).rejects.toHaveProperty('code');
  });

  test('a payload altered after signing fails verification', async () => {
    const token = await rawToken(header(), claims());
    const [h, , s] = token.split('.');
    const altered = `${h}.${b64(claims({ url: `${TARGET}/other` }))}.${s}`;
    await expect(
      verifyJumpJwt(
        altered,
        REGISTRY,
        new JwksCache(async () => ({ keys: [issuerJwk] })),
        NOW,
        JUMP,
      ),
    ).rejects.toMatchObject({ code: 'invalid_signature' });
  });
});

describe('issuer JWK Set profile', () => {
  async function jwk(overrides: Record<string, unknown> = {}) {
    const { publicKey } = await generateKeyPair('ES384');
    return { ...(await exportJWK(publicKey)), kid: 'k', alg: 'ES384', use: 'sig', ...overrides };
  }

  test('one key, a three-key rotation set and the maximum are accepted', async () => {
    expect((await importIssuerJwks({ keys: [await jwk()] })).size).toBe(1);
    const rotation = [
      await jwk({ kid: 'prev' }),
      await jwk({ kid: 'cur' }),
      await jwk({ kid: 'next' }),
    ];
    expect([...(await importIssuerJwks({ keys: rotation })).keys()]).toEqual([
      'prev',
      'cur',
      'next',
    ]);
    const max = await Promise.all(
      Array.from({ length: MAX_ISSUER_JWKS_KEYS }, (_, i) => jwk({ kid: `k${i}` })),
    );
    expect((await importIssuerJwks({ keys: max })).size).toBe(MAX_ISSUER_JWKS_KEYS);
  });

  test('remote-reference members are ignored, never dereferenced', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      const keys = await importIssuerJwks({
        keys: [
          await jwk({ x5u: 'https://evil.example/x', jku: 'https://evil.example/j', x5c: ['A'] }),
        ],
      });
      expect(keys.size).toBe(1);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test.each([
    ['not an object', async () => null],
    ['keys missing', async () => ({})],
    ['keys not an array', async () => ({ keys: {} })],
    ['empty set', async () => ({ keys: [] })],
    [
      'too many keys',
      async () => ({
        keys: await Promise.all(
          Array.from({ length: MAX_ISSUER_JWKS_KEYS + 1 }, (_, i) => jwk({ kid: `k${i}` })),
        ),
      }),
    ],
    ['non-object entry', async () => ({ keys: [await jwk(), 'key'] })],
    ['duplicate kid', async () => ({ keys: [await jwk({ kid: 'd' }), await jwk({ kid: 'd' })] })],
    ['private d', async () => ({ keys: [await jwk({ d: 'AAAA' })] })],
    ['symmetric k', async () => ({ keys: [await jwk({ k: 'AAAA' })] })],
    ['RSA p', async () => ({ keys: [await jwk({ p: 'AAAA' })] })],
    ['kty RSA', async () => ({ keys: [await jwk({ kty: 'RSA' })] })],
    ['kty oct', async () => ({ keys: [await jwk({ kty: 'oct' })] })],
    ['crv P-256', async () => ({ keys: [await jwk({ crv: 'P-256' })] })],
    ['alg ES256', async () => ({ keys: [await jwk({ alg: 'ES256' })] })],
    ['alg missing', async () => ({ keys: [await jwk({ alg: undefined })] })],
    ['use enc', async () => ({ keys: [await jwk({ use: 'enc' })] })],
    ['use missing', async () => ({ keys: [await jwk({ use: undefined })] })],
    ['kid empty', async () => ({ keys: [await jwk({ kid: '' })] })],
    ['kid 129', async () => ({ keys: [await jwk({ kid: 'k'.repeat(129) })] })],
    ['kid NUL', async () => ({ keys: [await jwk({ kid: 'k\u0000' })] })],
    ['kid number', async () => ({ keys: [await jwk({ kid: 7 })] })],
    ['x too short', async () => ({ keys: [await jwk({ x: 'A'.repeat(63) })] })],
    ['y padded', async () => ({ keys: [await jwk({ y: `${'A'.repeat(62)}==` })] })],
    ['x not base64url', async () => ({ keys: [await jwk({ x: `${'A'.repeat(63)}+` })] })],
    [
      'point not on the curve',
      async () => ({ keys: [await jwk({ x: 'A'.repeat(64), y: 'A'.repeat(64) })] }),
    ],
    ['key_ops sign', async () => ({ keys: [await jwk({ key_ops: ['sign'] })] })],
    ['key_ops string', async () => ({ keys: [await jwk({ key_ops: 'verify' })] })],
    ['key_ops with extra', async () => ({ keys: [await jwk({ key_ops: ['verify', 'sign'] })] })],
  ])('%s rejects the whole set', async (_label, build) => {
    await expect(importIssuerJwks(await build())).rejects.toMatchObject({
      code: 'jwks_bad_gateway',
    });
  });

  test('key_ops ["verify"] is accepted', async () => {
    expect((await importIssuerJwks({ keys: [await jwk({ key_ops: ['verify'] })] })).size).toBe(1);
  });
});

describe('issuer JWKS transport', () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined));

  const stub = (response: () => Response | Promise<Response>) => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => response());
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };
  const doc = () => JSON.stringify({ keys: [issuerJwk] });

  test('the request carries no credentials, bypasses caches and refuses redirects', async () => {
    const fetchMock = stub(
      () => new Response(doc(), { headers: { 'Content-Type': 'application/json' } }),
    );
    await fetchRegistryJwks(ISSUER_CONFIG);
    expect(fetchMock).toHaveBeenCalledWith(`${ISSUER}/.well-known/jwks.json`, {
      headers: { Accept: 'application/jwk-set+json, application/json' },
      cache: 'no-store',
      redirect: 'manual',
    });
  });

  test.each([
    'application/jwk-set+json',
    'application/json',
    'application/json; charset=utf-8',
    'APPLICATION/JSON;charset=UTF-8',
    'application/jwk-set+json; charset="utf-8"',
  ])('Content-Type %s is accepted', async (type) => {
    stub(() => new Response(doc(), { headers: { 'Content-Type': type } }));
    await expect(fetchRegistryJwks(ISSUER_CONFIG)).resolves.toEqual({ keys: [issuerJwk] });
  });

  test.each([
    null,
    '',
    'text/plain',
    'text/json',
    'application/jwk+json',
    'application/problem+json',
    'application/jsonx',
    'application/json;',
    'application/json; charset=iso-8859-1',
    'application/json; profile=x',
    'application/json; charset=utf-8; x=y',
  ])('Content-Type %j is rejected', async (type) => {
    stub(() => {
      const response = new Response(doc());
      response.headers.delete('Content-Type');
      if (type !== null) response.headers.set('Content-Type', type);
      return response;
    });
    await expect(fetchRegistryJwks(ISSUER_CONFIG)).rejects.toMatchObject({
      code: 'jwks_bad_gateway',
    });
  });

  test.each([
    [201, 'jwks_bad_gateway'],
    [203, 'jwks_bad_gateway'],
    [204, 'jwks_bad_gateway'],
    [301, 'jwks_bad_gateway'],
    [302, 'jwks_bad_gateway'],
    [304, 'jwks_bad_gateway'],
    [307, 'jwks_bad_gateway'],
    [400, 'jwks_bad_gateway'],
    [404, 'jwks_bad_gateway'],
    [429, 'jwks_unavailable'],
    [500, 'jwks_unavailable'],
    [503, 'jwks_unavailable'],
  ])('status %i is %s', async (status, code) => {
    stub(
      () =>
        new Response([204, 304].includes(status) ? null : doc(), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    await expect(fetchRegistryJwks(ISSUER_CONFIG)).rejects.toMatchObject({ code });
  });

  test('a chunked body without Content-Length is read up to the cap', async () => {
    const text = doc();
    stub(
      () =>
        new Response(
          new ReadableStream({
            start(controller) {
              for (const part of [text.slice(0, 10), text.slice(10)])
                controller.enqueue(new TextEncoder().encode(part));
              controller.close();
            },
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
    );
    await expect(fetchRegistryJwks(ISSUER_CONFIG)).resolves.toEqual({ keys: [issuerJwk] });
  });

  test.each([
    ['exactly 64 KiB', MAX_JWKS_BYTES, 'resolve'],
    ['one byte over', MAX_JWKS_BYTES + 1, 'reject'],
  ])('a body of %s', async (_label, size, outcome) => {
    const prefix = '{"keys":[],"pad":"';
    const body = `${prefix}${'a'.repeat(size - prefix.length - 2)}"}`;
    expect(body).toHaveLength(size);
    stub(() => new Response(body, { headers: { 'Content-Type': 'application/json' } }));
    const result = fetchRegistryJwks(ISSUER_CONFIG);
    if (outcome === 'resolve') await expect(result).resolves.toBeDefined();
    else await expect(result).rejects.toMatchObject({ code: 'jwks_bad_gateway' });
  });

  test('a false, small Content-Length does not lift the streaming cap', async () => {
    let pulled = 0;
    stub(
      () =>
        new Response(
          new ReadableStream({
            pull(controller) {
              pulled += 1;
              controller.enqueue(new Uint8Array(16 * 1024).fill(0x20));
            },
          }),
          { headers: { 'Content-Type': 'application/json', 'Content-Length': '10' } },
        ),
    );
    await expect(fetchRegistryJwks(ISSUER_CONFIG)).rejects.toMatchObject({
      code: 'jwks_bad_gateway',
    });
    expect(pulled).toBeLessThanOrEqual(6);
  });

  test('a small compressed body is capped on its decompressed bytes', async () => {
    const { gzipSync } = await import('node:zlib');
    const compressed = gzipSync(Buffer.alloc(1024 * 1024, 0x20));
    expect(compressed.byteLength).toBeLessThan(MAX_JWKS_BYTES);
    let decompressed = 0;
    stub(
      () =>
        new Response(
          new Blob([compressed])
            .stream()
            .pipeThrough(new DecompressionStream('gzip'))
            .pipeThrough(
              new TransformStream<Uint8Array, Uint8Array>({
                transform(chunk, controller) {
                  decompressed += chunk.byteLength;
                  controller.enqueue(chunk);
                },
              }),
            ),
          { headers: { 'Content-Type': 'application/json' } },
        ),
    );
    await expect(fetchRegistryJwks(ISSUER_CONFIG)).rejects.toMatchObject({
      code: 'jwks_bad_gateway',
    });
    expect(decompressed).toBeLessThan(1024 * 1024);
  });

  test('a slow body is cut off by the request deadline', async () => {
    stub(
      () =>
        new Response(new ReadableStream({ pull: () => new Promise(() => {}) }), {
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    await expect(fetchRegistryJwks(ISSUER_CONFIG, AbortSignal.timeout(20))).rejects.toMatchObject({
      code: 'deadline_exceeded',
    });
  });

  test('a connection failure is temporary', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed');
    });
    await expect(fetchRegistryJwks(ISSUER_CONFIG)).rejects.toMatchObject({
      code: 'jwks_unavailable',
    });
  });
});

describe('prepublish-first key rotation (mock issuer)', () => {
  test('publish → fetch → switch → retire, with outage and invalid-document phases', async () => {
    vi.useFakeTimers();
    try {
      const oldPair = await generateKeyPair('ES384');
      const newPair = await generateKeyPair('ES384');
      const oldJwk = {
        ...(await exportJWK(oldPair.publicKey)),
        kid: 'old',
        alg: 'ES384',
        use: 'sig',
      };
      const newJwk = {
        ...(await exportJWK(newPair.publicKey)),
        kid: 'new',
        alg: 'ES384',
        use: 'sig',
      };
      let published: unknown = { keys: [oldJwk] };
      let failure: 'none' | 'outage' = 'none';
      const fetchJwks = vi.fn(async () => {
        if (failure === 'outage') {
          const { JumpError } = await import('../src/core/types');
          throw new JumpError('jwks_unavailable');
        }
        return published;
      });
      const cache = new JwksCache(fetchJwks);
      const verify = async (kid: string, key: CryptoKey) => {
        const now = Math.floor(Date.now() / 1000);
        const token = await rawToken(
          { typ: 'JWT', alg: 'ES384', kid },
          claims({ iat: now, nbf: now, exp: now + 30 }),
          key,
        );
        return verifyJumpJwt(token, REGISTRY, cache, now, JUMP);
      };
      const oldKey = oldPair.privateKey as CryptoKey;
      const newKey = newPair.privateKey as CryptoKey;

      // 1. old key published and signing.
      await verify('old', oldKey);
      expect(fetchJwks).toHaveBeenCalledTimes(1);
      // 2. new key prepublished; the cache picks it up on its normal 30 s refresh.
      published = { keys: [oldJwk, newJwk] };
      vi.advanceTimersByTime(30_000);
      await verify('old', oldKey);
      expect(fetchJwks).toHaveBeenCalledTimes(2);
      // 3./4. signer switches to the new kid: no forced refresh needed.
      await verify('new', newKey);
      expect(fetchJwks).toHaveBeenCalledTimes(2);
      // 5. old key still published: in-flight old tokens keep verifying.
      await verify('old', oldKey);
      // 6. old key removed: once the cache refreshes, old tokens are refused.
      published = { keys: [newJwk] };
      vi.advanceTimersByTime(30_000);
      await verify('new', newKey);
      await expect(verify('old', oldKey)).rejects.toMatchObject({ code: 'invalid_signature' });
      // 7. temporary JWKS failure: a known key inside 30 s still verifies;
      //    past 30 s the request fails closed as 503-class.
      vi.advanceTimersByTime(30_000);
      failure = 'outage';
      await expect(verify('new', newKey)).rejects.toMatchObject({ code: 'jwks_unavailable' });
      vi.advanceTimersByTime(30_000);
      failure = 'none';
      await verify('new', newKey);
      // 8. invalid 200 document: not an outage, not cached, warm keys past TTL unused.
      published = { keys: [{ ...newJwk, use: 'enc' }] };
      vi.advanceTimersByTime(30_000);
      await expect(verify('new', newKey)).rejects.toMatchObject({ code: 'jwks_bad_gateway' });
    } finally {
      vi.useRealTimers();
    }
  });

  test('signing with a kid before it is cached costs one forced refresh, then cooldown', async () => {
    const pair = await generateKeyPair('ES384');
    const early = { ...(await exportJWK(pair.publicKey)), kid: 'early', alg: 'ES384', use: 'sig' };
    let published: unknown = { keys: [issuerJwk] };
    const fetchJwks = vi.fn(async () => published);
    const cache = new JwksCache(fetchJwks);
    await cache.getKey(ISSUER_CONFIG, KID);
    published = { keys: [issuerJwk, early] };
    await expect(cache.getKey(ISSUER_CONFIG, 'early')).resolves.toBeDefined();
    expect(fetchJwks).toHaveBeenCalledTimes(2);
  });
});

describe('outbound return token and response', () => {
  test('claims, header, lifetime and Location are exact; inbound rt is not exposed', async () => {
    const { app: instance } = app('staging');
    const rt = await rawToken(header('staging'), claims());
    const response = await instance.request(`${JUMP}/?rt=${rt}`, { headers: NAV });
    expect(response.status).toBe(302);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    const location = String(response.headers.get('Location'));
    expect(location).not.toContain(rt);
    const url = new URL(location);
    expect(url.searchParams.getAll('rt')).toHaveLength(1);
    const outbound = String(url.searchParams.get('rt'));
    const { payload, protectedHeader } = await jwtVerify(outbound, jumpKeys.publicKey, {
      typ: 'jump-return+jwt',
      algorithms: ['ES384'],
      issuer: JUMP,
      audience: TARGET,
      currentDate: new Date(NOW * 1000),
    });
    expect(Object.keys(protectedHeader).sort()).toEqual(['alg', 'kid', 'typ']);
    expect(Object.keys(payload).sort()).toEqual(
      [
        'aud',
        'dst',
        'exp',
        'iat',
        'iss',
        'jti',
        'nbf',
        'rpl',
        'schema',
        'src',
        'sub',
        'url',
      ].sort(),
    );
    expect(payload).toMatchObject({ rpl: 'reuse', src: ISSUER, iat: NOW, nbf: NOW, exp: NOW + 30 });
    expect(payload.jti).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    url.searchParams.delete('rt');
    expect(payload.url).toBe(url.href);
  });

  test('two evaluations of one inbound token get distinct jti values (no replay state)', async () => {
    const { app: instance } = app();
    const rt = await rawToken(header(), claims());
    const jtis = new Set<unknown>();
    for (let i = 0; i < 3; i += 1) {
      const response = await instance.request(`${JUMP}/?rt=${rt}`);
      expect(response.status).toBe(302);
      const outbound = new URL(String(response.headers.get('Location'))).searchParams.get('rt');
      jtis.add(
        (
          await jwtVerify(String(outbound), jumpKeys.publicKey, {
            currentDate: new Date(NOW * 1000),
          })
        ).payload.jti,
      );
    }
    expect(jtis.size).toBe(3);
  });
});

describe('Cloudflare adapter deployment environment', () => {
  beforeEach(() => {
    resetIsolateCachesForTest();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const ORIGIN = 'https://jump.umaxica.net';
  const WORKER_ISSUER = 'https://auth.umaxica.app';

  async function env(environment: string | undefined): Promise<CloudflareEnv> {
    return {
      UMAXICA_JUMP_ORIGIN: ORIGIN,
      ...(environment === undefined ? {} : { UMAXICA_JUMP_ENVIRONMENT: environment }),
      JUMP_RATE_LIMITER: { limit: async () => ({ success: true }) },
      UMAXICA_JUMP_PRIVATE_KEY_PEM: await exportPKCS8(jumpKeys.privateKey),
      UMAXICA_JUMP_PRIVATE_KEY_KID: 'active',
      UMAXICA_JUMP_PUBLIC_JWKS: JSON.stringify({
        keys: [
          { ...(await exportJWK(jumpKeys.publicKey)), kid: 'active', alg: 'ES384', use: 'sig' },
        ],
      }),
    };
  }

  async function send(settings: CloudflareEnv, typ: string, path?: string) {
    vi.stubGlobal('fetch', async () => Response.json({ keys: [issuerJwk] }));
    const now = Math.floor(Date.now() / 1000);
    const rt = await rawToken(
      { typ, alg: 'ES384', kid: KID },
      claims({
        iss: WORKER_ISSUER,
        aud: ORIGIN,
        iat: now,
        nbf: now,
        exp: now + 30,
        url: 'https://www.umaxica.app/',
      }),
    );
    return worker.fetch(
      new Request(`${ORIGIN}${path ?? `/?rt=${rt}`}`, {
        headers: { 'CF-Connecting-IP': '203.0.113.7', ...NAV },
      }),
      settings,
      {} as ExecutionContext,
    );
  }

  test.each([undefined, '', 'Production', 'prod', 'preview'])(
    'environment %j fails closed for every route',
    async (value) => {
      const settings = await env(value);
      for (const path of [undefined, '/about']) {
        const response = await send(settings, 'JWT', path);
        expect(response.status).toBe(503);
        expect(response.headers.get('X-Jump-Error')).toBe('service_unavailable');
      }
    },
  );

  test('staging deployment enforces the explicit types end to end', async () => {
    const settings = await env('staging');
    const legacy = await send(settings, 'JWT');
    expect(legacy.status).toBe(400);
    const strict = await send(settings, 'jump-request+jwt');
    expect(strict.status).toBe(302);
    const outbound = new URL(String(strict.headers.get('Location'))).searchParams.get('rt');
    expect(decodeProtectedHeader(String(outbound)).typ).toBe('jump-return+jwt');
  });

  test('switching environment with the same origin and version rebuilds the app', async () => {
    expect((await send(await env('production'), 'JWT')).status).toBe(302);
    expect((await send(await env('staging'), 'JWT')).status).toBe(400);
  });
});

describe('wrangler deployment configuration', () => {
  type Env = {
    routes?: unknown[];
    workers_dev?: boolean;
    vars?: Record<string, string>;
    ratelimits?: Array<{ name: string; namespace_id: string }>;
    observability?: { redact_query_string?: boolean };
    version_metadata?: { binding?: string };
  };
  const config = async () => {
    const { readFileSync } = await import('node:fs');
    const text = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
    return JSON.parse(text.replaceAll(/^\s*\/\/.*$/gm, '')) as Env & { env: { staging: Env } };
  };

  test('production states its environment explicitly', async () => {
    expect((await config()).vars?.UMAXICA_JUMP_ENVIRONMENT).toBe('production');
  });

  test('staging cannot take the production route, origin, key or limiter namespace', async () => {
    const top = await config();
    const staging = top.env.staging;
    expect(staging.routes).toEqual([]);
    expect(staging.workers_dev).toBe(false);
    expect(staging.vars).toEqual({ UMAXICA_JUMP_ENVIRONMENT: 'staging' });
    expect(staging.observability?.redact_query_string).toBe(true);
    expect(staging.version_metadata).toEqual(top.version_metadata);
    expect(staging.ratelimits?.map((r) => r.name)).toEqual(['JUMP_RATE_LIMITER']);
    expect(staging.ratelimits?.[0]?.namespace_id).not.toBe(top.ratelimits?.[0]?.namespace_id);
  });
});

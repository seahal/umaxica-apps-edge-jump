import { assertDefined } from './assert-defined';
import { beforeAll, afterEach, expect, test, vi } from 'vitest';
import { exportJWK, exportPKCS8, generateKeyPair, importJWK, jwtVerify, SignJWT } from 'jose';
import worker, { resetIsolateCachesForTest, type CloudflareEnv } from '../src/cloudflare';
import { normalizeUrl, validateServiceOrigin } from '../src/core/normalize_url';

const origin = 'https://jump-next.example';
let env: CloudflareEnv;
let pair: Awaited<ReturnType<typeof generateKeyPair>>;
beforeAll(async () => {
  pair = await generateKeyPair('ES384', { extractable: true });
  env = {
    UMAXICA_JUMP_ORIGIN: origin,
    UMAXICA_JUMP_PRIVATE_KEY_KID: 'active',
    UMAXICA_JUMP_PRIVATE_KEY_PEM: await exportPKCS8(pair.privateKey),
    UMAXICA_JUMP_PUBLIC_JWKS: JSON.stringify({
      keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'active', alg: 'ES384', use: 'sig' }],
    }),
    JUMP_RATE_LIMITER: { limit: async () => ({ success: true }) },
  };
});
afterEach(() => {
  resetIsolateCachesForTest();
  vi.restoreAllMocks();
});
const JWKS = '/.well-known/jwks.json';
function request(
  path = JWKS,
  settings = env,
  method = 'GET',
  requestOrigin = origin,
  headers: Record<string, string> = {},
) {
  return worker.fetch(
    new Request(`${requestOrigin}${path}`, {
      method,
      headers: { 'CF-Connecting-IP': '203.0.113.7', ...headers },
    }),
    settings,
    {} as ExecutionContext,
  );
}
/** The JWKS route publishes only a keyset that passed the private/public pair check. */
async function signingMaterial(response: Response, ok: boolean, head = false) {
  expect(response.status).toBe(ok ? 200 : 503);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('set-cookie')).toBeNull();
  expect(response.headers.get('location')).toBeNull();
  expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  const text = await response.text();
  if (head) {
    expect(text).toBe('');
    return;
  }
  if (!ok) {
    expect(response.headers.get('x-jump-error')).toBe('service_unavailable');
    expect(text).not.toContain('PRIVATE KEY');
    return;
  }
  expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
  const published = JSON.parse(text) as { keys: Array<Record<string, unknown>> };
  expect(published.keys.map((key) => key.kid)).toContain('active');
  for (const key of published.keys) expect(key).not.toHaveProperty('d');
}
test('jwks reuses the checked bundle without network or repeated private import', async () => {
  const network = vi.spyOn(globalThis, 'fetch');
  const limiter = vi.spyOn(assertDefined(env.JUMP_RATE_LIMITER), 'limit');
  const imports = vi.spyOn(crypto.subtle, 'importKey');
  await signingMaterial(await request(), true);
  const count = imports.mock.calls.length;
  await signingMaterial(await request(), true);
  expect(imports.mock.calls.length).toBe(count);
  expect(network).not.toHaveBeenCalled();
  expect(limiter).toHaveBeenCalledTimes(2);
});
test.each(['GET', 'HEAD'])('%s /ready is not a production interface', async (method) => {
  for (const settings of [env, { ...env, UMAXICA_JUMP_PRIVATE_KEY_PEM: '' }]) {
    const response = await request('/ready', settings, method);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/about');
    expect(response.headers.get('content-type')).not.toBe('application/json');
    const text = await response.text();
    expect(text).not.toContain('ready');
  }
  const json = await request('/ready', env, method, origin, { Accept: 'application/json' });
  expect(json.status).toBe(404);
  expect(await json.text()).toBe('');
});
test.each(['/health', '/health.json'])('%s remains available', async (path) => {
  const response = await request(path, env, 'GET', origin, { Accept: 'application/json' });
  expect(response.status).toBe(200);
  expect(((await response.json()) as { status: string }).status).toBe('OK');
});
test.each([
  'UMAXICA_JUMP_PRIVATE_KEY_PEM',
  'UMAXICA_JUMP_PRIVATE_KEY_KID',
  'UMAXICA_JUMP_PUBLIC_JWKS',
  'JUMP_RATE_LIMITER',
] as const)('missing %s fails closed without details', async (name) => {
  const settings = { ...env };
  delete settings[name];
  await signingMaterial(await request(JWKS, settings), false);
});
test('noncallable limiter fails closed; a limiter call exception stays the approved fail-open', async () => {
  await signingMaterial(
    await request(JWKS, {
      ...env,
      JUMP_RATE_LIMITER: {} as NonNullable<CloudflareEnv['JUMP_RATE_LIMITER']>,
    }),
    false,
  );
  const limit = vi.fn(async () => {
    throw new Error('sensitive-runtime-message');
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  await signingMaterial(await request(JWKS, { ...env, JUMP_RATE_LIMITER: { limit } }), true);
  expect(limit).toHaveBeenCalledTimes(1);
});
test('active kid must be in JWKS', async () => {
  await signingMaterial(
    await request(JWKS, { ...env, UMAXICA_JUMP_PRIVATE_KEY_KID: 'absent' }),
    false,
  );
});
test('private/public mismatch fails closed', async () => {
  const other = await generateKeyPair('ES384', { extractable: true });
  await signingMaterial(
    await request(JWKS, {
      ...env,
      UMAXICA_JUMP_PRIVATE_KEY_PEM: await exportPKCS8(other.privateKey),
    }),
    false,
  );
});
test('secret backend text cannot escape public response or logs', async () => {
  const logs = vi.spyOn(console, 'warn').mockImplementation(() => {});
  await signingMaterial(
    await request(JWKS, {
      ...env,
      UMAXICA_JUMP_PRIVATE_KEY_PEM: {
        get: async () => {
          throw new Error('secret-sentinel');
        },
      },
    }),
    false,
  );
  expect(JSON.stringify(logs.mock.calls)).not.toContain('secret-sentinel');
});
test.each([true, false])('HEAD preserves status and security headers, ok=%s', async (ok) => {
  await signingMaterial(
    await request(JWKS, ok ? env : { ...env, UMAXICA_JUMP_PUBLIC_JWKS: '' }, 'HEAD'),
    ok,
    true,
  );
});
test('health remains liveness when signer is missing', async () => {
  expect((await request('/health.json', { ...env, UMAXICA_JUMP_PRIVATE_KEY_PEM: '' })).status).toBe(
    200,
  );
});
test('origin mismatch is rejected and discloses no configured origin', async () => {
  const jwks = await request(JWKS, env, 'GET', 'https://jump.umaxica.net');
  expect(jwks.status).toBe(400);
  expect(await jwks.text()).not.toContain(origin);
  const response = await request('/about', env, 'GET', 'https://jump.umaxica.net');
  expect(response.status).toBe(400);
  expect(await response.text()).not.toContain(origin);
});
test.each([
  undefined,
  '',
  'https://jump-next.example/path',
  'https://jump-next.example?x',
  'https://jump-next.example#',
  'https://u:p@jump-next.example',
  'https://jump-next.example:444',
  'https://localhost',
  'https://10.0.0.1',
  'not-an-origin',
])('no silent fallback for %s', async (value) => {
  expect(() => validateServiceOrigin(value)).toThrow();
  await signingMaterial(await request(JWKS, { ...env, UMAXICA_JUMP_ORIGIN: value ?? '' }), false);
});
test('alternate origin follows discovery and self-link rejection', async () => {
  for (const path of ['/about', '/robots.txt', '/sitemap.xml']) {
    const response = await request(path);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain(origin);
    expect(text).not.toContain('https://jump.umaxica.net');
    expect(text).not.toContain('/ready');
  }
  expect(() =>
    normalizeUrl(`${origin}/receive`, { edge: 'cloudflare', production: true }, origin),
  ).toThrow();
});
test('alternate origin governs inbound aud and outbound iss', async () => {
  const issuer = await generateKeyPair('ES384', { extractable: true });
  const publicJwk = {
    ...(await exportJWK(issuer.publicKey)),
    kid: 'issuer',
    alg: 'ES384',
    use: 'sig',
  };
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ keys: [publicJwk] }));
  const now = Math.floor(Date.now() / 1000);
  const sign = (aud: string) =>
    new SignJWT({
      schema: 1,
      rpl: 'reuse',
      iss: 'https://auth.umaxica.app',
      aud,
      sub: 'jump-redirect',
      iat: now,
      nbf: now,
      exp: now + 30,
      jti: crypto.randomUUID(),
      dst: 'internal',
      url: 'https://www.umaxica.app/receive',
    })
      .setProtectedHeader({ typ: 'JWT', alg: 'ES384', kid: 'issuer' })
      .sign(issuer.privateKey);
  const response = await request(`/?rt=${await sign(origin)}`);
  expect(response.status).toBe(302);
  const location = new URL(assertDefined(response.headers.get('location')));
  const rt = assertDefined(location.searchParams.get('rt'));
  const verified = await jwtVerify(rt, pair.publicKey, {
    issuer: origin,
    audience: 'https://www.umaxica.app',
  });
  expect(verified.payload.rpl).toBe('reuse');
  expect((await request(`/?rt=${await sign('https://jump.umaxica.net')}`)).status).toBe(400);
});
test('normal activation and rollback retain public verification overlap', async () => {
  const b = await generateKeyPair('ES384', { extractable: true });
  const aJwk = JSON.parse(env.UMAXICA_JUMP_PUBLIC_JWKS as string).keys[0];
  const bJwk = { ...(await exportJWK(b.publicKey)), kid: 'B', alg: 'ES384', use: 'sig' };
  const tokens = await Promise.all(
    [pair.privateKey, b.privateKey].map((key) =>
      new SignJWT({ schema: 1, rpl: 'reuse', probe: 'receiver-overlap' })
        .setProtectedHeader({ alg: 'ES384' })
        .sign(key),
    ),
  );
  for (const [pem, kid, keys] of [
    [assertDefined(env.UMAXICA_JUMP_PRIVATE_KEY_PEM), 'active', [aJwk, bJwk]],
    [await exportPKCS8(b.privateKey), 'B', [bJwk, aJwk]],
    [assertDefined(env.UMAXICA_JUMP_PRIVATE_KEY_PEM), 'active', [aJwk, bJwk]],
  ] as const) {
    const settings = {
      ...env,
      UMAXICA_JUMP_PRIVATE_KEY_PEM: pem,
      UMAXICA_JUMP_PRIVATE_KEY_KID: kid,
      UMAXICA_JUMP_PUBLIC_JWKS: JSON.stringify({ keys }),
    };
    await signingMaterial(await request(JWKS, settings), true);
    const published = (await (await request('/.well-known/jwks.json', settings)).json()) as {
      keys: typeof keys;
    };
    expect(published).toEqual({ keys });
    for (const [index, expectedKid] of ['active', 'B'].entries()) {
      const jwk = published.keys.find((key) => key.kid === expectedKid);
      expect(jwk).toBeDefined();
      const verified = await jwtVerify(
        assertDefined(tokens[index]),
        await importJWK(assertDefined(jwk), 'ES384'),
      );
      expect(verified.payload.rpl).toBe('reuse');
    }
  }
});

test.each([
  'https://jump.local',
  'https://jump.internal',
  'https://jump.home.arpa',
  'https://jump.onion',
  'https://jump.invalid',
  'https://jump.test',
  'https://jump.alt',
  'https://bad_.example',
  'https://-bad.example',
  'https://bad-.example',
  'https://bad..example',
  'https://192.0.2.1',
  'https://192.31.196.1',
  'https://192.52.193.1',
  'https://192.175.48.1',
  'https://[2620:4f:8000::1]',
  'https://198.51.100.1',
  'https://203.0.113.1',
  'https://[2001:db8::1]',
  'https://[3fff::1]',
  'https://[fec0::1]',
])('special-use identity %s fails closed', (value) => {
  expect(() => validateServiceOrigin(value)).toThrow();
});
test('signing-material deadline is coarse and late secret completion cannot publish keys', async () => {
  let complete!: (value: string) => void;
  const settings = {
    ...env,
    UMAXICA_JUMP_PRIVATE_KEY_PEM: {
      get: () =>
        new Promise<string>((resolve) => {
          complete = resolve;
        }),
    },
  };
  const response = await request(JWKS, settings);
  expect(response.status).toBe(504);
  expect(response.headers.get('x-jump-error')).toBe('deadline_exceeded');
  expect(await response.text()).not.toContain('"keys"');
  const pem = env.UMAXICA_JUMP_PRIVATE_KEY_PEM;
  if (typeof pem !== 'string') throw new Error('expected string test key');
  complete(pem);
  await Promise.resolve();
});

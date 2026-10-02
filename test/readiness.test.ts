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
function request(path = '/ready', settings = env, method = 'GET', requestOrigin = origin) {
  return worker.fetch(
    new Request(`${requestOrigin}${path}`, {
      method,
      headers: { 'CF-Connecting-IP': '203.0.113.7' },
    }),
    settings,
    {} as ExecutionContext,
  );
}
async function readiness(response: Response, ready: boolean, head = false) {
  expect(response.status).toBe(ready ? 200 : 503);
  expect(response.headers.get('content-type')).toBe('application/json');
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('set-cookie')).toBeNull();
  expect(response.headers.get('location')).toBeNull();
  expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  expect(await response.text()).toBe(
    head ? '' : JSON.stringify({ status: ready ? 'ready' : 'unavailable' }),
  );
}
test('ready reuses the checked bundle without quota, network or repeated private import', async () => {
  const network = vi.spyOn(globalThis, 'fetch');
  const limiter = vi.spyOn(env.JUMP_RATE_LIMITER!, 'limit');
  const imports = vi.spyOn(crypto.subtle, 'importKey');
  await readiness(await request(), true);
  const count = imports.mock.calls.length;
  await readiness(await request(), true);
  expect(imports.mock.calls.length).toBe(count);
  expect(network).not.toHaveBeenCalled();
  expect(limiter).not.toHaveBeenCalled();
});
test.each([
  'UMAXICA_JUMP_PRIVATE_KEY_PEM',
  'UMAXICA_JUMP_PRIVATE_KEY_KID',
  'UMAXICA_JUMP_PUBLIC_JWKS',
  'JUMP_RATE_LIMITER',
] as const)('missing %s is unavailable without details', async (name) => {
  const settings = { ...env };
  delete settings[name];
  await readiness(await request('/ready', settings), false);
});
test('noncallable limiter is not ready; callable runtime exception is not probed', async () => {
  await readiness(
    await request('/ready', {
      ...env,
      JUMP_RATE_LIMITER: {} as NonNullable<CloudflareEnv['JUMP_RATE_LIMITER']>,
    }),
    false,
  );
  const limit = vi.fn(async () => {
    throw new Error('sensitive-runtime-message');
  });
  await readiness(await request('/ready', { ...env, JUMP_RATE_LIMITER: { limit } }), true);
  expect(limit).not.toHaveBeenCalled();
});
test('active kid must be in JWKS', async () => {
  await readiness(
    await request('/ready', { ...env, UMAXICA_JUMP_PRIVATE_KEY_KID: 'absent' }),
    false,
  );
});
test('private/public mismatch is unavailable', async () => {
  const other = await generateKeyPair('ES384', { extractable: true });
  await readiness(
    await request('/ready', {
      ...env,
      UMAXICA_JUMP_PRIVATE_KEY_PEM: await exportPKCS8(other.privateKey),
    }),
    false,
  );
});
test('secret backend text cannot escape public response or logs', async () => {
  const logs = vi.spyOn(console, 'warn').mockImplementation(() => {});
  await readiness(
    await request('/ready', {
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
test.each([true, false])('HEAD preserves status and security headers, ready=%s', async (ready) => {
  await readiness(
    await request('/ready', ready ? env : { ...env, UMAXICA_JUMP_PUBLIC_JWKS: '' }, 'HEAD'),
    ready,
    true,
  );
});
test('health remains liveness when signer is missing', async () => {
  expect((await request('/health.json', { ...env, UMAXICA_JUMP_PRIVATE_KEY_PEM: '' })).status).toBe(
    200,
  );
});
test('origin mismatch is unavailable and discloses no configured origin', async () => {
  await readiness(await request('/ready', env, 'GET', 'https://jump.umaxica.net'), false);
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
  await readiness(await request('/ready', { ...env, UMAXICA_JUMP_ORIGIN: value ?? '' }), false);
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
      exp: now + 60,
      jti: crypto.randomUUID(),
      dst: 'internal',
      url: 'https://www.umaxica.app/receive',
    })
      .setProtectedHeader({ typ: 'JWT', alg: 'ES384', kid: 'issuer' })
      .sign(issuer.privateKey);
  const response = await request(`/?rt=${await sign(origin)}`);
  expect(response.status).toBe(302);
  const rt = new URL(response.headers.get('location')!).searchParams.get('rt')!;
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
    [env.UMAXICA_JUMP_PRIVATE_KEY_PEM!, 'active', [aJwk, bJwk]],
    [await exportPKCS8(b.privateKey), 'B', [bJwk, aJwk]],
    [env.UMAXICA_JUMP_PRIVATE_KEY_PEM!, 'active', [aJwk, bJwk]],
  ] as const) {
    const settings = {
      ...env,
      UMAXICA_JUMP_PRIVATE_KEY_PEM: pem,
      UMAXICA_JUMP_PRIVATE_KEY_KID: kid,
      UMAXICA_JUMP_PUBLIC_JWKS: JSON.stringify({ keys }),
    };
    await readiness(await request('/ready', settings), true);
    const published = (await (await request('/.well-known/jwks.json', settings)).json()) as {
      keys: typeof keys;
    };
    expect(published).toEqual({ keys });
    for (const [index, expectedKid] of ['active', 'B'].entries()) {
      const jwk = published.keys.find((key) => key.kid === expectedKid);
      expect(jwk).toBeDefined();
      const verified = await jwtVerify(tokens[index]!, await importJWK(jwk!, 'ES384'));
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
  'https://192.0.2.1',
  'https://198.51.100.1',
  'https://203.0.113.1',
  'https://[2001:db8::1]',
  'https://[3fff::1]',
  'https://[fec0::1]',
])('special-use identity %s fails closed', (value) => {
  expect(() => validateServiceOrigin(value)).toThrow();
});
test('readiness deadline is coarse and late secret completion cannot become ready', async () => {
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
  await readiness(await request('/ready', settings), false);
  complete(String(env.UMAXICA_JUMP_PRIVATE_KEY_PEM));
  await Promise.resolve();
});

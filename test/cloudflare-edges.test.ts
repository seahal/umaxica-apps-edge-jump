import { exportJWK, exportPKCS8, generateKeyPair } from 'jose';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';
import worker, { resetIsolateCachesForTest, type CloudflareEnv } from '../src/cloudflare';

const ORIGIN = 'https://jump.example.net';

async function keyPair(kid: string) {
  const keys = await generateKeyPair('PS256', { extractable: true, modulusLength: 3072 });
  return {
    kid,
    pem: await exportPKCS8(keys.privateKey),
    jwk: { ...(await exportJWK(keys.publicKey)), kid, alg: 'PS256', use: 'sig' },
  };
}

function request(
  env: CloudflareEnv,
  path = '/.well-known/jwks.json',
  method = 'GET',
  headers: Record<string, string> = {},
  origin = ORIGIN,
) {
  return worker.fetch(
    new Request(`${origin}${path}`, {
      method,
      headers: { 'CF-Connecting-IP': '203.0.113.7', ...headers },
    }),
    {
      UMAXICA_JUMP_ORIGIN: ORIGIN,
      UMAXICA_JUMP_ENVIRONMENT: 'production',
      JUMP_RATE_LIMITER: { limit: async () => ({ success: true }) },
      ...env,
    },
    {} as ExecutionContext,
  );
}

afterEach(() => {
  vi.useRealTimers();
  resetIsolateCachesForTest();
});

describe('cloudflare adapter edges', () => {
  test.each(['k'.repeat(129), 'bad\nkid', 'bad\u0085kid'])(
    'an invalid private key kid fails closed: %s',
    async (kid) => {
      const res = await request({ UMAXICA_JUMP_PRIVATE_KEY_KID: kid });
      expect(res.status).toBe(503);
    },
  );

  test('a public JWKS kid with control characters is rejected', async () => {
    const key = await keyPair('bad\nkid');
    const res = await request({
      UMAXICA_JUMP_PRIVATE_KEY_KID: 'active',
      UMAXICA_JUMP_PUBLIC_JWKS: JSON.stringify({ keys: [key.jwk] }),
    });
    expect(res.status).toBe(503);
  });

  test('early 405 uses the shared Accept-Language negotiation', async () => {
    const res = await request({}, '/', 'POST', {
      'Accept-Language': 'fr, en-US;q=0.9, ja;q=0.8',
    });
    expect(res.status).toBe(405);
    expect(res.headers.get('Content-Language')).toBe('en');
  });

  test('rate limiting responds with Retry-After', async () => {
    const res = await request({ JUMP_RATE_LIMITER: { limit: async () => ({ success: false }) } });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
  });

  test('bare root and unknown non-GET Worker routes return 404', async () => {
    const root = await request({}, '/');
    const unknown = await request({}, '/missing-route', 'POST');
    expect(root.status).toBe(404);
    expect(root.headers.get('Location')).toBeNull();
    expect(unknown.status).toBe(404);
    expect(unknown.headers.get('Location')).toBeNull();
  });

  test('early rejection logs include request id, result, and status', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const res = await request({ UMAXICA_JUMP_ORIGIN: 'not an origin' });
      const records = warn.mock.calls
        .map(([line]) => JSON.parse(String(line)) as Record<string, unknown>)
        .filter((entry) => entry.event === 'jump_reject');
      expect(res.status).toBe(503);
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        event: 'jump_reject',
        result: 'rejected',
        reason: 'invalid_service_origin',
        status: 503,
      });
      expect(records[0]?.request_id).toBe(res.headers.get('X-Request-ID'));
    } finally {
      warn.mockRestore();
    }
  });

  test.each([
    ['invalid_environment', { UMAXICA_JUMP_ENVIRONMENT: 'unexpected' }],
    ['limiter_binding_missing', { JUMP_RATE_LIMITER: undefined }],
    ['missing_active_kid', {}],
  ])('%s early rejection log has request metadata', async (reason, env) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const res = await request(env as unknown as CloudflareEnv);
      const records = warn.mock.calls
        .map(([line]) => JSON.parse(String(line)) as Record<string, unknown>)
        .filter((entry) => entry.event === 'jump_reject');
      expect(res.status).toBe(503);
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({ result: 'rejected', reason, status: 503 });
      expect(records[0]?.request_id).toBe(res.headers.get('X-Request-ID'));
    } finally {
      warn.mockRestore();
    }
  });

  test.each([
    ['request_origin_mismatch', {}, 'https://other.example.net', {}],
    [
      'limiter_response_invalid',
      {
        JUMP_RATE_LIMITER: {
          limit: async () => ({ success: 'invalid' as unknown as boolean }),
        },
      },
      ORIGIN,
      {},
    ],
    ['invalid_client_ip', {}, ORIGIN, { 'CF-Connecting-IP': 'invalid ip' }],
  ])('%s early rejection emits one detailed log', async (reason, env, origin, headers) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const res = await request(
        env as CloudflareEnv,
        '/.well-known/jwks.json',
        'GET',
        headers as Record<string, string>,
        origin as string,
      );
      const records = warn.mock.calls
        .map(([line]) => JSON.parse(String(line)) as Record<string, unknown>)
        .filter((entry) => entry.event === 'jump_reject');
      expect(res.status).toBe(reason === 'request_origin_mismatch' ? 400 : 503);
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({ reason, result: 'rejected', status: res.status });
      expect(records[0]?.request_id).toBe(res.headers.get('X-Request-ID'));
    } finally {
      warn.mockRestore();
    }
  });

  test('the published JWKS drops extension attributes and keeps allowed key_ops', async () => {
    const key = await keyPair('active');
    const inputJwk = {
      ...key.jwk,
      key_ops: ['verify'],
      x5u: 'https://internal.invalid/private.json',
      x5c: ['internal-certificate'],
      internal_label: 'do-not-publish',
    };
    const res = await request({
      UMAXICA_JUMP_PRIVATE_KEY_PEM: key.pem,
      UMAXICA_JUMP_PRIVATE_KEY_KID: 'active',
      UMAXICA_JUMP_PUBLIC_JWKS: JSON.stringify({ keys: [inputJwk] }),
    });
    const body = (await res.json()) as { keys: Record<string, unknown>[] };
    expect(res.status).toBe(200);
    expect(body.keys[0]).toEqual({
      kty: 'RSA',
      n: key.jwk.n,
      e: 'AQAB',
      kid: 'active',
      alg: 'PS256',
      use: 'sig',
      key_ops: ['verify'],
    });
  });

  test('HEAD on a static asset has no body', async () => {
    const res = await request({}, '/favicon.ico', 'HEAD');
    expect(res.body).toBeNull();
  });

  test('key material entries expire and are swept across kids', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const a = await keyPair('kid-a');
    const b = await keyPair('kid-b');
    let current = a;
    const env: CloudflareEnv = {
      UMAXICA_JUMP_PRIVATE_KEY_PEM: { get: async () => current.pem },
      UMAXICA_JUMP_PRIVATE_KEY_KID: { get: async () => current.kid },
      UMAXICA_JUMP_PUBLIC_JWKS: JSON.stringify({ keys: [a.jwk, b.jwk] }),
    };
    const fullEnv = {
      UMAXICA_JUMP_ORIGIN: ORIGIN,
      UMAXICA_JUMP_ENVIRONMENT: 'production',
      JUMP_RATE_LIMITER: { limit: async () => ({ success: true }) },
      ...env,
    };
    const call = () =>
      worker.fetch(
        new Request(`${ORIGIN}/.well-known/jwks.json`, {
          headers: { 'CF-Connecting-IP': '203.0.113.7' },
        }),
        fullEnv,
        {} as ExecutionContext,
      );
    expect((await call()).status).toBe(200);
    current = b;
    expect((await call()).status).toBe(200);
    vi.setSystemTime(Date.now() + 301_000);
    expect((await call()).status).toBe(200);
    await Promise.resolve();
  });

  test.each([
    ['single-quoted', (pem: string) => `'${pem}'`, 200],
    ['double-quoted with raw newlines', (pem: string) => `"${pem}"`, 200],
    ['unbalanced quote', (pem: string) => `'${pem}`, 503],
  ])('PEM %s', async (_label, wrap, status) => {
    const k = await keyPair('kid-q');
    const res = await request({
      UMAXICA_JUMP_PRIVATE_KEY_PEM: wrap(k.pem),
      UMAXICA_JUMP_PRIVATE_KEY_KID: k.kid,
      UMAXICA_JUMP_PUBLIC_JWKS: JSON.stringify({ keys: [k.jwk] }),
    });
    expect(res.status).toBe(status);
  });
});

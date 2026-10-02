import { exportJWK, exportPKCS8, generateKeyPair } from 'jose';
import { afterEach, describe, expect, test, vi } from 'vitest';
import worker, { resetIsolateCachesForTest, type CloudflareEnv } from '../src/cloudflare';

const ORIGIN = 'https://jump.example.net';

async function keyPair(kid: string) {
  const keys = await generateKeyPair('ES384', { extractable: true });
  return {
    kid,
    pem: await exportPKCS8(keys.privateKey),
    jwk: { ...(await exportJWK(keys.publicKey)), kid, alg: 'ES384', use: 'sig' },
  };
}

function request(env: CloudflareEnv, path = '/.well-known/jwks.json', method = 'GET') {
  return worker.fetch(
    new Request(`${ORIGIN}${path}`, { method, headers: { 'CF-Connecting-IP': '203.0.113.7' } }),
    {
      UMAXICA_JUMP_ORIGIN: ORIGIN,
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
  test('an over-long kid fails closed', async () => {
    const res = await request({ UMAXICA_JUMP_PRIVATE_KEY_KID: 'k'.repeat(129) });
    expect(res.status).toBe(503);
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

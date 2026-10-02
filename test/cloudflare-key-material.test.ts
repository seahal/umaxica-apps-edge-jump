import { exportJWK, exportPKCS8, generateKeyPair, type JWK } from 'jose';
import type * as Jose from 'jose';
import { afterEach, describe, expect, test, vi } from 'vitest';

const importPkcs8Calls: Array<{ extractable: boolean | undefined }> = [];

vi.mock('jose', async (importOriginal) => {
  const actual = await importOriginal<typeof Jose>();
  return {
    ...actual,
    importPKCS8: async (pem: string, alg: string, options?: { extractable?: boolean }) => {
      importPkcs8Calls.push({ extractable: options?.extractable });
      return actual.importPKCS8(pem, alg, options);
    },
  };
});

const KID = 'cloudflare-active-2026-05';

async function keyMaterial() {
  const keys = await generateKeyPair('ES384', { extractable: true });
  const jwk = await exportJWK(keys.publicKey);
  return {
    pem: await exportPKCS8(keys.privateKey),
    publicJwk: { ...jwk, kid: KID, alg: 'ES384', use: 'sig' } as JWK,
  };
}

async function jwksRequest(env: Record<string, unknown>) {
  const { default: worker, resetIsolateCachesForTest } = await import('../src/cloudflare');
  resetIsolateCachesForTest();
  return worker.fetch(
    new Request('https://jump.example.net/.well-known/jwks.json', {
      headers: { 'CF-Connecting-IP': '203.0.113.7' },
    }),
    {
      UMAXICA_JUMP_ORIGIN: 'https://jump.example.net',
      JUMP_RATE_LIMITER: { limit: async () => ({ success: true }) },
      ...env,
    } as Parameters<typeof worker.fetch>[1],
    {} as ExecutionContext,
  );
}

afterEach(() => {
  importPkcs8Calls.length = 0;
});

describe('outbound signing key extractability', () => {
  test('a configured public keyset imports the private key as non-extractable', async () => {
    const { pem, publicJwk } = await keyMaterial();
    const exported = vi.spyOn(crypto.subtle, 'exportKey');
    const res = await jwksRequest({
      UMAXICA_JUMP_PRIVATE_KEY_PEM: pem,
      UMAXICA_JUMP_PRIVATE_KEY_KID: KID,
      UMAXICA_JUMP_PUBLIC_JWKS: JSON.stringify({ keys: [publicJwk] }),
    });

    expect(res.status).toBe(200);
    expect(importPkcs8Calls).toEqual([{ extractable: false }]);
    expect(exported).not.toHaveBeenCalled();
    exported.mockRestore();
  });

  test('a private-only configuration fails closed before import', async () => {
    const { pem } = await keyMaterial();
    const res = await jwksRequest({
      UMAXICA_JUMP_PRIVATE_KEY_PEM: pem,
      UMAXICA_JUMP_PRIVATE_KEY_KID: KID,
    });

    expect(res.status).toBe(503);
    expect(importPkcs8Calls).toEqual([]);
  });
});

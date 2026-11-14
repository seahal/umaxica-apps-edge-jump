import { describe, expect, it, vi } from 'vite-plus/test';
import type * as Jose from 'jose';

vi.mock('jose', async (importOriginal) => {
  const actual = await importOriginal<typeof Jose>();
  return {
    ...actual,
    importJWK: vi.fn(async () => {
      throw new Error('simulated Web Crypto key import failure');
    }),
  };
});

import { importIssuerJwks } from '../src/core/issuer_jwks';

describe('issuer key import failures', () => {
  it('converts Web Crypto import errors into a rejected JWKS document', async () => {
    await expect(
      importIssuerJwks({
        keys: [
          {
            kty: 'RSA',
            n: `_${'A'.repeat(511)}`,
            e: 'AQAB',
            kid: 'key',
            alg: 'PS256',
            use: 'sig',
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'jwks_bad_gateway', message: 'jwk import rejected' });
  });
});

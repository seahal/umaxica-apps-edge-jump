import { beforeAll, describe, expect, test } from 'vitest';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { JwksCache } from '../src/core/jwks_cache';
import { verifyJumpJwt } from '../src/core/verify_jwt';
const now = 1800000000;
let pair: Awaited<ReturnType<typeof generateKeyPair>>;
let cache: JwksCache;
const issuer = {
  iss: 'https://auth.umaxica.app',
  jwks_uri: 'https://auth.umaxica.app/.well-known/jwks.json',
  allowed_dst_internal: ['https://www.umaxica.app'],
  allowed_dst_external: false as const,
};
const registry = { [issuer.iss]: issuer };
const base = {
  schema: 1,
  rpl: 'reuse',
  iss: issuer.iss,
  aud: 'https://jump.umaxica.net',
  sub: 'jump-redirect',
  iat: now - 60,
  nbf: now - 60,
  exp: now + 60,
  jti: 'input',
  dst: 'internal',
  url: 'https://www.umaxica.app/receive',
};
beforeAll(async () => {
  pair = await generateKeyPair('ES384');
  const key = { ...(await exportJWK(pair.publicKey)), kid: 'k', alg: 'ES384', use: 'sig' };
  cache = new JwksCache(async () => ({ keys: [key] }));
});
async function check(changes: Record<string, unknown>) {
  const input = await new SignJWT({ ...base, ...changes })
    .setProtectedHeader({ typ: 'JWT', alg: 'ES384', kid: 'k' })
    .sign(pair.privateKey);
  return verifyJumpJwt(input, registry, cache, now, 'https://jump.umaxica.net');
}
describe('F: deterministic clock BVA (seed fixed now)', () => {
  test.each([4, 5, 6])('nbf +%i seconds', async (offset) => {
    if (offset <= 5) await expect(check({ nbf: now + offset })).resolves.toBeDefined();
    else
      await expect(check({ nbf: now + offset })).rejects.toMatchObject({ code: 'invalid_claim' });
  });
  test.each([4, 5, 6])('iat +%i seconds', async (offset) => {
    if (offset <= 5) await expect(check({ iat: now + offset })).resolves.toBeDefined();
    else
      await expect(check({ iat: now + offset })).rejects.toMatchObject({ code: 'invalid_claim' });
  });
  test.each([4, 5, 6])('expiration -%i seconds (jose strict boundary)', async (offset) => {
    if (offset < 5) await expect(check({ exp: now - offset })).resolves.toBeDefined();
    else await expect(check({ exp: now - offset })).rejects.toMatchObject({ code: 'expired' });
  });
  test('fractional NumericDates remain accepted', async () => {
    await expect(
      check({ iat: now - 0.5, nbf: now - 0.5, exp: now + 299.5 }),
    ).resolves.toBeDefined();
  });
  test('equal/reversed expiry and nbf after exp reject', async () => {
    for (const changes of [
      { iat: now, exp: now },
      { iat: now, exp: now - 1 },
      { nbf: now + 1, exp: now },
    ])
      await expect(check(changes)).rejects.toBeDefined();
  });
});

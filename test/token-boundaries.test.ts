import { beforeAll, describe, expect, test, vi } from 'vitest';
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
  iat: now,
  nbf: now,
  exp: now + 30,
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
describe('exact string audience contract', () => {
  test('accepts the configured origin as a string', async () => {
    await expect(check({ aud: base.aud })).resolves.toBeDefined();
  });
  test.each([
    ['single matching audience', [base.aud]],
    ['matching and unrelated audiences', [base.aud, 'https://other.example']],
    ['duplicate matching audiences', [base.aud, base.aud]],
  ])('rejects a signed array with %s', async (_label, aud) => {
    await expect(check({ aud })).rejects.toMatchObject({ code: 'invalid_claim' });
  });
});
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
    if (offset < 5)
      await expect(
        check({ iat: now - 30, nbf: now - 30, exp: now - offset }),
      ).resolves.toBeDefined();
    else
      await expect(
        check({ iat: now - 30, nbf: now - 30, exp: now - offset }),
      ).rejects.toMatchObject({ code: 'expired' });
  });
  test('fractional NumericDates remain accepted', async () => {
    await expect(check({ iat: now - 0.5, nbf: now - 0.5, exp: now + 29.5 })).resolves.toBeDefined();
  });
  test.each([30, 30.001, 31, 35])('structural TTL %s has no clock leeway', async (ttl) => {
    const result = check({ iat: now - 0.5, nbf: now - 0.5, exp: now - 0.5 + ttl });
    if (ttl === 30) await expect(result).resolves.toBeDefined();
    else await expect(result).rejects.toMatchObject({ code: 'invalid_claim' });
  });
  test('kid over 128 rejects before verification key lookup', async () => {
    const lookup = vi.spyOn(cache, 'getKey');
    try {
      const input = await new SignJWT(base)
        .setProtectedHeader({ typ: 'JWT', alg: 'ES384', kid: 'k'.repeat(129) })
        .sign(pair.privateKey);
      await expect(
        verifyJumpJwt(input, registry, cache, now, 'https://jump.umaxica.net'),
      ).rejects.toMatchObject({ code: 'invalid_header' });
      expect(lookup).not.toHaveBeenCalled();
    } finally {
      lookup.mockRestore();
    }
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

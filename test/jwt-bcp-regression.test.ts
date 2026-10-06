// Pins the JWT BCP rules (RFC 8725 and draft-ietf-oauth-rfc8725bis-10) that the
// schema 1 profile already satisfies. Boundaries covered elsewhere (clock skew,
// TTL, audience arrays, token length) are not repeated here.
import { exportJWK, generateKeyPair, type JWK } from 'jose';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { JwksCache } from '../src/core/jwks_cache';
import type { IssuerConfig, IssuerRegistry } from '../src/core/types';
import { verifyJumpJwt } from '../src/core/verify_jwt';

const SERVICE = 'https://jump.umaxica.net';
const NOW = 1_800_000_000;
const A = 'https://auth.umaxica.app';
const B = 'https://www.umaxica.app';
const issuer = (iss: string): IssuerConfig => ({
  iss,
  jwks_uri: `${iss}/.well-known/jwks.json`,
  allowed_dst_internal: [],
  allowed_dst_external: false,
});
const registry: IssuerRegistry = { [A]: issuer(A), [B]: issuer(B) };
const HEADER = { typ: 'JWT', alg: 'ES384', kid: 'k' };
const CLAIMS = {
  schema: 1,
  rpl: 'reuse',
  iss: A,
  aud: SERVICE,
  sub: 'jump-redirect',
  iat: NOW,
  nbf: NOW,
  exp: NOW + 30,
  jti: 'input',
  dst: 'internal',
  url: 'https://www.umaxica.app/receive',
};

type Pair = Awaited<ReturnType<typeof generateKeyPair>>;
let pairs: Record<string, Pair>;
let keysets: Record<string, JWK[]>;
let fetchJwks: ReturnType<typeof vi.fn<(issuer: IssuerConfig) => Promise<{ keys: JWK[] }>>>;
let cache: JwksCache;

const encode = (value: unknown) =>
  Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

/** Signs arbitrary header and payload bytes, including ones jose refuses to produce. */
async function signed(header: object, payload: unknown, signer = A) {
  const pair = pairs[signer];
  if (!pair) throw new Error('fixture pair missing');
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-384' },
    pair.privateKey as CryptoKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${Buffer.from(signature).toString('base64url')}`;
}

const verify = (token: string) => verifyJumpJwt(token, registry, cache, NOW, SERVICE);

beforeAll(async () => {
  pairs = {
    [A]: await generateKeyPair('ES384', { extractable: true }),
    [B]: await generateKeyPair('ES384', { extractable: true }),
  };
});
beforeEach(async () => {
  keysets = {};
  for (const [iss, pair] of Object.entries(pairs))
    keysets[iss] = [{ ...(await exportJWK(pair.publicKey)), kid: 'k', alg: 'ES384', use: 'sig' }];
  fetchJwks = vi.fn(async (config: IssuerConfig) => ({ keys: keysets[config.iss] ?? [] }));
  cache = new JwksCache(fetchJwks);
});

describe('RFC 8725bis regression: header', () => {
  test('the pinned profile verifies', async () => {
    await expect(verify(await signed(HEADER, CLAIMS))).resolves.toBeDefined();
    expect(fetchJwks).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['unsecured', 'none'],
    ['unsecured case variant', 'None'],
    ['unsecured upper case', 'NONE'],
    ['lower case', 'es384'],
    ['mixed case', 'Es384'],
    ['trailing space', 'ES384 '],
    ['leading space', ' ES384'],
    ['NUL suffix', 'ES384\u0000'],
    ['symmetric confusion', 'HS384'],
    ['other curve', 'ES256'],
    ['other curve', 'ES512'],
    ['other family', 'EdDSA'],
    ['other family', 'RS384'],
    ['empty', ''],
    ['null', null],
    ['zero', 0],
    ['boolean', true],
    ['array', ['ES384']],
    ['object', { alg: 'ES384' }],
    ['omitted', undefined],
  ])('alg %s (%j) is rejected before any key lookup', async (_label, alg) => {
    const header = alg === undefined ? { typ: 'JWT', kid: 'k' } : { ...HEADER, alg };
    await expect(verify(await signed(header, CLAIMS))).rejects.toMatchObject({
      code: 'invalid_header',
    });
    expect(fetchJwks).not.toHaveBeenCalled();
  });

  test.each([
    ['empty', ''],
    ['null', null],
    ['zero', 0],
    ['boolean', true],
    ['array', ['k']],
    ['object', { kid: 'k' }],
    ['omitted', undefined],
    ['129 characters', 'k'.repeat(129)],
  ])('kid %s is rejected before any key lookup', async (_label, kid) => {
    const header = kid === undefined ? { typ: 'JWT', alg: 'ES384' } : { ...HEADER, kid };
    await expect(verify(await signed(header, CLAIMS))).rejects.toMatchObject({
      code: 'invalid_header',
    });
    expect(fetchJwks).not.toHaveBeenCalled();
  });

  test('a 128 character kid passes the header bound and reaches key lookup', async () => {
    const kid = 'k'.repeat(128);
    keysets[A] = (keysets[A] ?? []).map((key) => ({ ...key, kid }));
    await expect(verify(await signed({ ...HEADER, kid }, CLAIMS))).resolves.toBeDefined();
  });

  test.each(['jku', 'jwk', 'x5u', 'crit'])(
    'header %s is rejected before any fetch, whatever its value',
    async (name) => {
      for (const value of [
        'https://attacker.example/jwks.json',
        null,
        '',
        0,
        false,
        [],
        {},
        undefined,
      ]) {
        const header = { ...HEADER, [name]: value };
        // `undefined` is dropped by JSON; that partition is the pinned profile.
        const result = verify(await signed(header, CLAIMS));
        if (value === undefined) await expect(result).resolves.toBeDefined();
        else await expect(result).rejects.toMatchObject({ code: 'invalid_header' });
      }
      expect(fetchJwks).toHaveBeenCalledTimes(1);
    },
  );

  test.each([
    ['omitted', undefined],
    ['lower case', 'jwt'],
    ['media type form', 'application/jwt'],
    ['another JWT profile', 'at+jwt'],
    ['another JWT profile', 'dpop+jwt'],
    ['null', null],
    ['array', ['JWT']],
  ])('typ %s is rejected before any key lookup', async (_label, typ) => {
    const header = typ === undefined ? { alg: 'ES384', kid: 'k' } : { ...HEADER, typ };
    await expect(verify(await signed(header, CLAIMS))).rejects.toMatchObject({
      code: 'invalid_header',
    });
    expect(fetchJwks).not.toHaveBeenCalled();
  });

  test.each([
    ['array', '["JWT","ES384","k"]'],
    ['string', '"header"'],
    ['number', '1'],
    ['null', 'null'],
    ['boolean', 'true'],
    ['not JSON', 'header'],
  ])('a protected header that is a JSON %s is rejected', async (_label, raw) => {
    const token = await signed(HEADER, CLAIMS);
    const [, payload, signature] = token.split('.');
    await expect(verify(`${encode(raw)}.${payload}.${signature}`)).rejects.toMatchObject({
      code: 'invalid_header',
    });
    expect(fetchJwks).not.toHaveBeenCalled();
  });
});

describe('RFC 8725bis regression: format', () => {
  test.each([
    ['one segment', (t: string) => t.split('.')[0] ?? ''],
    ['two segments', (t: string) => t.split('.').slice(0, 2).join('.')],
    ['four segments', (t: string) => `${t}.${encode('x')}`],
    ['JWE compact (five segments)', (t: string) => `${t}.${encode('x')}.${encode('y')}`],
    ['empty signature (unsecured form)', (t: string) => `${t.split('.').slice(0, 2).join('.')}.`],
    ['empty payload', (t: string) => t.replace(/\.[^.]+\./, '..')],
    ['empty header', (t: string) => t.replace(/^[^.]+/, '')],
    ['padded base64', (t: string) => `${t}=`],
    ['base64 alphabet instead of base64url', (t: string) => `${t.slice(0, -1)}+`],
    ['whitespace', (t: string) => `${t} `],
    ['NUL', (t: string) => `${t}\u0000`],
    ['JWS JSON serialization', (t: string) => JSON.stringify({ protected: t.split('.')[0] })],
  ])('%s is malformed and never reaches key lookup', async (_label, mutate) => {
    await expect(verify(mutate(await signed(HEADER, CLAIMS)))).rejects.toMatchObject({
      code: 'malformed',
    });
    expect(fetchJwks).not.toHaveBeenCalled();
  });

  test.each([
    ['array', '[1]'],
    ['string', '"payload"'],
    ['number', '1'],
    ['null', 'null'],
    ['boolean', 'false'],
    ['not JSON', 'payload'],
  ])('a signed payload that is a JSON %s is rejected before key lookup', async (_label, raw) => {
    await expect(verify(await signed(HEADER, raw))).rejects.toMatchObject({ code: 'malformed' });
    expect(fetchJwks).not.toHaveBeenCalled();
  });
});

describe('RFC 8725bis regression: issuer and keys', () => {
  test.each([
    ['unregistered', 'https://attacker.example'],
    ['registered origin with a path', `${A}/`],
    ['case variant', A.toUpperCase()],
    ['prototype key', '__proto__'],
    ['prototype key', 'constructor'],
    ['empty', ''],
    ['null', null],
    ['array', [A]],
    ['omitted', undefined],
  ])('iss %s never selects a keyset', async (_label, iss) => {
    await expect(verify(await signed(HEADER, { ...CLAIMS, iss }))).rejects.toMatchObject({
      code: 'invalid_claim',
    });
    expect(fetchJwks).not.toHaveBeenCalled();
  });

  test('a registered issuer cannot vouch for another: keys are issuer specific', async () => {
    // Signed by B with its own valid key, claiming to be A, same kid.
    await expect(verify(await signed(HEADER, CLAIMS, B))).rejects.toMatchObject({
      code: 'invalid_signature',
    });
    expect(fetchJwks.mock.calls.map(([config]) => config.iss)).toEqual([A, A]);
  });

  test.each(['ES256', 'ES512', 'EdDSA', undefined])(
    'a key published for alg %s is not used for ES384',
    async (alg) => {
      keysets[A] = (keysets[A] ?? []).map(({ alg: _alg, ...key }) => (alg ? { ...key, alg } : key));
      await expect(verify(await signed(HEADER, CLAIMS))).rejects.toMatchObject({
        code: 'invalid_signature',
      });
    },
  );
});

describe('RFC 8725bis regression: claims of a correctly signed token', () => {
  const invalidClaim = { code: 'invalid_claim' };
  test.each([
    ['sub of another profile', { sub: 'user-123' }, invalidClaim],
    ['sub case variant', { sub: 'Jump-Redirect' }, invalidClaim],
    ['sub array', { sub: ['jump-redirect'] }, invalidClaim],
    ['sub null', { sub: null }, invalidClaim],
    ['sub omitted', { sub: undefined }, invalidClaim],
    ['schema string', { schema: '1' }, invalidClaim],
    ['schema 2', { schema: 2 }, invalidClaim],
    ['schema 0', { schema: 0 }, invalidClaim],
    ['schema boolean', { schema: true }, invalidClaim],
    ['schema array', { schema: [1] }, invalidClaim],
    ['schema omitted', { schema: undefined }, invalidClaim],
    ['rpl other', { rpl: 'once' }, invalidClaim],
    ['rpl case variant', { rpl: 'Reuse' }, invalidClaim],
    ['rpl boolean', { rpl: true }, invalidClaim],
    ['rpl omitted', { rpl: undefined }, invalidClaim],
    ['aud other origin', { aud: 'https://www.umaxica.app' }, invalidClaim],
    ['aud with trailing slash', { aud: `${SERVICE}/` }, invalidClaim],
    ['aud omitted', { aud: undefined }, invalidClaim],
    ['exp string', { exp: String(NOW + 30) }, invalidClaim],
    ['exp null', { exp: null }, invalidClaim],
    ['exp boolean', { exp: true }, invalidClaim],
    ['exp omitted', { exp: undefined }, invalidClaim],
    ['nbf string', { nbf: String(NOW) }, invalidClaim],
    ['nbf omitted', { nbf: undefined }, invalidClaim],
    ['iat string', { iat: String(NOW) }, invalidClaim],
    ['iat array', { iat: [NOW] }, invalidClaim],
    ['iat omitted', { iat: undefined }, invalidClaim],
  ])('%s is rejected', async (_label, changes, expected) => {
    await expect(verify(await signed(HEADER, { ...CLAIMS, ...changes }))).rejects.toMatchObject(
      expected,
    );
  });

  test.each(['exp', 'nbf', 'iat'])('a non-finite %s literal is rejected', async (name) => {
    // `1e999` is valid JSON that parses to Infinity.
    const payload = JSON.stringify({ ...CLAIMS, [name]: 0 }).replace(
      `"${name}":0`,
      `"${name}":1e999`,
    );
    expect(JSON.parse(payload)[name]).toBe(Infinity);
    await expect(verify(await signed(HEADER, payload))).rejects.toMatchObject(invalidClaim);
  });

  test('a different JWT profile from a trusted issuer is not a Jump token', async () => {
    // An ID-token-shaped JWT: genuine signature, right issuer and audience.
    const idToken = {
      iss: A,
      aud: SERVICE,
      sub: 'user-123',
      iat: NOW,
      nbf: NOW,
      exp: NOW + 30,
      nonce: 'n',
      url: CLAIMS.url,
      dst: 'internal',
    };
    await expect(verify(await signed(HEADER, idToken))).rejects.toMatchObject(invalidClaim);
    // Even with the Jump replay marker, the profile-specific claims decide.
    await expect(verify(await signed(HEADER, { ...idToken, rpl: 'reuse' }))).rejects.toMatchObject(
      invalidClaim,
    );
    await expect(
      verify(await signed(HEADER, { ...idToken, rpl: 'reuse', schema: 1 })),
    ).rejects.toMatchObject(invalidClaim);
  });
});

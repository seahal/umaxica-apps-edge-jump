import { JwksCache } from '../src/core/jwks_cache';
import { verifyJumpJwt } from '../src/core/verify_jwt';
import { describe, expect, test } from 'vite-plus/test';
import { exportJWK, generateKeyPair, jwtVerify, SignJWT } from 'jose';
import { importIssuerJwks } from '../src/core/issuer_jwks';
import { validateJumpJwks } from '../src/core/jump_jwks';
import { JoseOutboundSigner } from '../src/core/sign_outbound';
import type { OutboundJumpClaim } from '../src/core/types';

describe('PS256 only', () => {
  test('imports a PS256 rotation set and verifies PS256 return signatures', async () => {
    const rsa = await generateKeyPair('PS256', { modulusLength: 3072 });
    const ec = await generateKeyPair('PS256', { modulusLength: 3072 });
    const jwks = {
      keys: [
        { ...(await exportJWK(rsa.publicKey)), kid: 'rsa', alg: 'PS256', use: 'sig' },
        { ...(await exportJWK(ec.publicKey)), kid: 'ec', alg: 'PS256', use: 'sig' },
      ],
    };
    expect(validateJumpJwks(jwks).keys).toHaveLength(2);
    const keys = await importIssuerJwks(jwks);
    const rsaKey = keys.get('rsa');
    const ecKey = keys.get('ec');
    if (!rsaKey || !ecKey) throw new Error('missing imported keys');
    const now = 1800000000;
    const issuer = {
      iss: 'https://auth.umaxica.app',
      jwks_uri: 'https://auth.umaxica.app/jwks',
      allowed_dst_internal: [],
    };
    const inbound = await new SignJWT({
      schema: 1,
      rpl: 'reuse',
      iss: issuer.iss,
      aud: 'https://jump.umaxica.net',
      sub: 'jump-redirect',
      iat: now,
      nbf: now,
      exp: now + 30,
      jti: 'test',
      dst: 'internal',
      url: 'https://www.umaxica.app/',
    })
      .setProtectedHeader({ typ: 'JWT', alg: 'PS256', kid: 'rsa' })
      .sign(rsa.privateKey);
    await expect(
      verifyJumpJwt(inbound, {
        registry: { [issuer.iss]: issuer },
        jwksCache: new JwksCache(async () => jwks),
        now,
        serviceOrigin: 'https://jump.umaxica.net',
        typ: 'JWT',
      }),
    ).resolves.toBeDefined();
    const signer = new JoseOutboundSigner(rsa.privateKey, 'rsa');
    const token = await signer.sign({} as OutboundJumpClaim, 'JWT');
    const result = await jwtVerify(token, rsaKey, { algorithms: ['PS256'] });
    expect(result.protectedHeader.alg).toBe('PS256');
    await expect(jwtVerify(token, ecKey, { algorithms: ['PS256'] })).rejects.toThrow();
  });
  test('rejects genuine ES384 tokens before JWKS lookup and rejects EC public keys', async () => {
    const pair = await generateKeyPair('ES384');
    const key = { ...(await exportJWK(pair.publicKey)), kid: 'legacy', alg: 'ES384', use: 'sig' };
    await expect(importIssuerJwks({ keys: [key] })).rejects.toThrow();
    expect(() => validateJumpJwks({ keys: [key] })).toThrow();
    const token = await new SignJWT({})
      .setProtectedHeader({ typ: 'JWT', alg: 'ES384', kid: 'legacy' })
      .sign(pair.privateKey);
    let fetched = false;
    await expect(
      verifyJumpJwt(token, {
        registry: {},
        jwksCache: new JwksCache(async () => {
          fetched = true;
          return { keys: [key] };
        }),
        now: 1800000000,
        serviceOrigin: 'https://jump.umaxica.net',
        typ: 'JWT',
      }),
    ).rejects.toMatchObject({ code: 'invalid_header' });
    expect(fetched).toBe(false);
    await expect(
      new JoseOutboundSigner(pair.privateKey, 'legacy').sign({} as OutboundJumpClaim, 'JWT'),
    ).rejects.toThrow();
  });
  test('rejects undersized RSA and mismatched algorithm metadata', async () => {
    const pair = await generateKeyPair('PS256', { modulusLength: 2048 });
    const key = { ...(await exportJWK(pair.publicKey)), kid: 'rsa', alg: 'PS256', use: 'sig' };
    for (const entry of [key, { ...key, alg: 'ES384' }]) {
      await expect(importIssuerJwks({ keys: [entry] })).rejects.toThrow();
      expect(() => validateJumpJwks({ keys: [entry] })).toThrow();
    }
  });
});

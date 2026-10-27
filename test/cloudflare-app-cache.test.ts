import { exportJWK, exportPKCS8, generateKeyPair, jwtVerify, SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import worker, { resetIsolateCachesForTest, type CloudflareEnv } from '../src/cloudflare';

const ISSUER = 'https://auth.umaxica.app';
const DESTINATION = 'https://www.umaxica.app';
const KID = 'cloudflare-active-2026-05';

async function fixture() {
  const issuerKeys = await generateKeyPair('ES384');
  const jumpKeys = await generateKeyPair('ES384', { extractable: true });
  const issuerJwks = {
    keys: [{ ...(await exportJWK(issuerKeys.publicKey)), kid: 'issuer', alg: 'ES384', use: 'sig' }],
  };
  const jwksFetch = vi.fn(async () => Response.json(issuerJwks));
  vi.stubGlobal('fetch', jwksFetch);
  const bindings = {
    UMAXICA_JUMP_PRIVATE_KEY_PEM: await exportPKCS8(jumpKeys.privateKey),
    UMAXICA_JUMP_PRIVATE_KEY_KID: KID,
    UMAXICA_JUMP_PUBLIC_JWKS: JSON.stringify({
      keys: [{ ...(await exportJWK(jumpKeys.publicKey)), kid: KID, alg: 'ES384', use: 'sig' }],
    }),
  };
  // A new object per call: workerd does not promise a stable `env` reference.
  const env = (origin: string, extra: Partial<CloudflareEnv> = {}): CloudflareEnv => ({
    ...bindings,
    UMAXICA_JUMP_ORIGIN: origin,
    UMAXICA_JUMP_ENVIRONMENT: 'production',
    JUMP_RATE_LIMITER: { limit: async () => ({ success: true }) },
    ...extra,
  });
  const jump = async (origin: string, extra: Partial<CloudflareEnv> = {}) => {
    const now = Math.floor(Date.now() / 1000);
    const rt = await new SignJWT({
      schema: 1,
      rpl: 'reuse',
      iss: ISSUER,
      aud: origin,
      sub: 'jump-redirect',
      iat: now,
      nbf: now,
      exp: now + 30,
      jti: crypto.randomUUID(),
      dst: 'internal',
      url: `${DESTINATION}/`,
    })
      .setProtectedHeader({ typ: 'JWT', alg: 'ES384', kid: 'issuer' })
      .sign(issuerKeys.privateKey);
    const response = await worker.fetch(
      new Request(`${origin}/?rt=${rt}`, { headers: { 'CF-Connecting-IP': '203.0.113.7' } }),
      env(origin, extra),
      {} as ExecutionContext,
    );
    const location = response.headers.get('Location');
    const outbound = location ? new URL(location).searchParams.get('rt') : null;
    return {
      status: response.status,
      iss: outbound
        ? (await jwtVerify(outbound, jumpKeys.publicKey, { algorithms: ['ES384'] })).payload.iss
        : null,
    };
  };
  return { jwksFetch, jump };
}

describe('isolate-scope app and issuer JWKS cache', () => {
  beforeEach(() => {
    resetIsolateCachesForTest();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('successive requests reuse the issuer JWKS without relying on env identity', async () => {
    const { jwksFetch, jump } = await fixture();
    const origin = 'https://jump.umaxica.net';
    expect(await jump(origin)).toEqual({ status: 302, iss: origin });
    expect(await jump(origin)).toEqual({ status: 302, iss: origin });
    expect(jwksFetch).toHaveBeenCalledTimes(1);
  });

  test('a changed service origin never reuses the previous app', async () => {
    const { jwksFetch, jump } = await fixture();
    const first = 'https://jump.umaxica.net';
    const second = 'https://jump-next.example';
    expect(await jump(first)).toEqual({ status: 302, iss: first });
    // Reusing the first app would sign as `first` and reject this audience.
    expect(await jump(second)).toEqual({ status: 302, iss: second });
    expect(jwksFetch).toHaveBeenCalledTimes(2);
    // One bounded entry: going back is a cold start, still correct.
    expect(await jump(first)).toEqual({ status: 302, iss: first });
    expect(jwksFetch).toHaveBeenCalledTimes(3);
  });

  test('a changed Worker version does not reuse the previous app', async () => {
    const { jwksFetch, jump } = await fixture();
    const origin = 'https://jump.umaxica.net';
    await jump(origin, { CF_VERSION_METADATA: { id: 'v1' } });
    await jump(origin, { CF_VERSION_METADATA: { id: 'v1' } });
    expect(jwksFetch).toHaveBeenCalledTimes(1);
    expect(await jump(origin, { CF_VERSION_METADATA: { id: 'v2' } })).toEqual({
      status: 302,
      iss: origin,
    });
    expect(jwksFetch).toHaveBeenCalledTimes(2);
  });

  test('signing uses the bindings of the current request, not of the cached app', async () => {
    const { jump } = await fixture();
    const origin = 'https://jump.umaxica.net';
    expect(await jump(origin)).toEqual({ status: 302, iss: origin });
    // Same isolate and cached app, but this request carries no private key.
    expect(await jump(origin, { UMAXICA_JUMP_PRIVATE_KEY_PEM: '' })).toEqual({
      status: 503,
      iss: null,
    });
    expect(await jump(origin)).toEqual({ status: 302, iss: origin });
  });
});

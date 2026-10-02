import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { describe, expect, test, vi } from 'vitest';
import { PRODUCTION_SERVICE_ORIGIN } from './app-fixture';
import { raceAbort } from '../src/core/deadline';
import { escapeHtml } from '../src/core/escape';
import { fetchRegistryJwks } from '../src/core/fetch_jwks';
import { handleJump, type JumpDeps } from '../src/core/handle_jump';
import { unicodeHostname } from '../src/core/idna';
import { parseJumpJwks, validateJumpJwks } from '../src/core/jump_jwks';
import { JwksCache } from '../src/core/jwks_cache';
import { renderErrorPage, renderUnavailablePage } from '../src/core/page';
import { assertDestinationPolicy } from '../src/core/policy';
import { publicErrorResponse, publicJumpError } from '../src/core/public_error';
import { renderError } from '../src/core/render_error';
import { sanitizeSecurityLog } from '../src/core/security_log';
import { JumpError, type InboundJumpClaim, type IssuerConfig } from '../src/core/types';
import { normalizeUrl, validateServiceOrigin } from '../src/core/normalize_url';
import { createApp as createProductionApp } from '../src';

const ISSUER: IssuerConfig = {
  iss: 'https://app.example.com',
  jwks_uri: 'https://app.example.com/.well-known/jwks.json',
  allowed_dst_internal: ['https://docs.example.com'],
  allowed_dst_external: false,
};

function deps(overrides: Partial<JumpDeps> = {}): JumpDeps {
  return {
    registry: { [ISSUER.iss]: ISSUER },
    jwksCache: new JwksCache(async () => ({ keys: [] })),
    runtime: { edge: 'cloudflare', production: true },
    signer: { sign: async () => 'x.y.z' },
    config: { serviceOrigin: PRODUCTION_SERVICE_ORIGIN },
    ...overrides,
  };
}

async function signedToken() {
  const keys = await generateKeyPair('ES384');
  const jwk = await exportJWK(keys.publicKey);
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    schema: 1,
    rpl: 'reuse',
    iss: ISSUER.iss,
    aud: PRODUCTION_SERVICE_ORIGIN,
    sub: 'jump-redirect',
    iat: now,
    nbf: now,
    exp: now + 30,
    jti: crypto.randomUUID(),
    dst: 'internal',
    url: 'https://docs.example.com/path',
  })
    .setProtectedHeader({ typ: 'JWT', alg: 'ES384', kid: 'kid-1' })
    .sign(keys.privateKey);
  const jwksCache = new JwksCache(async () => ({
    keys: [{ ...jwk, kid: 'kid-1', alg: 'ES384', use: 'sig' }],
  }));
  return { token, jwksCache };
}

describe('handleJump query and signer edges', () => {
  test.each([
    ['unknown parameter', '?rt=a&x=1'],
    ['missing rt', '?'],
    ['duplicate rt', '?rt=a&rt=b'],
    ['empty rt', '?rt='],
  ])('%s is rejected as malformed', async (_label, query) => {
    const res = await handleJump(new Request(`https://jump.example.net/${query}`), deps());
    expect(res.status).toBe(400);
  });

  test('a non-JumpError from the signer becomes internal_error', async () => {
    const { token, jwksCache } = await signedToken();
    const audit = vi.fn();
    const res = await handleJump(
      new Request(`https://jump.example.net/?rt=${token}`),
      deps({
        jwksCache,
        auditLog: audit,
        signer: {
          sign: async () => {
            throw new Error('boom');
          },
        },
      }),
    );
    expect(res.status).toBe(500);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ reason: 'internal_error' }));
  });

  test('an abort during signing yields deadline_exceeded', async () => {
    const { token, jwksCache } = await signedToken();
    const controller = new AbortController();
    const res = await handleJump(
      new Request(`https://jump.example.net/?rt=${token}`),
      deps({
        jwksCache,
        signal: controller.signal,
        signer: {
          sign: async () => {
            controller.abort();
            return 'x.y.z';
          },
        },
      }),
    );
    expect(res.status).toBe(504);
  });
});

describe('small helpers', () => {
  test('escapeHtml treats nullish as empty', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  test('raceAbort rejects when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(raceAbort(new Promise(() => {}), controller.signal)).rejects.toMatchObject({
      code: 'deadline_exceeded',
    });
  });

  test('default-locale page renderers', () => {
    expect(renderErrorPage()).toContain('lang="ja"');
    expect(renderUnavailablePage()).toContain('lang="ja"');
    expect(renderError()).toContain('lang="ja"');
  });

  test('unknown internal codes map to internal_error', () => {
    expect(publicJumpError('???')).toEqual({ code: 'internal_error', status: 500 });
    expect(publicErrorResponse('rate_limited').status).toBe(429);
  });

  test('unknown dst is rejected by policy', () => {
    const target = normalizeUrl(
      'https://docs.example.com/',
      { edge: 'cloudflare', production: true },
      PRODUCTION_SERVICE_ORIGIN,
    );
    const claim = { iss: ISSUER.iss, dst: 'other' } as unknown as InboundJumpClaim;
    expect(() => assertDestinationPolicy(claim, ISSUER, target)).toThrow(JumpError);
  });

  test('security log drops JWT-shaped values and non-origin dst_origin', () => {
    expect(
      sanitizeSecurityLog({
        reason: 'a.b.c',
        dst_origin: 'https://x.example/path',
        iss: 'https://ok.example',
      }),
    ).toEqual({ iss: 'https://ok.example' });
    expect(sanitizeSecurityLog({ dst_origin: 'not a url' })).toEqual({});
  });

  test('punycode decoding fails closed to the ASCII label', () => {
    expect(unicodeHostname('xn--bcher-kva.example')).toBe('bücher.example');
    expect(unicodeHostname('xn--ü-abc.example')).toBe('xn--ü-abc.example');
    expect(unicodeHostname('xn--a-99999.example')).toBe('xn--a-99999.example');
    expect(unicodeHostname('xn--a-!.example')).toBe('xn--a-!.example');
    expect(unicodeHostname('xn--mnchen-3ya.example')).toBe('münchen.example');
    expect(unicodeHostname('xn--4ca.example')).toBe('ä.example');
  });
});

describe('jump jwks validation', () => {
  const good = {
    kty: 'EC',
    crv: 'P-384',
    kid: 'k',
    alg: 'ES384',
    use: 'sig',
    x: 'A'.repeat(64),
    y: 'A'.repeat(64),
  };
  test.each([
    ['json', () => parseJumpJwks('{')],
    ['non-record key', () => validateJumpJwks({ keys: [1] })],
    ['missing field', () => validateJumpJwks({ keys: [{ ...good, kid: '' }] })],
    ['kty', () => validateJumpJwks({ keys: [{ ...good, kty: 'RSA' }] })],
    ['use', () => validateJumpJwks({ keys: [{ ...good, use: 'enc' }] })],
  ])('rejects %s', (_label, fn) => {
    expect(fn).toThrow(JumpError);
  });
});

describe('jwks cache negative entries', () => {
  test('expired negative entries are purged and refetched', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn(async () => ({ keys: [] }));
      const cache = new JwksCache(fetcher, 0, 10, 0);
      await expect(cache.getKey(ISSUER, 'missing', 'ES384')).rejects.toThrow(JumpError);
      expect(fetcher).toHaveBeenCalledTimes(2);
      await expect(cache.getKey(ISSUER, 'missing', 'ES384')).rejects.toThrow(JumpError);
      expect(fetcher).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(20);
      await expect(cache.getKey(ISSUER, 'missing', 'ES384')).rejects.toThrow(JumpError);
      expect(fetcher).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  test('the 1025th negative entry evicts the oldest but preserves newer entries', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn(async () => ({ keys: [] }));
      const cache = new JwksCache(fetcher, 60_000, 60_000, 0);
      for (let i = 0; i < 1024; i += 1) {
        await expect(cache.getKey(ISSUER, `k${i}`, 'ES384')).rejects.toThrow(JumpError);
      }
      const filledCalls = fetcher.mock.calls.length;
      await expect(cache.getKey(ISSUER, 'k0', 'ES384')).rejects.toThrow(JumpError);
      expect(fetcher).toHaveBeenCalledTimes(filledCalls);

      await expect(cache.getKey(ISSUER, 'k1024', 'ES384')).rejects.toThrow(JumpError);
      expect(fetcher).toHaveBeenCalledTimes(filledCalls + 1);
      await expect(cache.getKey(ISSUER, 'k1', 'ES384')).rejects.toThrow(JumpError);
      await expect(cache.getKey(ISSUER, 'k1024', 'ES384')).rejects.toThrow(JumpError);
      expect(fetcher).toHaveBeenCalledTimes(filledCalls + 1);
      await expect(cache.getKey(ISSUER, 'k0', 'ES384')).rejects.toThrow(JumpError);
      expect(fetcher).toHaveBeenCalledTimes(filledCalls + 2);
    } finally {
      vi.useRealTimers();
    }
  });

  test('capacity cleanup removes expired entries before evicting a live entry', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn(async () => ({ keys: [] }));
      const cache = new JwksCache(fetcher, 60_000, 10, 0);
      for (let i = 0; i < 1024; i += 1) {
        if (i === 512) vi.advanceTimersByTime(5);
        await expect(cache.getKey(ISSUER, `k${i}`, 'ES384')).rejects.toThrow(JumpError);
      }
      vi.advanceTimersByTime(5);
      await expect(cache.getKey(ISSUER, 'k1024', 'ES384')).rejects.toThrow(JumpError);
      const afterCleanup = fetcher.mock.calls.length;
      await expect(cache.getKey(ISSUER, 'k512', 'ES384')).rejects.toThrow(JumpError);
      expect(fetcher).toHaveBeenCalledTimes(afterCleanup);
      await expect(cache.getKey(ISSUER, 'k0', 'ES384')).rejects.toThrow(JumpError);
      expect(fetcher).toHaveBeenCalledTimes(afterCleanup + 1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('fetchRegistryJwks edges', () => {
  test('rejects an unparseable jwks_uri', async () => {
    await expect(fetchRegistryJwks({ ...ISSUER, jwks_uri: 'not a url' })).rejects.toMatchObject({
      code: 'jwks_bad_gateway',
    });
  });

  test('rejects a jwks_uri with a non-https scheme', async () => {
    await expect(
      fetchRegistryJwks({ ...ISSUER, jwks_uri: 'http://app.example.com/.well-known/jwks.json' }),
    ).rejects.toMatchObject({ code: 'jwks_bad_gateway' });
  });

  test.each([
    ['no content-type', new Response('{}', { status: 200 })],
    ['non-object json', jsonResponse('1')],
    ['non-array keys', jsonResponse('{"keys":1}')],
    ['non-object key', jsonResponse('{"keys":[null]}')],
    [
      'bad key_ops',
      jsonResponse(
        JSON.stringify({
          keys: [
            {
              kty: 'EC',
              crv: 'P-384',
              alg: 'ES384',
              kid: 'k',
              x: 'A'.repeat(64),
              y: 'A'.repeat(64),
              key_ops: ['sign'],
            },
          ],
        }),
      ),
    ],
  ])('rejects %s', async (_label, response) => {
    vi.stubGlobal('fetch', async () => response);
    try {
      await expect(fetchRegistryJwks(ISSUER)).rejects.toMatchObject({ code: 'jwks_bad_gateway' });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test('bodyless responses use text with a size cap', async () => {
    const large = 'x'.repeat(70_000);
    const fake = {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      body: null,
      text: async () => large,
    };
    vi.stubGlobal('fetch', async () => fake);
    try {
      await expect(fetchRegistryJwks(ISSUER)).rejects.toMatchObject({ code: 'jwks_bad_gateway' });
      fake.text = async () => '{"keys":[]}';
      await expect(fetchRegistryJwks(ISSUER)).rejects.toMatchObject({ code: 'jwks_bad_gateway' });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test('network errors carry safe diagnostic metadata', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('x', { cause: Object.assign(new Error('c'), { code: 42 }) });
    });
    try {
      await expect(fetchRegistryJwks(ISSUER)).rejects.toMatchObject({ code: 'jwks_unavailable' });
      expect(error.mock.calls.at(-1)?.[0]).toContain('"cause_code":42');
    } finally {
      vi.unstubAllGlobals();
      error.mockRestore();
    }
  });

  test('a body read rejection cancels the reader on abort', async () => {
    const controller = new AbortController();
    const body = new ReadableStream({
      pull() {
        controller.abort();
        return new Promise(() => {});
      },
    });
    vi.stubGlobal('fetch', async () => jsonResponse(body));
    try {
      await expect(fetchRegistryJwks(ISSUER, controller.signal)).rejects.toMatchObject({
        code: 'deadline_exceeded',
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

function jsonResponse(body: BodyInit) {
  return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('createApp registry validation and adapter edges', () => {
  const base = {
    iss: 'https://app.example.com',
    jwks_uri: 'https://app.example.com/.well-known/jwks.json',
    allowed_dst_internal: ['https://docs.example.com'],
    allowed_dst_external: false as const,
  };
  const build = (issuer: Record<string, unknown>, key = String(issuer.iss)) =>
    createProductionApp({
      registry: { [key]: issuer } as never,
      fetchJwks: async () => ({ keys: [] }),
      config: { serviceOrigin: PRODUCTION_SERVICE_ORIGIN },
    });

  test.each([
    ['key mismatch', base, 'https://other.example.com'],
    [
      'http issuer',
      {
        ...base,
        iss: 'http://app.example.com',
        jwks_uri: 'http://app.example.com/.well-known/jwks.json',
      },
    ],
    [
      'issuer with port',
      {
        ...base,
        iss: 'https://app.example.com:8443',
        jwks_uri: 'https://app.example.com:8443/.well-known/jwks.json',
      },
    ],
    ['external policy shape', { ...base, allowed_dst_external: true }],
    ['http destination', { ...base, allowed_dst_internal: ['http://docs.example.com'] }],
    ['destination with path', { ...base, allowed_dst_internal: ['https://docs.example.com/x'] }],
    [
      'external list destination with port',
      { ...base, allowed_dst_external: ['https://e.example:444'] },
    ],
  ])('rejects %s', (_label, issuer, key?: string) => {
    expect(() => build(issuer, key)).toThrow(JumpError);
  });

  test('accepts an external allow-list', () => {
    expect(() => build({ ...base, allowed_dst_external: ['https://e.example'] })).not.toThrow();
  });

  const app = () =>
    createProductionApp({
      registry: { [base.iss]: base },
      fetchJwks: async () => ({ keys: [] }),
      config: { serviceOrigin: PRODUCTION_SERVICE_ORIGIN },
      jumpJwksForRequest: async () => {
        throw new Error('boom');
      },
    });

  test('an already-aborted adapter deadline returns deadline_exceeded', async () => {
    const controller = new AbortController();
    controller.abort();
    const res = await app().fetch(
      new Request(`${PRODUCTION_SERVICE_ORIGIN}/?rt=a.b.c`, { headers: { 'CF-Ray': 'abc-NRT' } }),
      {},
      undefined,
      { requestId: 'r', signal: controller.signal },
    );
    expect(res.status).toBe(504);
  });

  test('a non-JumpError from a route becomes internal_error', async () => {
    const res = await app().request(`${PRODUCTION_SERVICE_ORIGIN}/.well-known/jwks.json`);
    expect(res.status).toBe(500);
  });

  test('a jump request logs cf_ray when present', async () => {
    const audit = vi.fn();
    const res = await createProductionApp({
      registry: { [base.iss]: base },
      fetchJwks: async () => ({ keys: [] }),
      config: { serviceOrigin: PRODUCTION_SERVICE_ORIGIN },
      auditLog: audit,
    }).request(`${PRODUCTION_SERVICE_ORIGIN}/?rt=a.b.c`, { headers: { 'CF-Ray': 'abc-NRT' } });
    expect(res.status).toBe(400);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ cf_ray: 'abc-NRT' }));
  });
});

test('createApp fetch works without an adapter context', async () => {
  const res = await createProductionApp({
    registry: {},
    fetchJwks: async () => ({ keys: [] }),
    config: { serviceOrigin: PRODUCTION_SERVICE_ORIGIN },
  }).fetch(new Request(`${PRODUCTION_SERVICE_ORIGIN}/health.json`));
  expect(res.status).toBe(200);
});

test('service origin rejects the AS112 range', () => {
  expect(() => validateServiceOrigin('https://192.88.99.1')).toThrow(JumpError);
});

test('punycode accepts upper-case digits', () => {
  expect(unicodeHostname('xn--bcher-KVA.example')).toBe('bücher.example');
});

describe('fetchRegistryJwks error metadata', () => {
  test.each([
    ['missing content-type', async () => new Response(new Uint8Array([123, 125]))],
    [
      'AbortError without a signal',
      async () => {
        throw new DOMException('aborted', 'AbortError');
      },
    ],
    [
      'non-Error throw',
      async () => {
        throw 'nope';
      },
    ],
  ])('%s', async (_label, impl) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', impl);
    try {
      await expect(fetchRegistryJwks(ISSUER)).rejects.toBeInstanceOf(JumpError);
    } finally {
      vi.unstubAllGlobals();
      error.mockRestore();
    }
  });
});

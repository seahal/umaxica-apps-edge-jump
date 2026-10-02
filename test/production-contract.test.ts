import { assertDefined } from './assert-defined';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { exportJWK, exportPKCS8, generateKeyPair, jwtVerify, SignJWT } from 'jose';
import worker, { resetIsolateCachesForTest, type CloudflareEnv } from '../src/cloudflare';
import { registry } from '../src/config/registry.umaxica';
import { assertDestinationPolicy } from '../src/core/policy';
import { normalizeUrl } from '../src/core/normalize_url';
import type { InboundJumpClaim } from '../src/core/types';
import receiverContract from './fixtures/receiver-contract.json';

// Independent literal expectations: never derived from implementation registry.
const nodes = {
  'auth-app-ww': 'https://auth.umaxica.app',
  'auth-com-ww': 'https://auth.umaxica.com',
  'auth-org-ww': 'https://auth.umaxica.org',
  'base-app-ww': 'https://www.umaxica.app',
  'base-com-ww': 'https://www.umaxica.com',
  'base-org-ww': 'https://www.umaxica.org',
  'core-app-jp': 'https://jp.umaxica.app',
  'core-com-jp': 'https://jp.umaxica.com',
  'core-org-jp': 'https://jp.umaxica.org',
  'warp-app-jp': 'https://www-jp.umaxica.app',
  'warp-com-jp': 'https://www-jp.umaxica.com',
  'warp-org-jp': 'https://www-jp.umaxica.org',
  'palm-app-jp': 'https://palm-jp.umaxica.app',
} as const;
type Node = keyof typeof nodes;
const edges: [Node, Node][] = [
  ['auth-app-ww', 'base-app-ww'],
  ['auth-com-ww', 'base-com-ww'],
  ['auth-org-ww', 'base-org-ww'],
  ['base-app-ww', 'auth-app-ww'],
  ['base-app-ww', 'core-app-jp'],
  ['base-app-ww', 'palm-app-jp'],
  ['base-app-ww', 'warp-app-jp'],
  ['base-com-ww', 'auth-com-ww'],
  ['base-com-ww', 'core-com-jp'],
  ['base-com-ww', 'warp-com-jp'],
  ['base-org-ww', 'auth-org-ww'],
  ['base-org-ww', 'core-org-jp'],
  ['base-org-ww', 'warp-org-jp'],
  ['core-app-jp', 'base-app-ww'],
  ['core-com-jp', 'base-com-ww'],
  ['core-org-jp', 'base-org-ww'],
  ['palm-app-jp', 'base-app-ww'],
  ['warp-app-jp', 'base-app-ww'],
  ['warp-com-jp', 'base-com-ww'],
  ['warp-org-jp', 'base-org-ww'],
];
const jump = 'https://jump.umaxica.net';
const runtime = { edge: 'cloudflare', production: true } as const;
const now = () => Math.floor(Date.now() / 1000);
function claim(src: Node = 'auth-app-ww', dst: Node = 'base-app-ww'): InboundJumpClaim {
  return {
    schema: 1,
    rpl: 'reuse',
    iss: nodes[src],
    aud: jump,
    sub: 'jump-redirect',
    iat: now(),
    nbf: now(),
    exp: now() + 60,
    jti: crypto.randomUUID(),
    dst: 'internal',
    url: `${nodes[dst]}/receive?state=keep&redirect_uri=https%3A%2F%2Fclient.example%2Fcb&q=a%20b`,
  };
}
const issuerKeys = new Map<string, Awaited<ReturnType<typeof generateKeyPair>>>();
let jumpKeys: Awaited<ReturnType<typeof generateKeyPair>>;
let env: CloudflareEnv;
let jwks: Record<string, unknown[]>;
beforeAll(async () => {
  jwks = {};
  for (const origin of Object.values(nodes)) {
    const keys = await generateKeyPair('ES384', { extractable: true });
    issuerKeys.set(origin, keys);
    jwks[`${origin}/.well-known/jwks.json`] = [
      { ...(await exportJWK(keys.publicKey)), kid: 'same-kid', alg: 'ES384', use: 'sig' },
    ];
  }
  jumpKeys = await generateKeyPair('ES384', { extractable: true });
  env = {
    UMAXICA_JUMP_ORIGIN: jump,
    UMAXICA_JUMP_PRIVATE_KEY_KID: 'opaque-active',
    UMAXICA_JUMP_PRIVATE_KEY_PEM: await exportPKCS8(jumpKeys.privateKey),
    UMAXICA_JUMP_PUBLIC_JWKS: JSON.stringify({
      keys: [
        {
          ...(await exportJWK(jumpKeys.publicKey)),
          kid: 'opaque-active',
          alg: 'ES384',
          use: 'sig',
        },
      ],
    }),
    JUMP_RATE_LIMITER: { limit: async () => ({ success: true }) },
  };
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetIsolateCachesForTest();
});
function mockJwks() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const key = input instanceof Request ? input.url : input.toString();
    expect(Object.hasOwn(jwks, key)).toBe(true);
    return Response.json({ keys: jwks[key] });
  });
}
async function token(payload: Record<string, unknown>, keyOrigin: string = nodes['auth-app-ww']) {
  return new SignJWT(payload)
    .setProtectedHeader({ typ: 'JWT', alg: 'ES384', kid: 'same-kid' })
    .sign(assertDefined(issuerKeys.get(keyOrigin)).privateKey);
}
async function request(
  path: string,
  settings: CloudflareEnv = env,
  method = 'GET',
  ip: string | null = '203.0.113.7',
) {
  return worker.fetch(
    new Request(`${settings.UMAXICA_JUMP_ORIGIN || jump}${path}`, {
      method,
      headers: ip === null ? {} : { 'CF-Connecting-IP': ip, 'X-Request-ID': 'untrusted' },
    }),
    settings,
    {} as ExecutionContext,
  );
}
function hygiene(res: Response) {
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(res.headers.get('referrer-policy')).toBe('no-referrer');
  expect(res.headers.get('set-cookie')).toBeNull();
  expect(res.headers.get('strict-transport-security')).toBe(
    'max-age=31536000; includeSubDomains; preload',
  );
  expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  expect(res.headers.get('x-request-id')).not.toBe('untrusted');
}
async function denied(res: Response, status = 400, code = 'invalid_request', head = false) {
  expect(res.status).toBe(status);
  expect(res.headers.get('x-jump-error')).toBe(code);
  expect(res.headers.get('location')).toBeNull();
  hygiene(res);
  if (head) expect(await res.text()).toBe('');
}

describe('A: exact production graph', () => {
  test('13 nodes / 169 ordered pairs / 20 allow / 149 deny', () => {
    expect(Object.keys(registry).sort()).toEqual(Object.values(nodes).sort());
    let count = 0;
    for (const [src, origin] of Object.entries(nodes)) {
      const issuer = assertDefined(registry[origin]);
      expect(issuer.jwks_uri).toBe(`${origin}/.well-known/jwks.json`);
      expect(issuer.allowed_dst_external).toBe(false);
      expect(issuer.allowed_dst_internal.slice().sort()).toEqual(
        edges
          .filter(([a]) => a === src)
          .map(([, b]) => nodes[b])
          .sort(),
      );
      for (const [dst, destination] of Object.entries(nodes)) {
        const expected = edges.some(([a, b]) => a === src && b === dst);
        const check = () =>
          assertDestinationPolicy(
            claim(src as Node, dst as Node),
            issuer,
            normalizeUrl(`${destination}/receive`, runtime, jump),
          );
        if (expected) {
          expect(check).not.toThrow();
          count++;
        } else expect(check).toThrow();
      }
    }
    expect(count).toBe(20);
    expect(169 - count).toBe(149);
  });
  test('C: frozen Base/Auth six allow and twelve cross-TLD deny', () => {
    for (const a of ['app', 'com', 'org'] as const)
      for (const b of ['app', 'com', 'org'] as const)
        for (const [src, dst] of [
          [`auth-${a}-ww`, `base-${b}-ww`],
          [`base-${a}-ww`, `auth-${b}-ww`],
        ] as [Node, Node][]) {
          const check = () =>
            assertDestinationPolicy(
              claim(src, dst),
              assertDefined(registry[nodes[src]]),
              normalizeUrl(`${nodes[dst]}/receive`, runtime, jump),
            );
          if (a === b) expect(check).not.toThrow();
          else expect(check).toThrow();
        }
  });
});

describe('B: real issuer-specific signatures through Worker adapter', () => {
  test.each(edges)('%s -> %s', async (src, dst) => {
    mockJwks();
    const input = await token(claim(src, dst), nodes[src]);
    const res = await request(`/?rt=${input}`);
    expect(res.status).toBe(302);
    hygiene(res);
    const location = new URL(assertDefined(res.headers.get('location')));
    expect(location.origin).toBe(nodes[dst]);
    expect(location.pathname).toBe('/receive');
    expect(location.searchParams.getAll('rt')).toHaveLength(1);
    const verified = await jwtVerify(
      assertDefined(location.searchParams.get('rt')),
      jumpKeys.publicKey,
      {
        issuer: jump,
        audience: nodes[dst],
        algorithms: ['ES384'],
      },
    );
    expect(verified.protectedHeader).toEqual({ alg: 'ES384', typ: 'JWT', kid: 'opaque-active' });
    location.searchParams.delete('rt');
    expect(verified.payload).toMatchObject({
      schema: 1,
      rpl: 'reuse',
      iss: jump,
      aud: nodes[dst],
      src: nodes[src],
      dst: 'internal',
      sub: 'jump-redirect',
      url: location.href,
    });
    expect(Object.keys(verified.payload).sort()).toEqual(
      [...receiverContract.required_claims].sort(),
    );
    expect(Number(verified.payload.exp) - Number(verified.payload.iat)).toBe(
      receiverContract.ttl_seconds,
    );
    expect(verified.payload.jti).not.toBe(claim().jti);
    expect(location.searchParams.get('state')).toBe('keep');
    expect(location.searchParams.get('q')).toBe('a b');
  });
});

describe('E: reuse strict type partitions', () => {
  test.each(
    [undefined, null, '', ' ', 'once', 'Reuse', 'REUSE', 'other', false, true, 0, [], {}].map(
      (rpl) => ({ rpl }),
    ),
  )('rejects rpl $rpl', async ({ rpl }) => {
    const fetch = mockJwks();
    const data: Record<string, unknown> = { ...claim(), rpl };
    if (rpl === undefined) delete data.rpl;
    await denied(await request(`/?rt=${await token(data)}`));
    expect(fetch).not.toHaveBeenCalled();
  });
  test('re-evaluates reuse and emits fresh jti', async () => {
    mockJwks();
    const input = await token(claim());
    const outputs = [];
    for (let i = 0; i < 2; i++) {
      const res = await request(`/?rt=${input}`);
      expect(res.status).toBe(302);
      const location = new URL(assertDefined(res.headers.get('location')));
      const rt = assertDefined(location.searchParams.get('rt'));
      outputs.push((await jwtVerify(rt, jumpKeys.publicKey)).payload);
    }
    expect(assertDefined(outputs[0]).jti).not.toBe(assertDefined(outputs[1]).jti);
    expect(outputs.map((p) => p.rpl)).toEqual(['reuse', 'reuse']);
  });
});
describe('G/H/I: adapter boundaries', () => {
  test.each(['/about', '/about/', '/foo/', '//', '/favicon.ico', '/.well-known/jwks.json'])(
    'rt nonroot %s GET/HEAD',
    async (path) => {
      for (const method of ['GET', 'HEAD'])
        for (const key of ['rt', '%72t', 'rt%5B%5D', 'rt%5Bx%5D'])
          await denied(
            await request(`${path}?${key}=secret-token`, env, method),
            400,
            'invalid_request',
            method === 'HEAD',
          );
    },
  );
  test.each(['?x=1', '?rt=', '?rt=a&rt=b', '?rt[]=x'])('invalid root %s', async (query) =>
    denied(await request(`/${query}`)),
  );
  test.each([
    undefined,
    '',
    'https://jump.example.net/',
    'http://jump.example.net',
    'https://localhost',
    'https://internal',
    'https://127.0.0.1',
    'https://jump.example.net:444',
    'https://jump.example.net.',
    'https://www.umaxica.app',
    'https://jump.example.net?q=1',
  ])('invalid configured origin %j', async (origin) => {
    await denied(
      await worker.fetch(
        new Request(`${jump}/about`),
        { ...env, UMAXICA_JUMP_ORIGIN: origin } as CloudflareEnv,
        {} as ExecutionContext,
      ),
      503,
      'service_unavailable',
    );
  });
  test('request origin mismatch ignores forwarded host', async () => {
    const res = await worker.fetch(
      new Request('https://other.example/about', {
        headers: { 'CF-Connecting-IP': '203.0.113.1', Forwarded: `host=${jump}` },
      }),
      env,
      {} as ExecutionContext,
    );
    await denied(res);
  });
  test.each([null, '', 'invalid', '127.1', '1.2.3.999', '203.0.113.1:99'])(
    'invalid IP %j',
    async (ip) => denied(await request('/about', env, 'GET', ip), 503, 'service_unavailable'),
  );
  test.each([undefined, null, {}, { success: 'false' }, { success: 0 }, { success: 1 }])(
    'invalid result %j',
    async (result) => {
      const settings = {
        ...env,
        JUMP_RATE_LIMITER: { limit: async () => result },
      } as CloudflareEnv;
      await denied(await request('/about', settings), 503, 'service_unavailable');
    },
  );
  test('missing limiter', async () => {
    const settings = { ...env };
    delete settings.JUMP_RATE_LIMITER;
    await denied(await request('/about', settings), 503, 'service_unavailable');
  });
  test('explicit false', async () =>
    denied(
      await request('/about', {
        ...env,
        JUMP_RATE_LIMITER: { limit: async () => ({ success: false }) },
      }),
      429,
      'rate_limited',
    ));
  test('call exception continues crypto; never permits invalid token', async () => {
    mockJwks();
    const settings = {
      ...env,
      JUMP_RATE_LIMITER: {
        limit: async () => {
          throw new Error('secret-url');
        },
      },
    };
    await denied(await request('/?rt=invalid', settings));
    expect((await request(`/?rt=${await token(claim())}`, settings)).status).toBe(302);
  });
  test('limiter deadline and late rejection', async () => {
    let reject!: (e: Error) => void;
    const settings = {
      ...env,
      JUMP_RATE_LIMITER: {
        limit: () =>
          new Promise<{ success: boolean }>((_, r) => {
            reject = r;
          }),
      },
    };
    await denied(await request('/about', settings, 'HEAD'), 504, 'deadline_exceeded', true);
    reject(new Error('late'));
    await Promise.resolve();
  });
  test('ASSETS rejection uses outer boundary', async () =>
    denied(
      await request('/favicon.ico', {
        ...env,
        ASSETS: {
          fetch: async () => {
            throw new Error('secret');
          },
        },
      }),
      500,
      'internal_error',
    ));
});

describe('D/F/G/J/K: crypto, URL and configuration boundaries', () => {
  test('alternate canonical identity binds aud, iss, discovery and request URL', async () => {
    mockJwks();
    const alternate = 'https://broker.example.net';
    const settings = { ...env, UMAXICA_JUMP_ORIGIN: alternate };
    const data = { ...claim(), aud: alternate };
    const res = await request(`/?rt=${await token(data)}`, settings);
    expect(res.status).toBe(302);
    const location = new URL(assertDefined(res.headers.get('location')));
    const rt = assertDefined(location.searchParams.get('rt'));
    expect((await jwtVerify(rt, jumpKeys.publicKey, { issuer: alternate })).payload.iss).toBe(
      alternate,
    );
    expect(await (await request('/sitemap.xml', settings)).text()).toContain(`${alternate}/about`);
    await denied(await request(`/?rt=${await token(claim())}`, settings));
    await denied(await request(`/?rt=${await token({ ...data, url: `${alternate}/` })}`, settings));
  });
  test.each([
    ['auth-app-ww', 'core-app-jp'],
    ['core-app-jp', 'auth-app-ww'],
    ['core-app-jp', 'warp-app-jp'],
    ['base-app-ww', 'base-app-ww'],
    ['base-app-ww', 'core-com-jp'],
  ] as [Node, Node][])('high-value forbidden edge %s -> %s', async (src, dst) => {
    mockJwks();
    await denied(await request(`/?rt=${await token(claim(src, dst), nodes[src])}`));
  });
  test('different issuer key with identical kid is rejected even after warm cache', async () => {
    mockJwks();
    expect((await request(`/?rt=${await token(claim())}`)).status).toBe(302);
    await denied(await request(`/?rt=${await token(claim(), nodes['auth-com-ww'])}`));
  });
  test.each([
    'https://edit.umaxica.org/a',
    'https://palm.umaxica.app/a',
    'https://www.jp.umaxica.app/a',
    'https://jpx.umaxica.app/a',
    'https://us.umaxica.app/a',
    'https://palm.jp.umaxica.app/a',
    'http://www.umaxica.app/a',
    'https://127.0.0.1/a',
    'https://169.254.169.254/a',
    'https://user@www.umaxica.app/a',
    'https://www.umaxica.app/a#fragment',
    'https://www.umaxica.app/a?rt=existing',
    'https://www.umaxica.app/a?rt%5Bx%5D=existing',
    'https://www.umaxica.app/a?state=a&state=b',
    'https://www.umaxica.app/a?x=%xx',
    'https://www.umaxica.app/a\\b',
    'https://www.umaxica.app/\0a',
  ])('rejects URL partition %s', async (url) => {
    mockJwks();
    await denied(await request(`/?rt=${await token({ ...claim(), url })}`));
  });
  test.each([299, 300, 301])('TTL BVA %i without leeway in structure', async (ttl) => {
    mockJwks();
    const t = now();
    const res = await request(`/?rt=${await token({ ...claim(), iat: t, nbf: t, exp: t + ttl })}`);
    if (ttl <= 300) expect(res.status).toBe(302);
    else await denied(res);
  });
  test.each([127, 128, 129])('kid length BVA %i', async (length) => {
    const fetch = mockJwks();
    const rt = await new SignJWT(claim())
      .setProtectedHeader({ typ: 'JWT', alg: 'ES384', kid: 'k'.repeat(length) })
      .sign(assertDefined(issuerKeys.get(nodes['auth-app-ww'])).privateKey);
    await denied(await request(`/?rt=${rt}`));
    if (length > 128) expect(fetch).not.toHaveBeenCalled();
    else expect(fetch).toHaveBeenCalled();
  });
  test.each([8191, 8192, 8193])('compact token size BVA %i', async (length) => {
    const fetch = mockJwks();
    const data = { ...claim(), padding: '' };
    let rt = await token(data);
    let n = Math.floor(((length - rt.length) * 3) / 4);
    for (let i = 0; i < 8; i++) {
      data.padding = 'a'.repeat(n);
      rt = await token(data);
      if (rt.length === length) break;
      n += rt.length < length ? 1 : -1;
    }
    expect(rt.length).toBe(length);
    const res = await request(`/?rt=${rt}`);
    if (length <= 8192) expect(res.status).toBe(302);
    else {
      await denied(res);
      expect(fetch).not.toHaveBeenCalled();
    }
  });
  test.each([null, false, 0, 'scalar', []].map((root) => ({ root })))(
    'header/payload JSON root $root is 400 before fetch',
    async ({ root }) => {
      const fetch = mockJwks();
      const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
      await denied(await request(`/?rt=${encode(root)}.${encode(claim())}.AAAA`));
      await denied(
        await request(
          `/?rt=${encode({ typ: 'JWT', alg: 'ES384', kid: 'same-kid' })}.${encode(root)}.AAAA`,
        ),
      );
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  test('production external capability stays disabled for all issuers', async () => {
    mockJwks();
    for (const origin of Object.values(nodes))
      await denied(
        await request(
          `/?rt=${await token({ ...claim(), iss: origin, dst: 'external', url: 'https://external.example/a' }, origin)}`,
        ),
      );
  });
  test('legacy aliases alone cannot configure signer', async () => {
    const settings = { ...env };
    delete settings.UMAXICA_JUMP_PRIVATE_KEY_PEM;
    delete settings.UMAXICA_JUMP_PRIVATE_KEY_KID;
    delete settings.UMAXICA_JUMP_PUBLIC_JWKS;
    Object.assign(settings, {
      JUMP_PRIVATE_KEY_PEM: env.UMAXICA_JUMP_PRIVATE_KEY_PEM,
      JUMP_PRIVATE_KEY_KID: env.UMAXICA_JUMP_PRIVATE_KEY_KID,
      UMAXICA_JUMP_PUBLIC_KEYSET: env.UMAXICA_JUMP_PUBLIC_JWKS,
    });
    await denied(await request('/.well-known/jwks.json', settings), 503, 'service_unavailable');
  });
  test.each(['active-grace', 'active-future'])(
    'explicit %s keyset publishes all keys and signs with active kid',
    async (label) => {
      mockJwks();
      const other = await generateKeyPair('ES384', { extractable: true });
      const active = JSON.parse(env.UMAXICA_JUMP_PUBLIC_JWKS as string).keys[0];
      const settings = {
        ...env,
        UMAXICA_JUMP_PUBLIC_JWKS: JSON.stringify({
          keys: [
            {
              ...(await exportJWK(other.publicKey)),
              kid: label,
              alg: 'ES384',
              use: 'sig',
              key_ops: ['verify'],
            },
            active,
          ],
        }),
      };
      const published = await request('/.well-known/jwks.json', settings);
      expect(published.status).toBe(200);
      expect(((await published.json()) as { keys: unknown[] }).keys).toHaveLength(2);
      expect((await request(`/?rt=${await token(claim())}`, settings)).status).toBe(302);
    },
  );
  test.each([
    'old-only',
    'duplicate',
    'private',
    'curve',
    'alg',
    'coordinate',
    'key_ops',
    'empty',
    'broken',
  ])('invalid public bundle %s', async (kind) => {
    const active = JSON.parse(env.UMAXICA_JUMP_PUBLIC_JWKS as string).keys[0];
    let keys = [{ ...active }];
    if (kind === 'old-only') keys[0].kid = 'retired';
    if (kind === 'duplicate') keys.push({ ...active });
    if (kind === 'private') keys[0].d = 'secret';
    if (kind === 'curve') keys[0].crv = 'P-256';
    if (kind === 'alg') keys[0].alg = 'ES256';
    if (kind === 'coordinate') keys[0].x = 'invalid';
    if (kind === 'key_ops') keys[0].key_ops = ['sign'];
    if (kind === 'empty') keys = [];
    await denied(
      await request('/.well-known/jwks.json', {
        ...env,
        UMAXICA_JUMP_PUBLIC_JWKS: kind === 'broken' ? 'null' : JSON.stringify({ keys }),
      }),
      503,
      'service_unavailable',
    );
  });
  test('same kid, different active key fails pair check', async () => {
    const other = await generateKeyPair('ES384', { extractable: true });
    await denied(
      await request('/.well-known/jwks.json', {
        ...env,
        UMAXICA_JUMP_PRIVATE_KEY_PEM: await exportPKCS8(other.privateKey),
      }),
      503,
      'service_unavailable',
    );
  });
  test('secret retrieval reject gets headers and 503 without exposing message', async () => {
    await denied(
      await request('/.well-known/jwks.json', {
        ...env,
        UMAXICA_JUMP_PRIVATE_KEY_PEM: {
          get: async () => {
            throw new Error('private-sensitive');
          },
        },
      }),
      503,
      'service_unavailable',
    );
  });
  test('limiter callable configuration and method precedence', async () => {
    await denied(
      await request('/about', {
        ...env,
        JUMP_RATE_LIMITER: {} as NonNullable<CloudflareEnv['JUMP_RATE_LIMITER']>,
      }),
      503,
      'service_unavailable',
    );
    const response = await request('/about?rt=secret', env, 'POST');
    await denied(response, 405, 'method_not_allowed');
    expect(response.headers.get('allow')).toBe('GET, HEAD');
  });
  test('deadline includes late ASSETS completion', async () => {
    let complete!: (r: Response) => void;
    const settings = {
      ...env,
      ASSETS: {
        fetch: () =>
          new Promise<Response>((resolve) => {
            complete = resolve;
          }),
      },
    };
    await denied(await request('/favicon.ico', settings), 504, 'deadline_exceeded');
    complete(
      new Response(null, { status: 302, headers: { location: 'https://untrusted.example' } }),
    );
    await Promise.resolve();
  });
});

describe('construction and runtime defensive policy', () => {
  test('rejects duplicate nodes/origins/edges, unknown nodes, cross-TLD and self edges', async () => {
    const { buildRegistry } = await import('../src/config/registry.umaxica');
    const table = Object.entries(nodes) as [string, string][];
    expect(Object.keys(buildRegistry(table, edges))).toHaveLength(13);
    for (const invalid of [
      [...table, assertDefined(table[0])],
      [...table, ['zzzz-zzz-zz', assertDefined(table[0])[1]]],
      [['auth-app-ww', 'http://auth.umaxica.app']],
      [['auth-app-ww', 'https://auth.umaxica.app/']],
    ])
      expect(() => buildRegistry(invalid as [string, string][], [])).toThrow();
    for (const invalid of [
      [...edges, assertDefined(edges[0])],
      [['zzzz-zzz-zz', 'base-app-ww']],
      [['base-app-ww', 'base-app-ww']],
      [['base-app-ww', 'auth-com-ww']],
    ])
      expect(() => buildRegistry(table, invalid as [string, string][])).toThrow();
  });
  test('misconfigured self-loop is denied for internal and external', () => {
    const data = claim();
    data.url = `${data.iss}/receive`;
    const issuer = {
      iss: data.iss,
      jwks_uri: `${data.iss}/.well-known/jwks.json`,
      allowed_dst_internal: [data.iss],
      allowed_dst_external: [data.iss],
    };
    for (const dst of ['internal', 'external'] as const)
      expect(() =>
        assertDestinationPolicy({ ...data, dst }, issuer, normalizeUrl(data.url, runtime, jump)),
      ).toThrow();
  });
  test('prototype names are never registered issuers', async () => {
    const fetch = mockJwks();
    for (const iss of ['toString', 'constructor', '__proto__'])
      await denied(await request(`/?rt=${await token({ ...claim(), iss })}`));
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('F/K: remaining validation partitions', () => {
  test('registry initialization configuration failure is 503 with HEAD hygiene', async () => {
    const issuer = assertDefined(registry[nodes['auth-app-ww']]);
    const previous = issuer.jwks_uri;
    issuer.jwks_uri = 'https://foreign.example/jwks';
    try {
      await denied(await request('/about', env, 'HEAD'), 503, 'service_unavailable', true);
    } finally {
      issuer.jwks_uri = previous;
    }
  });
  test('oversized outbound RT is refused although input fits', async () => {
    mockJwks();
    let input = '';
    let n = 5500;
    for (; n < 6050; n++) {
      input = await token({
        ...claim(),
        url: `${nodes['base-app-ww']}/receive?q=${'a'.repeat(n)}`,
      });
      if (input.length >= 8150) break;
    }
    expect(input.length).toBeGreaterThanOrEqual(8150);
    expect(input.length).toBeLessThanOrEqual(8192);
    await denied(await request(`/?rt=${input}`));
  });
  test.each(
    ['iat', 'nbf', 'exp', 'url', 'jti', 'aud', 'sub', 'dst'].flatMap((field) =>
      [undefined, null, 0, false, [], {}]
        .filter((value) => !(['iat', 'nbf', 'exp'].includes(field) && value === 0))
        .map((value) => ({ field, value })),
    ),
  )('claim $field invalid type $value', async ({ field, value }) => {
    mockJwks();
    const data: Record<string, unknown> = { ...claim(), [field]: value };
    if (value === undefined) delete data[field];
    await denied(await request(`/?rt=${await token(data)}`));
  });
  test('zero NumericDates are evaluated by relationships and expiry, not truthiness', async () => {
    mockJwks();
    await denied(await request(`/?rt=${await token({ ...claim(), iat: 0, nbf: 0, exp: 300 })}`));
  });
  test.each(['jku', 'jwk', 'x5u', 'crit'])('header hint %s rejected before fetch', async (hint) => {
    const fetch = mockJwks();
    const signed = await token(claim());
    const parts = signed.split('.');
    parts[0] = Buffer.from(
      JSON.stringify({
        typ: 'JWT',
        alg: 'ES384',
        kid: 'same-kid',
        [hint]: hint === 'crit' ? [] : 'https://untrusted.example/',
      }),
    ).toString('base64url');
    const rt = parts.join('.');
    await denied(await request(`/?rt=${rt}`));
    expect(fetch).not.toHaveBeenCalled();
  });
});

import { exportJWK, exportPKCS8, generateKeyPair, SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createApp } from '../src';
import worker, { resetIsolateCachesForTest } from '../src/cloudflare';
import { isNonNavigationRequest } from '../src/core/fetch_metadata';
import { JoseOutboundSigner } from '../src/core/sign_outbound';
import type { IssuerRegistry } from '../src/core/types';

const SERVICE = 'https://jump.example.net';
const ISSUER = 'https://app.example.com';
const NOW = 1_800_000_000;

// Fetch Standard (Last Updated 6 October 2026) request modes and destinations,
// as serialized by Fetch Metadata (W3C Working Draft, 21 September 2026).
const NON_NAVIGATION_MODES = ['cors', 'no-cors', 'same-origin', 'websocket', 'webtransport'];
const NON_DOCUMENT_DESTINATIONS = [
  'empty',
  'audio',
  'audioworklet',
  'embed',
  'font',
  'frame',
  'iframe',
  'image',
  'json',
  'manifest',
  'object',
  'paintworklet',
  'report',
  'script',
  'serviceworker',
  'sharedworker',
  'style',
  'text',
  'track',
  'video',
  'webidentity',
  'worker',
  'xslt',
];

const NAVIGATION = { 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document' };

/** [label, headers] partitions that must not change a valid navigation. */
const ACCEPTED: Array<[string, Record<string, string>]> = [
  ['no metadata (non-browser client)', {}],
  ['top-level navigation', NAVIGATION],
  ['cross-site navigation', { ...NAVIGATION, 'Sec-Fetch-Site': 'cross-site' }],
  ['same-origin navigation', { ...NAVIGATION, 'Sec-Fetch-Site': 'same-origin' }],
  ['navigation without user activation', { ...NAVIGATION, 'Sec-Fetch-Site': 'none' }],
  ['user-activated navigation', { ...NAVIGATION, 'Sec-Fetch-User': '?1' }],
  ['Sec-Fetch-User ?0', { ...NAVIGATION, 'Sec-Fetch-User': '?0' }],
  ['mode only', { 'Sec-Fetch-Mode': 'navigate' }],
  ['dest only', { 'Sec-Fetch-Dest': 'document' }],
  ['unknown mode', { 'Sec-Fetch-Mode': 'teleport', 'Sec-Fetch-Dest': 'document' }],
  ['unknown destination', { 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'hologram' }],
  ['case variant mode is not a defined value', { 'Sec-Fetch-Mode': 'CORS' }],
  ['case variant destination is not a defined value', { 'Sec-Fetch-Dest': 'Iframe' }],
  ['case variant purpose is not a defined value', { 'Sec-Purpose': 'Prefetch' }],
  ['empty mode', { 'Sec-Fetch-Mode': '' }],
  ['empty destination', { 'Sec-Fetch-Dest': '' }],
  ['empty purpose', { 'Sec-Purpose': '' }],
  ['mode with parameter', { 'Sec-Fetch-Mode': 'cors;q=1' }],
  ['duplicated mode header', { 'Sec-Fetch-Mode': 'cors, cors' }],
  ['mode substring', { 'Sec-Fetch-Mode': 'xcors' }],
  ['destination substring', { 'Sec-Fetch-Dest': 'iframes' }],
  ['purpose substring', { 'Sec-Purpose': 'noprefetch' }],
  ['purpose prefix', { 'Sec-Purpose': 'prefetching' }],
  ['purpose as quoted string, not a token', { 'Sec-Purpose': '"prefetch"' }],
  ['purpose only as a parameter', { 'Sec-Purpose': 'other;prefetch' }],
  ['unknown purpose', { 'Sec-Purpose': 'preview' }],
  ['malformed purpose list', { 'Sec-Purpose': 'prefetch,' }],
  ['malformed purpose parameter', { 'Sec-Purpose': 'prefetch;' }],
  ['malformed purpose garbage', { 'Sec-Purpose': 'prefetch prerender' }],
  ['legacy Purpose header is not consulted', { Purpose: 'prefetch' }],
  ['legacy X-Purpose header is not consulted', { 'X-Purpose': 'preview' }],
  ['legacy X-Moz header is not consulted', { 'X-Moz': 'prefetch' }],
];

const REJECTED: Array<[string, Record<string, string>]> = [
  ...NON_NAVIGATION_MODES.map((mode): [string, Record<string, string>] => [
    `mode ${mode}`,
    { 'Sec-Fetch-Mode': mode },
  ]),
  ...NON_DOCUMENT_DESTINATIONS.map((dest): [string, Record<string, string>] => [
    `destination ${dest}`,
    { 'Sec-Fetch-Dest': dest },
  ]),
  [
    'fetch()',
    { 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Dest': 'empty', 'Sec-Fetch-Site': 'same-origin' },
  ],
  ['iframe navigation', { 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'iframe' }],
  [
    'non-navigation mode with document destination',
    { 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Dest': 'document' },
  ],
  [
    'known bad mode with unknown destination',
    { 'Sec-Fetch-Mode': 'no-cors', 'Sec-Fetch-Dest': 'hologram' },
  ],
  [
    'unknown mode with known bad destination',
    { 'Sec-Fetch-Mode': 'teleport', 'Sec-Fetch-Dest': 'image' },
  ],
  [
    'user-activated iframe',
    { 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'iframe', 'Sec-Fetch-User': '?1' },
  ],
  ['prefetch', { ...NAVIGATION, 'Sec-Purpose': 'prefetch' }],
  ['prerender', { ...NAVIGATION, 'Sec-Purpose': 'prefetch;prerender' }],
  ['prerender with explicit boolean', { ...NAVIGATION, 'Sec-Purpose': 'prefetch;prerender=?1' }],
  ['prerender with optional whitespace', { ...NAVIGATION, 'Sec-Purpose': 'prefetch; prerender' }],
  ['private prefetch proxy', { ...NAVIGATION, 'Sec-Purpose': 'prefetch;anonymous-client-ip' }],
  ['prefetch with string parameter', { ...NAVIGATION, 'Sec-Purpose': 'prefetch;tag="a,b;c"' }],
  ['prefetch as a later list member', { ...NAVIGATION, 'Sec-Purpose': 'other, prefetch' }],
  ['prefetch without fetch metadata', { 'Sec-Purpose': 'prefetch' }],
];

describe('Fetch Metadata classification', () => {
  test.each(ACCEPTED)('%s is not classified as non-navigation', (_label, headers) => {
    expect(isNonNavigationRequest(new Headers(headers))).toBe(false);
  });
  test.each(REJECTED)('%s is classified as non-navigation', (_label, headers) => {
    expect(isNonNavigationRequest(new Headers(headers))).toBe(true);
  });
  test('repeated Sec-Purpose header lines are read as one list', () => {
    const headers = new Headers();
    headers.append('Sec-Purpose', 'other');
    headers.append('Sec-Purpose', 'prefetch;prerender');
    expect(isNonNavigationRequest(headers)).toBe(true);
  });
});

async function harness() {
  const issuerKeys = await generateKeyPair('ES384');
  const jumpKeys = await generateKeyPair('ES384');
  const registry: IssuerRegistry = {
    [ISSUER]: {
      iss: ISSUER,
      jwks_uri: `${ISSUER}/.well-known/jwks.json`,
      allowed_dst_internal: ['https://docs.example.com'],
      allowed_dst_external: false,
    },
  };
  const fetchJwks = vi.fn(async () => ({
    keys: [{ ...(await exportJWK(issuerKeys.publicKey)), kid: 'kid-1', alg: 'ES384', use: 'sig' }],
  }));
  const sign = vi.fn((claim: Parameters<JoseOutboundSigner['sign']>[0]) =>
    new JoseOutboundSigner(jumpKeys.privateKey, 'jump-test').sign(claim),
  );
  const audit = vi.fn();
  const app = createApp({
    registry,
    fetchJwks,
    config: { serviceOrigin: SERVICE },
    signer: { sign },
    now: () => NOW,
    auditLog: audit,
  });
  const rt = await new SignJWT({
    schema: 1,
    rpl: 'reuse',
    iss: ISSUER,
    aud: SERVICE,
    sub: 'jump-redirect',
    iat: NOW,
    nbf: NOW,
    exp: NOW + 30,
    jti: 'jti-1',
    dst: 'internal',
    url: 'https://docs.example.com/path',
  })
    .setProtectedHeader({ typ: 'JWT', alg: 'ES384', kid: 'kid-1' })
    .sign(issuerKeys.privateKey);
  return { app, rt, fetchJwks, sign, audit };
}

describe('Fetch Metadata policy on /?rt=', () => {
  let output: string[] = [];
  beforeEach(() => {
    output = [];
    for (const method of ['log', 'warn', 'info', 'error'] as const)
      vi.spyOn(console, method).mockImplementation((...args) => void output.push(args.join(' ')));
  });
  afterEach(() => vi.restoreAllMocks());

  test.each(ACCEPTED)('%s: a valid token is redirected', async (_label, headers) => {
    const h = await harness();
    for (const method of ['GET', 'HEAD']) {
      const response = await h.app.request(`${SERVICE}/?rt=${h.rt}`, { method, headers });
      expect(response.status, method).toBe(302);
      expect(new URL(String(response.headers.get('Location'))).origin).toBe(
        'https://docs.example.com',
      );
    }
  });

  test.each(REJECTED)(
    '%s: rejected before any JWT, JWKS or signing work',
    async (_label, headers) => {
      const h = await harness();
      const bodies: string[] = [];
      for (const method of ['GET', 'HEAD']) {
        const response = await h.app.request(`${SERVICE}/?rt=${h.rt}`, { method, headers });
        expect(response.status, method).toBe(400);
        expect(response.headers.get('X-Jump-Error')).toBe('invalid_request');
        expect(response.headers.get('Location')).toBeNull();
        expect(response.headers.get('Set-Cookie')).toBeNull();
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
        bodies.push(await response.text());
      }
      expect(bodies[1]).toBe('');
      expect(bodies[0]).not.toContain(h.rt);
      expect(bodies[0]).not.toContain('docs.example.com');
      expect(h.fetchJwks).not.toHaveBeenCalled();
      expect(h.sign).not.toHaveBeenCalled();
    },
  );

  test('a rejection has the same public shape as any other invalid token', async () => {
    const h = await harness();
    const rejected = await h.app.request(`${SERVICE}/?rt=${h.rt}`, {
      headers: { 'Sec-Fetch-Mode': 'cors' },
    });
    const malformed = await h.app.request(`${SERVICE}/?rt=a.b.c`);
    expect(rejected.status).toBe(malformed.status);
    expect(await rejected.text()).toBe(await malformed.text());
    const names = (response: Response) => [...response.headers.keys()].sort();
    expect(names(rejected)).toEqual(names(malformed));
  });

  test('a rejection is audited with an internal reason and no request data', async () => {
    const h = await harness();
    await h.app.request(`${SERVICE}/?rt=${h.rt}`, {
      headers: { 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Dest': 'empty', 'Sec-Purpose': 'prefetch' },
    });
    expect(h.audit).toHaveBeenCalledTimes(1);
    expect(h.audit.mock.calls[0]?.[0]).toEqual({
      level: 'warn',
      event: 'jump_reject',
      result: 'rejected',
      reason: 'non_navigation_request',
      request_id: expect.any(String),
      status: 400,
    });
    const logged = output.join('\n');
    expect(logged).not.toContain(h.rt);
    expect(logged).not.toMatch(/cors|empty|prefetch|sec-fetch|sec-purpose/i);
    expect(logged).not.toContain('rt=');
  });

  test('a malformed token is still rejected for itself when metadata is acceptable', async () => {
    const h = await harness();
    const response = await h.app.request(`${SERVICE}/?rt=a.b`, { headers: NAVIGATION });
    expect(response.status).toBe(400);
    expect(h.audit.mock.calls[0]?.[0]).toMatchObject({ reason: 'malformed' });
  });

  test('method and query validation keep precedence over the metadata policy', async () => {
    const h = await harness();
    const post = await h.app.request(`${SERVICE}/?rt=${h.rt}`, {
      method: 'POST',
      headers: { 'Sec-Fetch-Mode': 'cors' },
    });
    expect(post.status).toBe(405);
    const extra = await h.app.request(`${SERVICE}/?rt=${h.rt}&x=1`, {
      headers: { 'Sec-Fetch-Mode': 'cors' },
    });
    expect(extra.status).toBe(400);
    expect(h.audit).not.toHaveBeenCalled();
  });

  test.each([
    ['/', 302],
    ['/about', 200],
    ['/health', 200],
    ['/health.json', 200],
    ['/health.html', 200],
    ['/.well-known/jwks.json', 503],
    ['/robots.txt', 200],
    ['/sitemap.xml', 200],
    ['/favicon.ico', 204],
    ['/missing', 302],
  ])('%s is outside the policy', async (path, status) => {
    const h = await harness();
    const hostile = {
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Dest': 'iframe',
      'Sec-Purpose': 'prefetch;prerender',
    };
    for (const method of ['GET', 'HEAD']) {
      const plain = await h.app.request(`${SERVICE}${path}`, { method });
      const withMetadata = await h.app.request(`${SERVICE}${path}`, { method, headers: hostile });
      expect(plain.status, method).toBe(status);
      expect(withMetadata.status, method).toBe(status);
      expect(withMetadata.headers.get('X-Jump-Error')).toBe(plain.headers.get('X-Jump-Error'));
      expect(withMetadata.headers.get('Location')).toBe(plain.headers.get('Location'));
    }
  });
});

describe('Fetch Metadata policy behind the Cloudflare adapter', () => {
  const ORIGIN = 'https://jump.umaxica.net';
  const WORKER_ISSUER = 'https://auth.umaxica.app';
  let output: string[] = [];
  beforeEach(() => {
    resetIsolateCachesForTest();
    output = [];
    for (const method of ['log', 'warn', 'info', 'error'] as const)
      vi.spyOn(console, method).mockImplementation((...args) => void output.push(args.join(' ')));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function adapter(limit: () => Promise<{ success: boolean }>) {
    const issuerKeys = await generateKeyPair('ES384');
    const jumpKeys = await generateKeyPair('ES384', { extractable: true });
    const jwksFetch = vi.fn(async () =>
      Response.json({
        keys: [
          { ...(await exportJWK(issuerKeys.publicKey)), kid: 'issuer', alg: 'ES384', use: 'sig' },
        ],
      }),
    );
    vi.stubGlobal('fetch', jwksFetch);
    const limiter = vi.fn(limit);
    const now = Math.floor(Date.now() / 1000);
    const rt = await new SignJWT({
      schema: 1,
      rpl: 'reuse',
      iss: WORKER_ISSUER,
      aud: ORIGIN,
      sub: 'jump-redirect',
      iat: now,
      nbf: now,
      exp: now + 30,
      jti: crypto.randomUUID(),
      dst: 'internal',
      url: 'https://www.umaxica.app/',
    })
      .setProtectedHeader({ typ: 'JWT', alg: 'ES384', kid: 'issuer' })
      .sign(issuerKeys.privateKey);
    const env = {
      UMAXICA_JUMP_ORIGIN: ORIGIN,
      JUMP_RATE_LIMITER: { limit: limiter },
      UMAXICA_JUMP_PRIVATE_KEY_PEM: await exportPKCS8(jumpKeys.privateKey),
      UMAXICA_JUMP_PRIVATE_KEY_KID: 'active',
      UMAXICA_JUMP_PUBLIC_JWKS: JSON.stringify({
        keys: [
          { ...(await exportJWK(jumpKeys.publicKey)), kid: 'active', alg: 'ES384', use: 'sig' },
        ],
      }),
    };
    const send = (headers: Record<string, string>, method = 'GET') =>
      worker.fetch(
        new Request(`${ORIGIN}/?rt=${rt}`, {
          method,
          headers: { 'CF-Connecting-IP': '203.0.113.7', ...headers },
        }),
        env,
        {} as ExecutionContext,
      );
    return { send, limiter, jwksFetch, rt };
  }

  test('a rejected request is still counted by the rate limiter and does no crypto', async () => {
    const h = await adapter(async () => ({ success: true }));
    for (const method of ['GET', 'HEAD']) {
      const response = await h.send(
        { 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Dest': 'empty' },
        method,
      );
      expect(response.status).toBe(400);
      expect(response.headers.get('X-Jump-Error')).toBe('invalid_request');
      expect(response.headers.get('Location')).toBeNull();
      expect(response.headers.get('Set-Cookie')).toBeNull();
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      if (method === 'HEAD') expect(await response.text()).toBe('');
    }
    expect(h.limiter).toHaveBeenCalledTimes(2);
    expect(h.jwksFetch).not.toHaveBeenCalled();
    const logged = output.join('\n');
    expect(logged).not.toContain('jump_signer_config');
    expect(logged).toContain('non_navigation_request');
    expect(logged).not.toContain(h.rt);
    expect(logged).not.toMatch(/"cors"|sec-fetch/i);
  });

  test('the rate limiter decides before the metadata policy', async () => {
    const h = await adapter(async () => ({ success: false }));
    const response = await h.send({ 'Sec-Fetch-Mode': 'cors' });
    expect(response.status).toBe(429);
    expect(response.headers.get('X-Jump-Error')).toBe('rate_limited');
    expect(output.join('\n')).not.toContain('non_navigation_request');
  });

  test('a top-level navigation is redirected', async () => {
    const h = await adapter(async () => ({ success: true }));
    const response = await h.send({
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Site': 'cross-site',
    });
    expect(response.status).toBe(302);
    expect(h.jwksFetch).toHaveBeenCalledTimes(1);
  });
});

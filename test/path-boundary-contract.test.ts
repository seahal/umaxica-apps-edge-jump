import { exportJWK, generateKeyPair, jwtVerify, SignJWT } from 'jose';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { createApp } from '../src';
import { registry } from '../src/config/registry.umaxica';
import { normalizeUrl, validateInternalTarget } from '../src/core/normalize_url';
import { assertPathAllowed, PATH_DENYLIST, validatePathRules } from '../src/core/redirect_policy';
import { JoseOutboundSigner } from '../src/core/sign_outbound';
import { assertDefined } from './assert-defined';
import graph from './fixtures/production-graph.json';

const SERVICE_ORIGIN = 'https://jump.umaxica.net';
const NOW = 1_800_000_000;
const runtime = { edge: 'cloudflare', production: true } as const;
const denied = [
  '/sign/out',
  '/sign/out/',
  '/sign/out.html',
  '/sign/out.html/',
  '/sign/out.json/',
  '/sign/out.arbitrary/',
  '/sign/out.HTML/',
  '/sign/out%2Ehtml/',
  '/sign/out%2eJSON/',
  '/sign/%6Fut.html/',
  '/sign/out./',
  '/sign/out.tar.gz/',
];
const ambiguous = [
  '/sign/out//',
  '/sign/out;anything',
  '/sign/out%3Banything',
  '/sign/out.html/..',
  '/sign/./out',
  '/sign/%2e/out',
  '/sign/x/%2E%2e/out',
  '/sign/out%2f',
  '/sign/out%2F',
  '/sign/out%5c',
  '/sign/out%5C',
  '/sign/out%252F',
  '/sign/out%252ehtml/',
  '/sign/out%00',
  '/sign/out%7F',
  '/sign/out%C2%85',
  '/sign/out%',
  '/sign/out%FF',
];
const allowed = [
  '/sign/outbox',
  '/sign/out/edit',
  '/articles/example.html',
  '/articles/example.html/',
  '/日本語',
  '/oauth/authorize?state=a%5Cb',
  '/oauth/authorize?redirect_uri=https%3A%2F%2Fclient.umaxica.com%2Fa%2F%2Fb&state=a%5Cb&nonce=n%252F',
];
const origins = PATH_DENYLIST.map((rule) => rule.origin);
let issuerPair: Awaited<ReturnType<typeof generateKeyPair>>;
let outputPair: Awaited<ReturnType<typeof generateKeyPair>>;
let jwks: { keys: Awaited<ReturnType<typeof exportJWK>>[] };
beforeAll(async () => {
  issuerPair = await generateKeyPair('ES384', { extractable: true });
  outputPair = await generateKeyPair('ES384', { extractable: true });
  jwks = {
    keys: [
      { ...(await exportJWK(issuerPair.publicKey)), alg: 'ES384', use: 'sig', kid: 'path-test' },
    ],
  };
});

function fixture(origin: string) {
  // Each destination must have a real allowed edge; origin denial cannot mask path-policy failures.
  const issuer = assertDefined(
    Object.values(registry).find((entry) => entry.allowed_dst_internal.includes(origin)),
  );
  const outbound = new JoseOutboundSigner(outputPair.privateKey, 'path-return');
  const sign = vi.fn(outbound.sign.bind(outbound));
  const auditLog = vi.fn();
  const app = createApp({
    registry,
    fetchJwks: async () => jwks,
    signer: { sign },
    auditLog,
    config: { serviceOrigin: SERVICE_ORIGIN, environment: 'production' },
    now: () => NOW,
  });
  const request = async (path: string) => {
    const token = await new SignJWT({
      schema: 1,
      rpl: 'reuse',
      iss: issuer.iss,
      aud: SERVICE_ORIGIN,
      sub: 'jump-redirect',
      iat: NOW,
      nbf: NOW,
      exp: NOW + 30,
      jti: crypto.randomUUID(),
      dst: 'internal',
      url: origin + path,
    })
      .setProtectedHeader({ alg: 'ES384', typ: 'JWT', kid: 'path-test' })
      .sign(issuerPair.privateKey);
    return { response: await app.fetch(new Request(`${SERVICE_ORIGIN}/?rt=${token}`)), token };
  };
  return { request, sign, auditLog, issuer };
}

test('path denial covers exactly the twelve registered non-Palm origins', () => {
  expect([...origins].sort()).toEqual(
    Object.values(graph.nodes)
      .filter((origin) => origin !== graph.nodes['palm-app-jp'])
      .sort(),
  );
  expect(new Set(origins).size).toBe(12);
  for (const origin of origins) expect(registry[origin]).toBeDefined();
});

describe.each(origins)('path boundary at %s', (origin) => {
  test.each(denied)('policy itself rejects equivalent route %s', (path) => {
    expect(() => assertPathAllowed(origin, path)).toThrow();
  });
  test.each(ambiguous)(
    'syntax rejects ambiguous input %s before normalization hides it',
    (path) => {
      expect(() =>
        validateInternalTarget(normalizeUrl(origin + path, runtime, SERVICE_ORIGIN)),
      ).toThrow();
    },
  );
  test.each([...denied, ...ambiguous])(
    'signed Hono request rejects %s without signing',
    async (path) => {
      const { request, sign, auditLog } = fixture(origin);
      const { response, token } = await request(path);
      expect(response.status).toBe(400);
      expect(response.headers.get('Location')).toBeNull();
      expect(sign).not.toHaveBeenCalled();
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
      expect(response.headers.get('Content-Security-Policy')).toBeTruthy();
      expect(response.headers.get('Set-Cookie')).toBeNull();
      expect(await response.text()).not.toContain(token);
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ result: 'rejected', reason: 'invalid_url' }),
      );
      expect(JSON.stringify(auditLog.mock.calls)).not.toContain(token);
      expect(JSON.stringify(auditLog.mock.calls)).not.toContain(origin + path);
    },
  );
  test.each(allowed)('signed Hono request preserves valid target %s', async (path) => {
    const { request, sign, issuer } = fixture(origin);
    const { response } = await request(path);
    expect(response.status).toBe(302);
    expect(sign).toHaveBeenCalledTimes(1);
    const location = new URL(assertDefined(response.headers.get('Location')));
    expect(location.searchParams.getAll('rt')).toHaveLength(1);
    const { payload } = await jwtVerify(
      assertDefined(location.searchParams.get('rt')),
      outputPair.publicKey,
      {
        issuer: SERVICE_ORIGIN,
        audience: origin,
        algorithms: ['ES384'],
        typ: 'JWT',
        currentDate: new Date(NOW * 1000),
      },
    );
    location.searchParams.delete('rt');
    const expected = new URL(origin + path);
    expected.search = expected.searchParams.toString();
    expect(location.href).toBe(expected.href);
    expect(payload.url).toBe(expected.href);
    expect(payload.src).toBe(issuer.iss);
    expect(assertDefined(payload.exp) - assertDefined(payload.iat)).toBe(30);
    expect(payload).toMatchObject({ schema: 1, rpl: 'reuse', dst: 'internal' });
    for (const name of ['state', 'nonce', 'redirect_uri'])
      expect(location.searchParams.get(name)).toBe(expected.searchParams.get(name));
  });
});

test('format suffix matching remains opt-in, case-sensitive at the base path and origin-specific', () => {
  const origin = 'https://www.umaxica.app';
  const rules = validatePathRules([{ origin, pathname: '/sign/out', mode: 'exact' }]);
  expect(() => assertPathAllowed(origin, '/sign/out.html/', rules)).not.toThrow();
  expect(() => assertPathAllowed(origin, '/SIGN/out.html/')).not.toThrow();
  expect(() => assertPathAllowed('https://palm-jp.umaxica.app', '/sign/out.html/')).not.toThrow();
});

import { readFileSync } from 'node:fs';
import { exportJWK, generateKeyPair } from 'jose';
import { describe, expect, test, vi } from 'vitest';
import { createApp } from '../src';
import { registry as umaxicaRegistry } from '../src/config/registry.umaxica';
import cloudflareWorker, { resetIsolateCachesForTest } from '../src/cloudflare';
import { JwksCache } from '../src/core/jwks_cache';
import { normalizeUrl } from '../src/core/normalize_url';
import { publicJumpError } from '../src/core/public_error';
import { sanitizeSecurityLog } from '../src/core/security_log';
import { STANDALONE_HTML_SECURITY_HEADERS } from '../src/core/security_headers';
import { JoseOutboundSigner } from '../src/core/sign_outbound';
import {
  JumpError,
  PRODUCTION_SERVICE_ORIGIN,
  type InboundJumpClaim,
  type IssuerRegistry,
} from '../src/core/types';

const NOW = 1_800_000_000;

function baseClaim(): InboundJumpClaim {
  return {
    schema: 1,
    iss: 'https://app.example.com',
    aud: PRODUCTION_SERVICE_ORIGIN,
    sub: 'jump-redirect',
    iat: NOW,
    nbf: NOW,
    exp: NOW + 60,
    jti: 'jti-1',
    dst: 'internal',
    url: 'https://app.example.com/path',
  };
}

describe('public error contract', () => {
  test('client denials share one public class', () => {
    const codes = [
      'malformed',
      'invalid_header',
      'invalid_signature',
      'invalid_claim',
      'expired',
      'invalid_dst',
      'invalid_url',
    ] as const;
    const first = publicJumpError(codes[0]);
    for (const code of codes) {
      expect(publicJumpError(code)).toEqual(first);
    }
    expect(first).toEqual({ code: 'invalid_request', status: 400 });
  });

  test('issuer jwks failures do not reveal that an issuer is registered', () => {
    // Reachable only for a registered `iss`, so a distinct public class would
    // let an anonymous caller enumerate the registry during an issuer outage.
    const denied = { code: 'invalid_request', status: 400 };
    expect(publicJumpError('jwks_bad_gateway')).toEqual(denied);
    expect(publicJumpError('jwks_unavailable')).toEqual(denied);
    expect(publicJumpError('malformed')).toEqual(denied);
  });

  test('infrastructure failures stay distinct from client denials', () => {
    // Jump's own missing configuration, independent of any inbound token.
    expect(publicJumpError('signer_unavailable')).toEqual({
      code: 'service_unavailable',
      status: 503,
    });
    expect(publicJumpError('rate_limited')).toEqual({ code: 'rate_limited', status: 429 });
    expect(publicJumpError('deadline_exceeded')).toEqual({
      code: 'deadline_exceeded',
      status: 504,
    });
  });

  test('different internal reasons in the same class produce identical public responses', async () => {
    const issuerKeys = await generateKeyPair('ES384');
    const jumpKeys = await generateKeyPair('ES384');
    const jwk = await exportJWK(issuerKeys.publicKey);
    const registry: IssuerRegistry = {
      'https://app.example.com': {
        iss: 'https://app.example.com',
        jwks_uri: 'https://app.example.com/.well-known/jwks.json',
        allowed_dst_internal: ['https://app.example.com'],
        allowed_dst_external: false,
      },
    };
    const app = createApp({
      registry,
      jwksCache: new JwksCache(async () => ({
        keys: [{ ...jwk, kid: 'kid-1', alg: 'ES384', use: 'sig' }],
      })),
      runtime: { edge: 'local', production: true },
      signer: new JoseOutboundSigner(jumpKeys.privateKey, 'jump-test'),
      now: () => NOW,
    });
    const unknownIssuer = await sign(issuerKeys.privateKey, {
      ...baseClaim(),
      iss: 'https://unknown.example',
    });
    const unknownDst = await sign(issuerKeys.privateKey, {
      ...baseClaim(),
      url: 'https://other.example/path',
    });
    const a = await app.request(`https://jump.example.net/?rt=${unknownIssuer}`);
    const b = await app.request(`https://jump.example.net/?rt=${unknownDst}`);
    expect(a.status).toBe(b.status);
    expect(a.headers.get('X-Jump-Error')).toBe('invalid_request');
    expect(b.headers.get('X-Jump-Error')).toBe('invalid_request');
    expect(a.headers.get('Location')).toBeNull();
    expect(b.headers.get('Location')).toBeNull();
    expect(await a.text()).toBe(await b.text());
  });
});

describe('structured security log allowlist', () => {
  test('drops tokens, secrets, and destination query', () => {
    const sanitized = sanitizeSecurityLog({
      event: 'jump_reject',
      reason: 'invalid_dst',
      request_id: 'rid',
      iss: 'https://app.example.com',
      dst_origin: 'https://app.example.com',
      rt: 'header.payload.signature',
      token: 'header.payload.signature',
      url: 'https://app.example.com/path?secret=1#frag',
      query: 'secret=1',
      authorization: 'Bearer abc',
      extra: 'nope',
    });
    expect(sanitized).toEqual({
      event: 'jump_reject',
      reason: 'invalid_dst',
      request_id: 'rid',
      iss: 'https://app.example.com',
      dst_origin: 'https://app.example.com',
    });
    expect(JSON.stringify(sanitized)).not.toContain('header.payload.signature');
    expect(JSON.stringify(sanitized)).not.toContain('secret=1');
  });
});

describe('stateless jump contract', () => {
  test('cloudflare and fastly runtimes share the same jump decision for one token', async () => {
    const issuerKeys = await generateKeyPair('ES384');
    const jumpKeys = await generateKeyPair('ES384');
    const jwk = await exportJWK(issuerKeys.publicKey);
    const shared = {
      registry: {
        'https://app.example.com': {
          iss: 'https://app.example.com',
          jwks_uri: 'https://app.example.com/.well-known/jwks.json',
          allowed_dst_internal: ['https://app.example.com'],
          allowed_dst_external: false as const,
        },
      },
      jwksCache: new JwksCache(async () => ({
        keys: [{ ...jwk, kid: 'kid-1', alg: 'ES384', use: 'sig' }],
      })),
      signer: new JoseOutboundSigner(jumpKeys.privateKey, 'jump-test'),
      now: () => NOW,
    };
    const token = await sign(issuerKeys.privateKey, baseClaim());
    const results = [];
    for (const edge of ['cloudflare', 'fastly'] as const) {
      const app = createApp({ ...shared, runtime: { edge, production: true } });
      const res = await app.request(`https://jump.example.net/?rt=${token}`);
      results.push({
        edge,
        status: res.status,
        error: res.headers.get('X-Jump-Error'),
        locationOrigin: new URL(String(res.headers.get('Location'))).origin,
      });
    }
    expect(results[0]?.status).toBe(302);
    expect(results[1]).toEqual({ ...results[0], edge: 'fastly' });
  });

  test('repeated evaluation of a valid token stays accepted', async () => {
    const issuerKeys = await generateKeyPair('ES384');
    const jumpKeys = await generateKeyPair('ES384');
    const jwk = await exportJWK(issuerKeys.publicKey);
    const app = createApp({
      registry: {
        'https://app.example.com': {
          iss: 'https://app.example.com',
          jwks_uri: 'https://app.example.com/.well-known/jwks.json',
          allowed_dst_internal: ['https://app.example.com'],
          allowed_dst_external: false,
        },
      },
      jwksCache: new JwksCache(async () => ({
        keys: [{ ...jwk, kid: 'kid-1', alg: 'ES384', use: 'sig' }],
      })),
      runtime: { edge: 'cloudflare', production: true },
      signer: new JoseOutboundSigner(jumpKeys.privateKey, 'jump-test'),
      now: () => NOW,
    });
    const token = await sign(issuerKeys.privateKey, baseClaim());
    const first = await app.request(`https://jump.example.net/?rt=${token}`);
    const second = await app.request(`https://jump.example.net/?rt=${token}`);
    expect(first.status).toBe(302);
    expect(second.status).toBe(302);
  });

  test('cloudflare worker has no durable-object replay binding', async () => {
    resetIsolateCachesForTest();
    const res = await cloudflareWorker.fetch(
      new Request('https://jump.example.net/?rt=a.b.c'),
      {} as never,
      {} as ExecutionContext,
    );
    expect(res.status).toBe(400);
    expect(res.headers.get('X-Jump-Error')).toBe('invalid_request');
  });

  test('wrangler config does not bind durable objects', () => {
    const config = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
    expect(config).not.toMatch(/durable_objects|JumpReplayObject|JUMP_REPLAY/);
  });
});

describe('fail-closed configuration', () => {
  test('a production runtime refuses the example registry and keyset', () => {
    expect(() => createApp({ runtime: { edge: 'cloudflare', production: true } })).toThrow(
      /explicit registry/,
    );
    expect(() =>
      createApp({ registry: umaxicaRegistry, runtime: { edge: 'cloudflare', production: true } }),
    ).toThrow(/explicit registry/);
    expect(() =>
      createApp({
        registry: umaxicaRegistry,
        fetchJwks: async () => ({ keys: [] }),
        runtime: { edge: 'cloudflare', production: true },
      }),
    ).not.toThrow();
  });

  test('a non-production runtime still boots from the examples', () => {
    expect(() => createApp({ runtime: { edge: 'local', production: false } })).not.toThrow();
  });
});

describe('static asset headers mirror the worker contract', () => {
  test('public/_headers carries every STANDALONE_HTML_SECURITY_HEADERS entry', () => {
    const file = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
    const declared = new Map(
      file
        .split('\n')
        .filter((line) => /^\s{2}\S+:/.test(line))
        .map((line) => {
          const index = line.indexOf(':');
          return [line.slice(0, index).trim(), line.slice(index + 1).trim()] as const;
        }),
    );
    expect(Object.fromEntries(declared)).toEqual(STANDALONE_HTML_SECURITY_HEADERS);
  });
});

describe('rate limiter remains fail-open', () => {
  test('limiter failure does not close the jump route', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const res = await cloudflareWorker.fetch(
        new Request('https://jump.example.net/?rt=a.b.c', {
          headers: { 'CF-Connecting-IP': '203.0.113.9' },
        }),
        {
          JUMP_RATE_LIMITER: { limit: async () => Promise.reject(new TypeError('secret')) },
        },
        {} as ExecutionContext,
      );
      expect(res.status).toBe(400);
      expect(res.headers.get('X-Jump-Error')).toBe('invalid_request');
      const lines = warn.mock.calls.map(([message]) => String(message)).join('\n');
      expect(lines).toContain('limiter_unavailable');
      expect(lines).not.toContain('secret');
    } finally {
      warn.mockRestore();
    }
  });
});

describe('special-use destinations', () => {
  const runtime = { edge: 'local' as const, production: true };

  test('IPv4 CGNAT, IETF protocol, benchmarking, multicast, and broadcast reject', () => {
    for (const url of [
      'https://100.64.0.1/path',
      'https://192.0.0.1/path',
      'https://198.18.0.1/path',
      'https://224.0.0.1/path',
      'https://255.255.255.255/path',
    ]) {
      expect(() => normalizeUrl(url, runtime)).toThrow(JumpError);
    }
  });

  test('IPv6 multicast, NAT64, and mapped CGNAT reject', () => {
    for (const url of [
      'https://[ff00::1]/path',
      'https://[64:ff9b::10.0.0.1]/path',
      'https://[::ffff:100.64.0.1]/path',
    ]) {
      expect(() => normalizeUrl(url, runtime)).toThrow(JumpError);
    }
  });

  test('credentials, unexpected scheme, and non-origin paths still reject', () => {
    expect(() => normalizeUrl('https://user:pass@app.example.com/path', runtime)).toThrow(
      JumpError,
    );
    expect(() => normalizeUrl('javascript:alert(1)', runtime)).toThrow(JumpError);
    expect(() => normalizeUrl('not a url', runtime)).toThrow(JumpError);
  });
});

describe('canonical origin is not request Host', () => {
  test('hostile Host does not change robots or sitemap', async () => {
    const app = createApp({
      registry: umaxicaRegistry,
      fetchJwks: async () => ({ keys: [] }),
      runtime: { edge: 'local', production: true },
      config: { serviceOrigin: PRODUCTION_SERVICE_ORIGIN },
    });
    const robots = await app.request('https://evil.example/robots.txt', {
      headers: { Host: 'evil.example' },
    });
    const sitemap = await app.request('https://evil.example/sitemap.xml', {
      headers: { Host: 'evil.example' },
    });
    const robotsBody = await robots.text();
    const sitemapBody = await sitemap.text();
    expect(robotsBody).toContain(`${PRODUCTION_SERVICE_ORIGIN}/sitemap.xml`);
    expect(robotsBody).not.toContain('evil.example');
    expect(sitemapBody).toContain(`${PRODUCTION_SERVICE_ORIGIN}/about`);
    expect(sitemapBody).not.toContain('evil.example');
  });
});

async function sign(privateKey: CryptoKey, claim: InboundJumpClaim) {
  const { SignJWT } = await import('jose');
  return new SignJWT({ ...claim })
    .setProtectedHeader({ typ: 'JWT', alg: 'ES384', kid: 'kid-1' })
    .sign(privateKey);
}

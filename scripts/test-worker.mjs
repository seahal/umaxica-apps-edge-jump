// Local workerd contract test; generates nonproduction keys only, no remote fetch.
// dispatchFetch avoids an application server, but this Miniflare version still
// requires internal TCP listeners. Do not replace workerd with a Node-only fake.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { exportJWK, exportPKCS8, generateKeyPair, jwtVerify, SignJWT } from 'jose';
const runtimeConfig = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
assert.match(runtimeConfig, /"redact_query_string"\s*:\s*true/, 'query redaction configured');
const { nodes, edges } = JSON.parse(
  await readFile(new URL('../test/fixtures/production-graph.json', import.meta.url), 'utf8'),
);
const pairs = new Map();
const publicSets = new Map();
for (const origin of Object.values(nodes)) {
  const pair = await generateKeyPair('ES384', { extractable: true });
  pairs.set(origin, pair);
  publicSets.set(`${origin}/.well-known/jwks.json`, {
    keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'issuer', alg: 'ES384', use: 'sig' }],
  });
}
const origin = 'https://jump-next.example';
const jumpPair = await generateKeyPair('ES384', { extractable: true });
const bundle = await build({
  // Fault injection is bundled only by this harness, never by Wrangler.
  // The adapter, crypto, timers and response handling still execute in workerd.
  stdin: {
    resolveDir: process.cwd(),
    sourcefile: 'worker-runtime-test.ts',
    contents: `import worker from './src/cloudflare';
      export default { fetch(request, env, ctx) {
        const settings = env;
        // Node's fetch (undici) always sends Sec-Fetch-Mode: cors and cannot send
        // "navigate". Drop that artifact and take the browser headers under test
        // from X-Test-Sec-* instead.
        { const headers = new Headers(request.headers);
          headers.delete('Sec-Fetch-Mode');
          for (const [name, value] of request.headers) if (name.startsWith('x-test-sec-')) { headers.delete(name); headers.set(name.slice(7), value); }
          request = new Request(request, { headers }); }
        if (env.TEST_MISSING_IP) { request = new Request(request); request.headers.delete('CF-Connecting-IP'); }
        if (env.TEST_LIMIT_MODE === 'deny') settings.JUMP_RATE_LIMITER = { limit: async () => ({ success: false }) };
        if (env.TEST_LIMIT_MODE === 'throw') settings.JUMP_RATE_LIMITER = { limit: async () => { throw new Error('test-provider-exception'); } };
        if (env.TEST_LIMIT_MODE === 'missing') delete settings.JUMP_RATE_LIMITER;
        if (env.TEST_LATE_ASSETS) settings.ASSETS = { fetch: async () => { await new Promise(r => setTimeout(r, 1200)); return new Response(null, { status: 302, headers: { Location: 'https://late.example', 'Set-Cookie': 'late=1' } }); } };
        return worker.fetch(request, settings, ctx);
      } };`,
  },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  write: false,
  jsx: 'automatic',
  jsxImportSource: 'hono/jsx',
});
const logs = [];
const jwksFetches = [];
let slowJwksUrl;
const options = {
  cf: false,
  handleStructuredLogs: (entry) => logs.push(entry.message),
  modules: true,
  script: bundle.outputFiles[0].text,
  compatibilityDate: '2026-05-26',
  compatibilityFlags: ['nodejs_compat'],
  bindings: {
    UMAXICA_JUMP_ORIGIN: origin,
    UMAXICA_JUMP_PRIVATE_KEY_KID: 'nonproduction-active',
    UMAXICA_JUMP_PRIVATE_KEY_PEM: await exportPKCS8(jumpPair.privateKey),
    UMAXICA_JUMP_PUBLIC_JWKS: JSON.stringify({
      keys: [
        {
          ...(await exportJWK(jumpPair.publicKey)),
          kid: 'nonproduction-active',
          alg: 'ES384',
          use: 'sig',
        },
      ],
    }),
  },
  ratelimits: {
    JUMP_RATE_LIMITER: { namespace_id: '520900', simple: { limit: 600, period: 60 } },
  },
  outboundService: async (request) => {
    assert(publicSets.has(request.url), 'only pinned issuer JWKS can be fetched');
    jwksFetches.push(request.url);
    if (request.url === slowJwksUrl) await new Promise((resolve) => setTimeout(resolve, 1500));
    return Response.json(publicSets.get(request.url));
  },
};
const signInput = (src, dst) => {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    schema: 1,
    rpl: 'reuse',
    iss: nodes[src],
    aud: origin,
    sub: 'jump-redirect',
    iat: now,
    nbf: now,
    exp: now + 30,
    jti: crypto.randomUUID(),
    dst: 'internal',
    url: `${nodes[dst]}/receive?state=keep&q=a%20b`,
  })
    .setProtectedHeader({ typ: 'JWT', alg: 'ES384', kid: 'issuer' })
    .sign(pairs.get(nodes[src]).privateKey);
};
let runtime;
let sampleInput;
try {
  runtime = new Miniflare(convertV4MiniflareOptions(options));
  for (const [src, dst] of edges) {
    const now = Math.floor(Date.now() / 1000);
    const input = await new SignJWT({
      schema: 1,
      rpl: 'reuse',
      iss: nodes[src],
      aud: origin,
      sub: 'jump-redirect',
      iat: now,
      nbf: now,
      exp: now + 30,
      jti: crypto.randomUUID(),
      dst: 'internal',
      url: `${nodes[dst]}/receive?state=keep&q=a%20b`,
    })
      .setProtectedHeader({ typ: 'JWT', alg: 'ES384', kid: 'issuer' })
      .sign(pairs.get(nodes[src]).privateKey);
    sampleInput ??= input;
    const response = await runtime.dispatchFetch(`${origin}/?rt=${input}`, {
      redirect: 'manual',
      headers: { 'CF-Connecting-IP': '203.0.113.7' },
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('set-cookie'), null);
    const location = new URL(response.headers.get('location'));
    assert.equal(location.origin, nodes[dst]);
    assert.equal(location.searchParams.getAll('rt').length, 1);
    const verified = await jwtVerify(location.searchParams.get('rt'), jumpPair.publicKey, {
      issuer: origin,
      audience: nodes[dst],
      algorithms: ['ES384'],
    });
    location.searchParams.delete('rt');
    assert.equal(verified.payload.url, location.href);
    assert.equal(verified.payload.rpl, 'reuse');
    assert.equal(verified.payload.src, nodes[src]);
    assert.equal(verified.payload.exp - verified.payload.iat, 30);
  }
  for (const method of ['GET', 'HEAD']) {
    const response = await runtime.dispatchFetch(`${origin}/favicon.ico?rt%5Bx%5D=private`, {
      method,
      redirect: 'manual',
      headers: { 'CF-Connecting-IP': '203.0.113.7' },
    });
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('location'), null);
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    if (method === 'HEAD') assert.equal(await response.text(), '');
  }
  await runtime.dispose();
  runtime = undefined;

  // Fresh runtime instance: issuer JWKS reuse, Fetch Metadata and the deadline.
  runtime = new Miniflare(convertV4MiniflareOptions(options));
  logs.length = 0;
  jwksFetches.length = 0;
  const [src, dst] = edges[0];
  const issuerJwksUrl = `${nodes[src]}/.well-known/jwks.json`;
  const navigation = {
    'CF-Connecting-IP': '203.0.113.7',
    'X-Test-Sec-Fetch-Mode': 'navigate',
    'X-Test-Sec-Fetch-Dest': 'document',
    'X-Test-Sec-Fetch-Site': 'cross-site',
  };
  const tokens = [await signInput(src, dst)];
  for (const [label, metadata] of [
    ['fetch()', { 'X-Test-Sec-Fetch-Mode': 'cors', 'X-Test-Sec-Fetch-Dest': 'empty' }],
    ['iframe', { 'X-Test-Sec-Fetch-Mode': 'navigate', 'X-Test-Sec-Fetch-Dest': 'iframe' }],
    ['prefetch', { ...navigation, 'X-Test-Sec-Purpose': 'prefetch' }],
    ['prerender', { ...navigation, 'X-Test-Sec-Purpose': 'prefetch;prerender' }],
  ]) {
    for (const method of ['GET', 'HEAD']) {
      const response = await runtime.dispatchFetch(`${origin}/?rt=${tokens[0]}`, {
        method,
        redirect: 'manual',
        headers: { 'CF-Connecting-IP': '203.0.113.7', ...metadata },
      });
      assert.equal(response.status, 400, label);
      assert.equal(response.headers.get('x-jump-error'), 'invalid_request', label);
      assert.equal(response.headers.get('location'), null, label);
      assert.equal(response.headers.get('set-cookie'), null, label);
      assert.equal(response.headers.get('cache-control'), 'no-store', label);
      const text = await response.text();
      if (method === 'HEAD') assert.equal(text, '', label);
      else assert(!text.includes(tokens[0]), label);
    }
  }
  assert.equal(jwksFetches.length, 0, 'metadata rejection precedes any JWKS fetch');
  assert(!logs.some((message) => message.includes('jump_signer_config')), 'no signing work');
  assert(
    logs.some((message) => message.includes('non_navigation_request')),
    'metadata rejection is logged with its internal reason',
  );

  const latencies = [];
  for (const method of ['GET', 'GET', 'HEAD']) {
    const input = await signInput(src, dst);
    tokens.push(input);
    const started = performance.now();
    const response = await runtime.dispatchFetch(`${origin}/?rt=${input}`, {
      method,
      redirect: 'manual',
      headers: navigation,
    });
    latencies.push(Math.round(performance.now() - started));
    assert.equal(response.status, 302, method);
    assert.equal(await response.text(), '', method);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert(response.headers.get('content-security-policy'), 'CSP present');
    const location = new URL(response.headers.get('location'));
    assert.equal(location.origin, nodes[dst]);
    const verified = await jwtVerify(location.searchParams.get('rt'), jumpPair.publicKey, {
      issuer: origin,
      audience: nodes[dst],
      algorithms: ['ES384'],
    });
    assert.equal(verified.payload.src, nodes[src]);
    tokens.push(location.searchParams.get('rt'));
  }
  assert.deepEqual(
    jwksFetches,
    [issuerJwksUrl],
    'successive requests in one runtime instance reuse the issuer JWKS',
  );
  // Informational: whether workerd handed over a stable `env` reference.
  const signerImports = logs.filter((message) => message.includes('signer_configured')).length;
  for (const token of tokens)
    assert(!logs.some((message) => message.includes(token)), 'no token in logs');
  assert(!logs.some((message) => message.includes('rt=')), 'no query in logs');
  assert(!logs.some((message) => /sec-fetch|"cors"|prerender/i.test(message)), 'no raw metadata');

  // Whole-entry deadline: an issuer JWKS slower than 1000ms.
  const [slowSrc, slowDst] = edges.find(([source]) => source !== src);
  slowJwksUrl = `${nodes[slowSrc]}/.well-known/jwks.json`;
  logs.length = 0;
  for (const method of ['GET', 'HEAD']) {
    const started = performance.now();
    const response = await runtime.dispatchFetch(
      `${origin}/?rt=${await signInput(slowSrc, slowDst)}`,
      { method, redirect: 'manual', headers: navigation },
    );
    const elapsed = performance.now() - started;
    assert.equal(response.status, 504, `${method} slow JWKS`);
    assert.equal(response.headers.get('x-jump-error'), 'deadline_exceeded');
    assert.equal(response.headers.get('location'), null);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert(elapsed < 1400, 'deadline answers without waiting for the late JWKS');
    await response.text();
  }
  await new Promise((resolve) => setTimeout(resolve, 1800));
  assert(!logs.some((message) => message.includes('jump_accept')), 'no late acceptance log');
  slowJwksUrl = undefined;
  await runtime.dispose();
  runtime = undefined;
  // eslint-disable-next-line no-console -- measurements only, no request data.
  console.log(
    `workerd: issuer JWKS fetches=1 for 3 signed requests; signer imports=${signerImports}; latency_ms=${latencies.join('/')}`,
  );
  const other = await generateKeyPair('ES384', { extractable: true });
  /** @type {Array<[string, Record<string, string | boolean>, string, number, string?, boolean?]>} */
  const cases = [
    ['health', {}, '/health.json', 200],
    ['health negotiated', {}, '/health', 200],
    ['invalid rt', {}, '/?rt=malformed', 400],
    ['jwks valid', {}, '/.well-known/jwks.json', 200],
    ['private missing', { UMAXICA_JUMP_PRIVATE_KEY_PEM: '' }, '/.well-known/jwks.json', 503],
    ['public missing', { UMAXICA_JUMP_PUBLIC_JWKS: '' }, '/.well-known/jwks.json', 503],
    ['kid absent', { UMAXICA_JUMP_PRIVATE_KEY_KID: 'absent' }, '/.well-known/jwks.json', 503],
    [
      'pair mismatch',
      { UMAXICA_JUMP_PRIVATE_KEY_PEM: await exportPKCS8(other.privateKey) },
      '/.well-known/jwks.json',
      503,
    ],
    ['health with private missing', { UMAXICA_JUMP_PRIVATE_KEY_PEM: '' }, '/health.json', 200],
    ['origin invalid', { UMAXICA_JUMP_ORIGIN: '' }, '/about', 503],
    ['limiter missing navigation', { TEST_LIMIT_MODE: 'missing' }, '/about', 503],
    ['limiter deny', { TEST_LIMIT_MODE: 'deny' }, '/about', 429],
    ['limiter throw jwks', { TEST_LIMIT_MODE: 'throw' }, '/.well-known/jwks.json', 200],
    ['limiter throw navigation', { TEST_LIMIT_MODE: 'throw' }, '/?rt=malformed', 400],
    ['late asset', { TEST_LATE_ASSETS: true }, '/favicon.ico', 504],
    ['wrong origin', {}, '/about', 400, 'https://wrong.example'],
    ['wrong origin jwks', {}, '/.well-known/jwks.json', 400, 'https://wrong.example'],
    ['missing IP', { TEST_MISSING_IP: true }, '/about', 503, origin, true],
  ];
  for (const [label, overrides, path, status, requestOrigin = origin, missingIp = false] of cases) {
    logs.length = 0;
    runtime = new Miniflare(
      convertV4MiniflareOptions({ ...options, bindings: { ...options.bindings, ...overrides } }),
    );
    for (const method of ['GET', 'HEAD']) {
      const response = await runtime.dispatchFetch(`${requestOrigin}${path}`, {
        method,
        redirect: 'manual',
        headers: {
          Accept: 'application/json',
          ...(missingIp ? {} : { 'CF-Connecting-IP': '203.0.113.7' }),
        },
      });
      assert.equal(response.status, status, label);
      assert.equal(response.headers.get('set-cookie'), null, label);
      assert.equal(response.headers.get('cache-control'), 'no-store', label);
      assert.equal(response.headers.get('location'), null, label);
      assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive', label);
      const text = await response.text();
      if (method === 'HEAD') assert.equal(text, '', label);
      else if (status === 200 && path === '/.well-known/jwks.json') {
        const published = JSON.parse(text);
        assert.deepEqual(
          published.keys.map((key) => key.kid),
          ['nonproduction-active'],
          label,
        );
        assert(
          published.keys.every((key) => !('d' in key)),
          `${label}: no private material`,
        );
      } else if (status === 200) {
        assert.equal(JSON.parse(text).status, 'OK', label);
      } else {
        assert(!text.includes('test-provider-exception'), label);
        assert.equal(
          response.headers.get('x-jump-error'),
          status === 429
            ? 'rate_limited'
            : status === 504
              ? 'deadline_exceeded'
              : status === 503
                ? 'service_unavailable'
                : 'invalid_request',
          label,
        );
      }
    }
    if (label === 'limiter throw navigation') {
      const accepted = await runtime.dispatchFetch(`${origin}/?rt=${sampleInput}`, {
        redirect: 'manual',
        headers: { 'CF-Connecting-IP': '203.0.113.7' },
      });
      assert.equal(
        accepted.status,
        302,
        'provider failure still permits a valid fully checked token',
      );
      assert.equal(accepted.headers.get('set-cookie'), null);
      assert.equal(accepted.headers.get('cache-control'), 'no-store');
      const output = new URL(accepted.headers.get('location')).searchParams.get('rt');
      const verified = await jwtVerify(output, jumpPair.publicKey, {
        issuer: origin,
        audience: nodes[edges[0][1]],
      });
      assert.equal(verified.payload.rpl, 'reuse');
      assert(
        logs.some((message) => message.includes('limiter_call_exception')),
        'provider exception must emit warning',
      );
      assert(
        !logs.some((message) => message.includes('test-provider-exception')),
        'no raw exception log',
      );
    }
    await runtime.dispose();
    runtime = undefined;
  }
  // `/ready` is not a production interface: it must fall through to notFound.
  runtime = new Miniflare(convertV4MiniflareOptions(options));
  for (const method of ['GET', 'HEAD']) {
    const response = await runtime.dispatchFetch(`${origin}/ready`, {
      method,
      redirect: 'manual',
      headers: { 'CF-Connecting-IP': '203.0.113.7' },
    });
    assert.equal(response.status, 302, `${method} /ready`);
    assert.equal(new URL(response.headers.get('location'), origin).pathname, '/about');
    assert.notEqual(response.headers.get('content-type'), 'application/json');
    await response.text();
  }
  await runtime.dispose();
  runtime = undefined;
  // eslint-disable-next-line no-console -- concise runtime verification result.
  console.log(
    'workerd: 20 signed edges, JWKS reuse, Fetch Metadata, wrong-path rt, signing material, limiter and deadline contracts passed',
  );
} catch (error) {
  // eslint-disable-next-line no-console -- error code only, never raw exception text.
  console.error(`workerd contract failed: ${error?.code ?? 'runtime_error'}`);
  // eslint-disable-next-line no-console -- assertion label only; labels carry no request data.
  if (error?.code === 'ERR_ASSERTION') console.error(String(error.message).split('\n')[0]);
  process.exitCode = 1;
} finally {
  await runtime?.dispose();
}

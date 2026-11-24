import { expect, test, vi } from 'vite-plus/test';
import { clientRateLimitKey, type RateLimiter } from '../src/core/rate_limit';
import { createApp } from './app-fixture';

function request(app: ReturnType<typeof createApp>, path = '/about', ip = '203.0.113.9') {
  return app.request(`https://jump.example.net${path}`, {
    headers: { 'CF-Connecting-IP': ip },
  });
}

test.each([
  ['203.0.113.9', '203.0.113.9'],
  ['2001:db8:1:2::1', '2001:db8:1:2::/64'],
  ['2001:db8::1', '2001:db8:0:0::/64'],
  ['2001:0db8:0001:0002:ffff:0000:0000:0009', '2001:db8:1:2::/64'],
  ['2001:db8:1:2:3:4:5:6', '2001:db8:1:2::/64'],
  ['::', '0:0:0:0::/64'],
  ['::ffff:192.0.2.128', '0:0:0:0::/64'],
])('normalizes client address %s to %s', (input, expected) => {
  expect(clientRateLimitKey(input)).toBe(expected);
});

test.each([
  null,
  undefined,
  '',
  'not-an-ip',
  '1.2.3.x',
  '256.0.0.1',
  '01.2.3.4',
  '203.0.113.9/24',
  '2001:db8:::1',
  'fe80::1%eth0',
])('rejects invalid client address %s', (input) => {
  expect(clientRateLimitKey(input)).toBeNull();
});

test('the middleware meters every Hono route and leaves omitted limiter options compatible', async () => {
  const limit = vi.fn(async () => ({ success: true }));
  const app = createApp({ rateLimiter: { limit } });
  for (const path of [
    '/?rt=a.b.c',
    '/about',
    '/health',
    '/health.json',
    '/health.html',
    '/robots.txt',
    '/sitemap.xml',
    '/.well-known/jwks.json',
    '/favicon.ico',
    '/unknown-route',
  ]) {
    await request(app, path);
  }
  expect(limit).toHaveBeenCalledTimes(10);

  const unmetered = createApp();
  await unmetered.request('https://jump.example.net/about');
});

test('method and malformed entry-query checks run before rate limiting', async () => {
  const limit = vi.fn(async () => ({ success: true }));
  const app = createApp({ rateLimiter: { limit } });
  const headers = { 'CF-Connecting-IP': '203.0.113.9' };
  const method = await app.request('https://jump.example.net/about', { method: 'POST', headers });
  const query = await app.request('https://jump.example.net/?state=x', { headers });

  expect(method.status).toBe(405);
  expect(query.status).toBe(400);
  expect(limit).not.toHaveBeenCalled();
});

test('the injected binding receives the canonical IPv6 /64 key', async () => {
  const keys: string[] = [];
  const app = createApp({
    rateLimiter: {
      limit: async ({ key }) => {
        keys.push(key);
        return { success: true };
      },
    },
  });
  await request(app, '/about', '2001:0db8:0001:0002::1');
  await request(app, '/health', '2001:db8:1:2:ffff::9');
  expect(keys).toEqual(['2001:db8:1:2::/64', '2001:db8:1:2::/64']);
});

test('a request-scoped binding is resolved from the Hono environment', async () => {
  const limit = vi.fn(async () => ({ success: true }));
  const app = createApp({ rateLimiter: () => ({ limit }) });
  await request(app);
  expect(limit).toHaveBeenCalledWith({ key: '203.0.113.9' });
});

test('binding resolution failure fails closed with an audited 503', async () => {
  const auditLog = vi.fn();
  const app = createApp({
    rateLimiter: () => {
      throw new Error('binding detail');
    },
    auditLog,
  });
  const response = await request(app);
  expect(response.status).toBe(503);
  expect(auditLog).toHaveBeenCalledWith(
    expect.objectContaining({
      event: 'jump_reject',
      result: 'rejected',
      reason: 'limiter_binding_unavailable',
      request_id: response.headers.get('X-Request-ID'),
      status: 503,
    }),
  );
});

test.each([
  ['missing binding', null],
  ['non-callable binding', {} as RateLimiter],
])('%s fails closed', async (_label, rateLimiter) => {
  const auditLog = vi.fn();
  const response = await request(createApp({ rateLimiter, auditLog }));
  expect(response.status).toBe(503);
  expect(auditLog).toHaveBeenCalledWith(
    expect.objectContaining({ event: 'jump_reject', result: 'rejected', status: 503 }),
  );
});

test.each([null, 'invalid', {}, { success: 'invalid' }])(
  'an invalid limiter response fails closed: %s',
  async (result) => {
    const auditLog = vi.fn();
    const rateLimiter = { limit: async () => result } as unknown as RateLimiter;
    const response = await request(createApp({ rateLimiter, auditLog }));
    expect(response.status).toBe(503);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'jump_reject',
        result: 'rejected',
        reason: 'limiter_response_invalid',
        status: 503,
      }),
    );
  },
);

test('an invalid client IP fails closed before calling the binding', async () => {
  const limit = vi.fn(async () => ({ success: true }));
  const auditLog = vi.fn();
  const response = await request(
    createApp({ rateLimiter: { limit }, auditLog }),
    '/about',
    'invalid ip',
  );
  expect(response.status).toBe(503);
  expect(limit).not.toHaveBeenCalled();
  expect(auditLog).toHaveBeenCalledWith(
    expect.objectContaining({ reason: 'invalid_client_ip', status: 503 }),
  );
});

test('limit exceeded returns localized HTML, Retry-After and an audit record', async () => {
  const auditLog = vi.fn();
  const app = createApp({ rateLimiter: { limit: async () => ({ success: false }) }, auditLog });
  const response = await app.request('https://jump.example.net/about', {
    headers: {
      'CF-Connecting-IP': '203.0.113.9',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  expect(response.status).toBe(429);
  expect(response.headers.get('Retry-After')).toBe('60');
  expect(response.headers.get('Content-Language')).toBe('en');
  expect(response.headers.get('Content-Type')).toContain('text/html');
  expect(await response.text()).toContain('lang="en"');
  expect(auditLog).toHaveBeenCalledWith(
    expect.objectContaining({
      event: 'jump_reject',
      result: 'rejected',
      reason: 'rate_limited',
      request_id: response.headers.get('X-Request-ID'),
      status: 429,
    }),
  );
});

test('binding call exceptions fail open and emit the ADR 0009 event', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const app = createApp({
      rateLimiter: { limit: async () => Promise.reject(new Error('private provider detail')) },
    });
    const response = await request(app);
    expect(response.status).toBe(200);
    const lines = warn.mock.calls.map(([line]) => String(line)).join('\n');
    expect(lines).toContain('jump_rate_limit_skipped');
    expect(lines).toContain('limiter_call_exception');
    expect(lines).not.toContain('private provider detail');
  } finally {
    warn.mockRestore();
  }
});

test('deadline aborts a hanging limiter call instead of failing open', async () => {
  const app = createApp({
    deadlineMs: 0,
    rateLimiter: {
      limit: () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 20)),
    },
  });
  const response = await request(app);
  expect(response.status).toBe(504);
  expect(response.headers.get('X-Jump-Error')).toBe('deadline_exceeded');
});

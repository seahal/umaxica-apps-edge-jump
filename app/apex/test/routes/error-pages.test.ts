import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Hono } from 'hono';
import app from '../../src/index';

const notFoundHtml = readFileSync(resolve(__dirname, '../../public/404.html'), 'utf-8');
const badRequestHtml = readFileSync(resolve(__dirname, '../../public/400.html'), 'utf-8');

/**
 * Simulates Cloudflare Workers asset binding with not_found_handling: "404-page".
 * When no asset matches, the asset layer returns /404.html with 404 status.
 */
function createMockAssets() {
  return {
    fetch: async (request: Request) => {
      const url = new URL(request.url);
      if (url.pathname === '/400.html') {
        return new Response(badRequestHtml, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }
      return new Response(notFoundHtml, {
        status: 404,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    },
  };
}

const env = { ASSETS: createMockAssets() };

describe('404 error page', () => {
  it('returns 404 with custom page content', async () => {
    const res = await app.request('/nonexistent-path', {}, env);

    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).toContain("The page you were looking for doesn't exist");
  });

  it('includes CSP header', async () => {
    const res = await app.request('/nonexistent-path', {}, env);

    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
  });
});

describe('400 error page', () => {
  type AssetEnv = {
    ASSETS: { fetch: (request: Request) => Promise<Response> };
  };

  const errorApp = new Hono<{ Bindings: AssetEnv }>();

  errorApp.use('*', async (c, next) => {
    await next();
    c.header('Content-Security-Policy', "default-src 'self'");
  });

  errorApp.get('/error', () => {
    throw new Error('test error');
  });

  errorApp.onError(async (_err, c) => {
    const url = new URL('/400.html', c.req.url);
    const res = await c.env.ASSETS.fetch(new Request(url.toString()));
    return new Response(res.body, { status: 400, headers: res.headers });
  });

  it('returns 400 with custom page content', async () => {
    const res = await errorApp.request('/error', {}, env);

    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toContain('400 Bad Request');
  });

  it('includes CSP header', async () => {
    const res = await errorApp.request('/error', {}, env);

    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
  });
});

import type { Context } from 'hono';
import type { AssetEnv } from './security-headers';

type ApexContext = Context<{ Bindings: AssetEnv }>;
type FallbackStatus = 400 | 404;

async function fetchHtmlFallback(
  c: ApexContext,
  path: string,
  status: FallbackStatus,
  fallbackText: string,
) {
  if (!c.env?.ASSETS) {
    // eslint-disable-next-line no-console
    console.error(`ASSETS binding is missing for ${status} fallback`, { url: c.req.url });
    return c.text(fallbackText, status);
  }

  const url = new URL(path, c.req.url);
  const res = await c.env.ASSETS.fetch(new Request(url.toString()));
  return new Response(res.body, {
    status,
    headers: res.headers,
  });
}

export function createBadRequestFallback(c: ApexContext) {
  return fetchHtmlFallback(c, '/400.html', 400, 'Bad Request');
}

export async function createNotFoundFallback(c: ApexContext) {
  if (!c.env?.ASSETS) {
    // eslint-disable-next-line no-console
    console.error('ASSETS binding is missing for 404 fallback', { url: c.req.url });
    return c.text('Not Found', 404);
  }

  const assetRes = await c.env.ASSETS.fetch(c.req.raw);
  if (assetRes.status !== 404) {
    return assetRes;
  }

  return fetchHtmlFallback(c, '/404.html', 404, 'Not Found');
}

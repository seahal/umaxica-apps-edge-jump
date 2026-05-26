import { Hono } from 'hono';
import { apexCsrf } from '../../../shared/apex/csrf';
import {
  createBadRequestFallback,
  createNotFoundFallback,
} from '../../../shared/apex/fallback-response';
import { renderHealthPage } from '../../../shared/apex/health-page';
import { etag } from 'hono/etag';
import { HTTPException } from 'hono/http-exception';
import { languageDetector } from 'hono/language';
import { logger } from 'hono/logger';
import { timeout } from 'hono/timeout';
import { checkRateLimit } from '../../../shared/apex/rate-limit';
import { applySecurityHeaders, type AssetEnv } from '../../../shared/apex/security-headers';
import { setMeta } from '../../../shared/apex/seo';
import {
  buildRegionErrorPayload,
  getDefaultRedirectUrl,
  resolveRedirectUrl,
} from './root-redirect';
import { getAboutMeta, renderAboutContent } from './page-content';
import { renderer } from './renderer';

const app = new Hono<{ Bindings: AssetEnv }>();
const pageRoutes = new Hono<{ Bindings: AssetEnv }>();

app.use(etag());
app.use(logger());
app.use(async (c, next) => {
  const blocked = await checkRateLimit(c.req.raw, c.env?.RATE_LIMITER);
  if (blocked) return blocked;
  await next();
});
app.use('*', (c, next) =>
  apexCsrf(c as unknown as Parameters<typeof apexCsrf>[0], next as Parameters<typeof apexCsrf>[1]),
);
app.use('*', async (c, next) => {
  await next();
  applySecurityHeaders(c);
});
app.use(languageDetector({ supportedLanguages: ['en', 'ja'], fallbackLanguage: 'en' }));

pageRoutes.get('/', (c) => {
  const regionParam = c.req.query('ri');

  const redirectUrl = resolveRedirectUrl(regionParam);
  if (redirectUrl) {
    return c.redirect(redirectUrl, 301);
  }

  const defaultRedirectUrl = getDefaultRedirectUrl();
  if (defaultRedirectUrl) {
    return c.redirect(defaultRedirectUrl, 301);
  }

  return c.json(buildRegionErrorPayload(), 400);
});

pageRoutes.use(renderer as unknown as Parameters<typeof pageRoutes.use>[0]);

pageRoutes.get('/about', timeout(2000), (c) => {
  setMeta(c, getAboutMeta(c.env));
  return c.render(renderAboutContent(c.get('language')));
});

app.onError(async (err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse();
  }

  // oxlint-disable-next-line no-console
  console.error('Unhandled apex error', {
    method: c.req.method,
    url: c.req.url,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });

  return createBadRequestFallback(c as unknown as Parameters<typeof createBadRequestFallback>[0]);
});

app.get('/health', timeout(2000), (c) =>
  renderHealthPage(c.env as unknown as Parameters<typeof renderHealthPage>[0]),
);

app.route('/', pageRoutes);
app.notFound(createNotFoundFallback as unknown as Parameters<typeof app.notFound>[0]);

// Sentry: to re-enable, wrap app with Sentry.withSentry() and export the handler.
export default app;

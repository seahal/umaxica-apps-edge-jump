import { Hono, type Context } from 'hono';
import { languageDetector, type LanguageVariables } from 'hono/language';
import { logger } from 'hono/logger';
import { requestId } from 'hono/request-id';
import { timeout } from 'hono/timeout';
import { trimTrailingSlash } from 'hono/trailing-slash';
import exampleJwks from './config/jwks.example.json';
import { registry as exampleRegistry } from './config/registry.example';
import {
  handleJump,
  type AuditLog,
  type JumpDeps,
  type JumpAuditLogEntry,
} from './core/handle_jump';
import { healthJson, renderHealthHtml, wantsJson } from './core/health';
import { asLocale, type Locale } from './core/i18n';
import { JwksCache, type FetchJwks } from './core/jwks_cache';
import { validateJumpJwks, type JumpJwks } from './core/jump_jwks';
import { MemoryReplayCache } from './core/replay_cache';
import { renderNotFoundPage } from './core/page';
import { renderAbout } from './core/render_about';
import { renderRobots, renderSitemap } from './core/render_discovery';
import { jumpSecureHeaders, responseHygiene } from './core/security_headers';
import { NoopOutboundSigner } from './core/sign_outbound';
import { PRODUCTION_SERVICE_ORIGIN, type JumpConfig, type RuntimeInfo } from './core/types';

export type AppOptions = Omit<Partial<JumpDeps>, 'config'> & {
  fetchJwks?: FetchJwks;
  auditLog?: AuditLog;
  config?: Partial<JumpConfig>;
  jumpJwks?: JumpJwks;
};

export function createApp(options: AppOptions = {}) {
  const runtime = options.runtime ?? detectRuntime();
  const registry = options.registry ?? exampleRegistry;
  const jwksCache = options.jwksCache ?? new JwksCache(options.fetchJwks ?? fetchExampleJwks);
  const replayCache = options.replayCache ?? new MemoryReplayCache();
  const signer = options.signer ?? new NoopOutboundSigner();
  const config = resolveJumpConfig(runtime, options.config);
  const jumpJwks = options.jumpJwks
    ? validateJumpJwks(options.jumpJwks)
    : runtime.production
      ? null
      : validateJumpJwks(exampleJwks);

  const app = new Hono<{ Variables: LanguageVariables }>({ strict: true });
  app.use('*', logger(redactLogLine));
  app.use(
    '*',
    languageDetector({
      supportedLanguages: ['ja', 'en'],
      fallbackLanguage: 'ja',
      order: ['header'],
      caches: false,
    }),
  );
  app.use('*', requestId());
  app.use('*', timeout(1000));
  app.use('*', trimTrailingSlash());
  app.use('*', responseHygiene);
  app.use('*', jumpSecureHeaders());

  app.get('/', async (c) => {
    if (c.req.query('rt') === undefined) return c.redirect('/about');
    const locale = requestLocale(c);
    const deps: JumpDeps = { registry, jwksCache, replayCache, runtime, signer, config };
    deps.auditLog = options.auditLog ?? auditLog;
    deps.locale = locale;
    if (options.now) deps.now = options.now;
    if (options.randomJti) deps.randomJti = options.randomJti;
    if (options.outboundTtl !== undefined) deps.outboundTtl = options.outboundTtl;
    return handleJump(c.req.raw, deps);
  });

  app.get('/about', (c) =>
    html(c, renderAbout(requestLocale(c), config.serviceOrigin), requestLocale(c)),
  );
  app.get('/health', (c) => {
    if (wantsJson(c.req.header('Accept') ?? null)) return json(c, healthJson(runtime));
    const locale = requestLocale(c);
    return html(c, renderHealthHtml(runtime, locale), locale);
  });
  app.get('/health.json', (c) => json(c, healthJson(runtime)));
  app.get('/health.html', (c) => {
    const locale = requestLocale(c);
    return html(c, renderHealthHtml(runtime, locale), locale);
  });
  // On Cloudflare this never runs: wrangler serves public/favicon.ico as a
  // static asset ahead of the Worker. Fastly and Node have no asset layer, so
  // this keeps them on 204 rather than falling through to the HTML 404 page.
  app.get('/favicon.ico', (c) => c.body(null, 204));
  app.get('/robots.txt', (c) => c.text(renderRobots(new URL(c.req.url).origin)));
  app.get('/sitemap.xml', (c) =>
    c.body(renderSitemap(new URL(c.req.url).origin), 200, {
      'Content-Type': 'application/xml; charset=utf-8',
    }),
  );
  app.get('/.well-known/jwks.json', (c) => {
    if (!jumpJwks) return c.body('jump jwks not configured', 503);
    return json(c, jumpJwks);
  });

  app.notFound((c) => {
    const locale = requestLocale(c);
    return c.body(renderNotFoundPage(locale), 404, {
      'Content-Language': locale,
      'Content-Type': 'text/html; charset=utf-8',
    });
  });

  return app;
}

export function resolveJumpConfig(
  _runtime: RuntimeInfo,
  config: Partial<JumpConfig> = {},
): JumpConfig {
  return {
    serviceOrigin: config.serviceOrigin ?? PRODUCTION_SERVICE_ORIGIN,
  };
}

function requestLocale(c: Context<{ Variables: LanguageVariables }>): Locale {
  return asLocale(c.get('language'));
}

function html(c: Context, body: string, locale: Locale) {
  return c.body(body, 200, {
    'Content-Language': locale,
    'Content-Type': 'text/html; charset=utf-8',
  });
}

function json(c: Context, body: unknown) {
  return c.body(JSON.stringify(body), 200, { 'Content-Type': 'application/json; charset=utf-8' });
}

export function detectRuntime(): RuntimeInfo {
  const globalEdge = globalThis as { FASTLY_SERVICE_VERSION?: string; WebSocketPair?: unknown };
  if (globalEdge.FASTLY_SERVICE_VERSION) {
    return { edge: 'fastly', production: true };
  }
  if (globalEdge.WebSocketPair) {
    return { edge: 'cloudflare', production: true };
  }
  return { edge: 'local', production: false };
}

export async function fetchExampleJwks() {
  return exampleJwks;
}

function redactLogLine(message: string) {
  // eslint-disable-next-line no-console -- request logging is intentional, but rt values are redacted.
  console.log(
    message.replace(/(\s)(\/\S*)/, (_match, whitespace: string, target: string) => {
      try {
        const url = new URL(target, 'https://request-log.invalid');
        for (const name of [...url.searchParams.keys()]) {
          if (name === 'rt') url.searchParams.set(name, '[redacted]');
        }
        return `${whitespace}${url.pathname}${url.search}${url.hash}`;
      } catch {
        return `${whitespace}[unparseable-request-target]`;
      }
    }),
  );
}

function auditLog(entry: JumpAuditLogEntry) {
  // eslint-disable-next-line no-console -- structured redirect decision logging is intentional.
  console.log(JSON.stringify(entry));
}

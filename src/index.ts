import { Hono, type Context } from 'hono';
import { languageDetector, type LanguageVariables } from 'hono/language';
import { logger } from 'hono/logger';
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
import { NoopReplayCache } from './core/replay_cache';
import { renderErrorPage, renderNotFoundPage } from './core/page';
import { renderAbout } from './core/render_about';
import { renderRobots, renderSitemap } from './core/render_discovery';
import { jumpSecureHeaders, responseHygiene } from './core/security_headers';
import { NoopOutboundSigner, type OutboundSigner } from './core/sign_outbound';
import {
  JumpError,
  PRODUCTION_SERVICE_ORIGIN,
  type JumpConfig,
  type IssuerRegistry,
  type RuntimeInfo,
} from './core/types';

type RequestVariables = LanguageVariables & {
  deadlineSignal: AbortSignal;
  requestId: string;
};
type AppEnv = { Bindings: object; Variables: RequestVariables };

export type AppOptions = Omit<Partial<JumpDeps>, 'config'> & {
  fetchJwks?: FetchJwks;
  auditLog?: AuditLog;
  config?: Partial<JumpConfig>;
  jumpJwks?: JumpJwks;
  signerForRequest?: (env: object, signal: AbortSignal) => OutboundSigner;
  jumpJwksForRequest?: (env: object, signal: AbortSignal) => Promise<JumpJwks | undefined>;
  deadlineMs?: number;
};

export function createApp(options: AppOptions = {}) {
  const runtime = options.runtime ?? detectRuntime();
  const registry = options.registry ?? exampleRegistry;
  const jwksCache = options.jwksCache ?? new JwksCache(options.fetchJwks ?? fetchExampleJwks);
  // A jump token is reusable within its `exp` by design, and the redirect
  // decision must not depend on isolate-local state: a replay cache would make
  // the same token redirect on a cold isolate and fail on a warm one. Callers
  // that genuinely want single-use semantics pass MemoryReplayCache in.
  const replayCache = options.replayCache ?? new NoopReplayCache();
  const signer = options.signer ?? new NoopOutboundSigner();
  const config = resolveJumpConfig(runtime, options.config);
  const jumpJwks = options.jumpJwks
    ? validateJumpJwks(options.jumpJwks)
    : runtime.production
      ? null
      : validateJumpJwks(exampleJwks);

  validateRegistry(registry, runtime);
  const app = new Hono<AppEnv>({ strict: true });
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
  app.use('*', internalRequestId());
  app.use('*', responseHygiene);
  app.use('*', jumpSecureHeaders());
  app.use('*', requestDeadline(options.deadlineMs ?? 1000));
  app.use('*', trimSlashExceptRoot());

  app.on(['GET', 'HEAD'], '/', async (c) => {
    if (c.req.query('rt') === undefined) return c.redirect('/about');
    const locale = requestLocale(c);
    const signal = c.get('deadlineSignal');
    const requestSigner = options.signerForRequest?.(c.env, signal) ?? signer;
    const deps: JumpDeps = {
      registry,
      jwksCache,
      replayCache,
      runtime,
      signer: requestSigner,
      config,
      signal,
    };
    let pendingAudit: JumpAuditLogEntry | undefined;
    deps.auditLog = (entry) => {
      pendingAudit = entry;
    };
    deps.locale = locale;
    if (options.now) deps.now = options.now;
    if (options.randomJti) deps.randomJti = options.randomJti;
    if (options.outboundTtl !== undefined) deps.outboundTtl = options.outboundTtl;
    const started = performance.now();
    const response = await raceWithDeadline(handleJump(c.req.raw, deps), signal, locale);
    const entry = pendingAudit ?? auditEntryForResponse(response);
    (options.auditLog ?? auditLog)({
      ...entry,
      request_id: c.get('requestId'),
      ...cfRayFields(c.req.header('CF-Ray')),
      status: response.status,
      latency_ms: Math.round(performance.now() - started),
    });
    return c.req.method === 'HEAD' ? withoutBody(response) : response;
  });

  app.all('/', (c) =>
    c.body(renderErrorPage(requestLocale(c)), 405, {
      Allow: 'GET, HEAD',
      'Content-Language': requestLocale(c),
      'Content-Type': 'text/html; charset=utf-8',
      'X-Jump-Error': 'method_not_allowed',
    }),
  );

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
  // Cloudflare dispatches this path through the Worker first; cloudflare.ts
  // delegates to the ASSETS binding. Fastly and Node use this fallback route.
  app.get('/favicon.ico', (c) => c.body(null, 204));
  app.get('/robots.txt', (c) => c.text(renderRobots(new URL(c.req.url).origin)));
  app.get('/sitemap.xml', (c) =>
    c.body(renderSitemap(new URL(c.req.url).origin), 200, {
      'Content-Type': 'application/xml; charset=utf-8',
    }),
  );
  app.get('/.well-known/jwks.json', async (c) => {
    const requestJwks = options.jumpJwksForRequest
      ? await options.jumpJwksForRequest(c.env, c.get('deadlineSignal'))
      : jumpJwks;
    if (!requestJwks) throw new JumpError('signer_unavailable', 'jump jwks not configured');
    return json(c, requestJwks);
  });

  app.notFound((c) => {
    const locale = requestLocale(c);
    return c.body(renderNotFoundPage(locale), 404, {
      'Content-Language': locale,
      'Content-Type': 'text/html; charset=utf-8',
    });
  });

  app.onError((error, c) => {
    const jumpError = error instanceof JumpError ? error : new JumpError('internal_error');
    const status = errorStatus(jumpError.code);
    auditLog({
      level: 'warn',
      event: 'jump_reject',
      result: 'rejected',
      reason: jumpError.code,
      request_id: c.get('requestId'),
      ...cfRayFields(c.req.header('CF-Ray')),
      status,
    });
    return c.body(renderErrorPage(requestLocale(c)), status, {
      'Content-Language': requestLocale(c),
      'Content-Type': 'text/html; charset=utf-8',
      'X-Jump-Error': publicErrorCode(jumpError.code),
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

function requestLocale(c: Context<AppEnv>): Locale {
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
        return `${whitespace}${url.pathname}`;
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

function internalRequestId() {
  return async (c: Context<AppEnv>, next: () => Promise<void>) => {
    const id = crypto.randomUUID();
    c.set('requestId', id);
    await next();
    c.header('X-Request-ID', id);
  };
}

/**
 * `trimTrailingSlash` rewrites a 404 into a 301 to the same URL minus one
 * trailing slash — query string included. For an all-slashes path that means
 * `GET //?rt=<jwt>` answers 301 with the inbound token echoed into `Location`,
 * on a status the jump contract does not define. Paths that collapse to the
 * jump route are left as a plain 404; `/about/` and friends still normalize.
 */
function trimSlashExceptRoot() {
  const trim = trimTrailingSlash();
  return async (c: Context<AppEnv>, next: () => Promise<void>) => {
    if (/^\/+$/.test(c.req.path)) return next();
    return trim(c, next);
  };
}

function requestDeadline(durationMs: number) {
  return async (c: Context<AppEnv>, next: () => Promise<void>) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), durationMs);
    c.set('deadlineSignal', controller.signal);
    try {
      await next();
    } finally {
      clearTimeout(timer);
    }
  };
}

async function raceWithDeadline(
  work: Promise<Response>,
  signal: AbortSignal,
  locale: Locale,
): Promise<Response> {
  if (signal.aborted) return deadlineResponse(locale);
  return new Promise((resolve) => {
    const abort = () => resolve(deadlineResponse(locale));
    signal.addEventListener('abort', abort, { once: true });
    work
      .then(resolve, () => resolve(internalErrorResponse(locale)))
      .finally(() => {
        signal.removeEventListener('abort', abort);
      });
  });
}

function deadlineResponse(locale: Locale) {
  return new Response(renderErrorPage(locale), {
    status: 504,
    headers: {
      'Content-Language': locale,
      'Content-Type': 'text/html; charset=utf-8',
      'X-Jump-Error': 'deadline_exceeded',
    },
  });
}

function internalErrorResponse(locale: Locale) {
  return new Response(renderErrorPage(locale), {
    status: 500,
    headers: {
      'Content-Language': locale,
      'Content-Type': 'text/html; charset=utf-8',
      'X-Jump-Error': 'internal_error',
    },
  });
}

function withoutBody(response: Response) {
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function auditEntryForResponse(response: Response): JumpAuditLogEntry {
  const accepted = response.status < 400;
  return {
    level: accepted ? 'info' : 'warn',
    event: accepted ? 'jump_accept' : 'jump_reject',
    result: accepted ? 'accepted' : 'rejected',
    ...(accepted ? {} : { reason: response.headers.get('X-Jump-Error') ?? 'internal_error' }),
  };
}

function errorStatus(code: string): 400 | 500 | 502 | 503 | 504 {
  if (code === 'jwks_bad_gateway') return 502;
  if (code === 'jwks_unavailable' || code === 'signer_unavailable') return 503;
  if (code === 'deadline_exceeded') return 504;
  if (code === 'internal_error') return 500;
  return 400;
}

function publicErrorCode(code: string) {
  if (code === 'jwks_bad_gateway') return 'upstream_response_invalid';
  if (code === 'jwks_unavailable' || code === 'signer_unavailable') return 'service_unavailable';
  if (code === 'deadline_exceeded') return 'deadline_exceeded';
  if (code === 'internal_error') return 'internal_error';
  return 'invalid_request';
}

function validateRegistry(registry: IssuerRegistry, runtime: RuntimeInfo) {
  for (const [name, issuer] of Object.entries(registry)) {
    if (name !== issuer.iss) throw new Error('registry issuer key mismatch');
    const issuerUrl = new URL(issuer.iss);
    if (runtime.production && issuerUrl.protocol !== 'https:')
      throw new Error('production issuer must use https');
    if (issuerUrl.username || issuerUrl.password || issuerUrl.port || issuerUrl.pathname !== '/')
      throw new Error('issuer must be an exact origin');
    if (issuer.allowed_dst_external !== false && !Array.isArray(issuer.allowed_dst_external))
      throw new Error('external destination policy rejected');
    for (const destination of [
      ...issuer.allowed_dst_internal,
      ...(Array.isArray(issuer.allowed_dst_external) ? issuer.allowed_dst_external : []),
    ]) {
      const url = new URL(destination);
      if (runtime.production && url.protocol !== 'https:')
        throw new Error('production destination must use https');
      if (
        url.username ||
        url.password ||
        url.port ||
        url.pathname !== '/' ||
        url.search ||
        url.hash
      )
        throw new Error('destination must be an exact origin');
    }
  }
}

function cfRayFields(value: string | undefined): { cf_ray?: string } {
  return value ? { cf_ray: value } : {};
}

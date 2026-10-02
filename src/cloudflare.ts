import { importJWK, importPKCS8, jwtVerify, SignJWT, type JWK } from 'jose';
import { registry as umaxicaRegistry } from './config/registry.umaxica';
import { fetchRegistryJwks } from './core/fetch_jwks';
import { createApp } from './index';
import { JwksCache } from './core/jwks_cache';
import { asLocale } from './core/i18n';
import { renderRateLimitPage } from './core/page';
import { emitSecurityLog } from './core/security_log';
import { publicErrorHeaders, publicErrorResponse } from './core/public_error';
import { STANDALONE_HTML_SECURITY_HEADERS } from './core/security_headers';
import { JoseOutboundSigner, type OutboundSigner } from './core/sign_outbound';
import { JumpError, type OutboundJumpClaim } from './core/types';
import { validateServiceOrigin, isRtKey } from './core/normalize_url';
import { raceAbort, throwIfAborted } from './core/deadline';
import { parseJumpJwks, type JumpJwks } from './core/jump_jwks';

type SecretBinding = string | { get(): Promise<string> };
type RateLimiter = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};
type AssetsFetcher = { fetch(request: Request): Promise<Response> };
type VersionMetadata = {
  id?: string;
  tag?: string;
  timestamp?: string;
};

export type CloudflareEnv = {
  CF_VERSION_METADATA?: VersionMetadata;
  ASSETS?: AssetsFetcher;
  JUMP_RATE_LIMITER?: RateLimiter;
  UMAXICA_JUMP_PRIVATE_KEY_PEM?: SecretBinding;
  UMAXICA_JUMP_PRIVATE_KEY_KID?: SecretBinding;
  UMAXICA_JUMP_ORIGIN?: string;
  UMAXICA_JUMP_PUBLIC_JWKS?: SecretBinding;
  'UMAXICA-APPS-EDGE-JUMP-VERSION'?: VersionMetadata;
};

/** Bounded by live binding bundle objects. Distinct bundles never share issuer caches. */
let apps = new WeakMap<
  object,
  { identity: string; revision: string | null; app: ReturnType<typeof createApp> }
>();

/**
 * Imported signing key material, kept separate from the app cache above.
 *
 * This one *is* keyed on `env`, deliberately: its entries are derived from the
 * secret bindings that hang off `env`, and the cache keys them by `kid` alone.
 * Sharing it across differing `env`s would hand out a signer built from one
 * secret to a request carrying another. In production `kid` and private key are
 * 1:1, so this only costs a re-import on isolates where `env` identity is not
 * stable — CPU-only work, unlike the JWKS fetch the app cache now shares.
 */
let keyMaterialCaches = new WeakMap<object, CloudflareKeyMaterialCache>();

/**
 * Drops the module-scope caches, so a caller can start from a cold isolate.
 * Exists for tests — each case needs its own JWKS keyset, which is exactly the
 * state a warm isolate is supposed to keep. Production never calls this.
 */
export function resetIsolateCachesForTest() {
  apps = new WeakMap();
  keyMaterialCaches = new WeakMap();
}

function keyMaterialCacheFor(env: CloudflareEnv) {
  const existing = keyMaterialCaches.get(env);
  if (existing) return existing;
  const created = new CloudflareKeyMaterialCache();
  keyMaterialCaches.set(env, created);
  return created;
}

export default {
  async fetch(request: Request, env: CloudflareEnv, executionContext: ExecutionContext) {
    const requestId = crypto.randomUUID();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1000);
    const locale = asLocale(request.headers.get('Accept-Language')?.startsWith('en') ? 'en' : 'ja');
    let response: Response;
    try {
      response = await raceAbort(
        dispatch(request, env, executionContext, requestId, controller.signal),
        controller.signal,
      );
    } catch (error) {
      const code = error instanceof JumpError ? error.code : 'internal_error';
      emitSecurityLog({ level: 'warn', event: 'jump_reject', reason: code, request_id: requestId });
      response = isReadinessRequest(request)
        ? readinessResponse(false)
        : publicErrorResponse(code, locale);
    } finally {
      clearTimeout(timer);
    }
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(STANDALONE_HTML_SECURITY_HEADERS))
      headers.set(name, value);
    headers.delete('Set-Cookie');
    headers.set('X-Request-ID', requestId);
    return new Response(request.method === 'HEAD' ? null : response.body, {
      status: response.status,
      headers,
    });
  },
};

async function dispatch(
  request: Request,
  env: CloudflareEnv,
  ctx: ExecutionContext,
  requestId: string,
  signal: AbortSignal,
) {
  let serviceOrigin: string;
  try {
    serviceOrigin = validateServiceOrigin(env.UMAXICA_JUMP_ORIGIN);
  } catch {
    emitSecurityLog({ level: 'warn', event: 'jump_reject', reason: 'invalid_service_origin' });
    throw new JumpError('signer_unavailable');
  }
  for (const issuer of Object.values(umaxicaRegistry)) {
    const external = issuer.allowed_dst_external;
    if (
      issuer.iss === serviceOrigin ||
      issuer.allowed_dst_internal.includes(serviceOrigin) ||
      (Array.isArray(external) && external.includes(serviceOrigin))
    )
      throw new JumpError('signer_unavailable');
  }
  const url = new URL(request.url);
  if (url.origin !== serviceOrigin) {
    emitSecurityLog({
      level: 'warn',
      event: 'jump_reject',
      reason: 'request_origin_mismatch',
      request_id: requestId,
    });
    throw new JumpError('malformed');
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const response = publicErrorResponse('method_not_allowed');
    response.headers.set('Allow', 'GET, HEAD');
    return response;
  }
  const keys = [...url.searchParams.keys()];
  if (
    (url.pathname !== '/' && keys.some(isRtKey)) ||
    (url.pathname === '/' &&
      url.search &&
      (keys.some((key) => key !== 'rt') ||
        url.searchParams.getAll('rt').length !== 1 ||
        !url.searchParams.get('rt')))
  )
    throw new JumpError('malformed');
  if (url.pathname === '/ready') {
    assertLimiterBinding(env);
    await keyMaterialCacheFor(env).getSigner(env, signal);
    throwIfAborted(signal);
    return readinessResponse(true);
  }
  const limited = await checkRateLimit(request, env, requestId, signal);
  throwIfAborted(signal);
  if (limited) return limited;
  if (isStaticAsset(url)) return raceAbort(serveStaticAsset(request, env, requestId), signal);
  const app = getApp(env, serviceOrigin);
  return app.fetch(request, env, ctx, { requestId, signal });
}

function isReadinessRequest(request: Request) {
  return (
    new URL(request.url).pathname === '/ready' &&
    (request.method === 'GET' || request.method === 'HEAD')
  );
}

function readinessResponse(ready: boolean) {
  return new Response(JSON.stringify({ status: ready ? 'ready' : 'unavailable' }), {
    status: ready ? 200 : 503,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function assertLimiterBinding(env: CloudflareEnv) {
  const limiter = env.JUMP_RATE_LIMITER;
  if (!limiter || typeof limiter.limit !== 'function') {
    emitSecurityLog({ level: 'warn', event: 'jump_reject', reason: 'limiter_binding_missing' });
    throw new JumpError('signer_unavailable');
  }
  return limiter;
}

function getApp(env: CloudflareEnv, serviceOrigin: string) {
  const existing = apps.get(env);
  const revision = cloudflareRevision(env);
  if (existing?.identity === serviceOrigin && existing.revision === revision) return existing.app;
  const app = createApp({
    registry: umaxicaRegistry,
    jwksCache: new JwksCache(fetchRegistryJwks),
    config: { serviceOrigin },
    runtime: { edge: 'cloudflare', production: true },
    signerForRequest: (requestEnv, signal) =>
      new LazyCloudflareSigner(
        requestEnv as CloudflareEnv,
        keyMaterialCacheFor(requestEnv as CloudflareEnv),
        signal,
      ),
    jumpJwksForRequest: (requestEnv, signal) =>
      readJumpJwks(
        requestEnv as CloudflareEnv,
        keyMaterialCacheFor(requestEnv as CloudflareEnv),
        signal,
      ),
  });
  apps.set(env, { identity: serviceOrigin, revision, app });
  return app;
}

function cloudflareRevision(env: CloudflareEnv) {
  const metadata = env['UMAXICA-APPS-EDGE-JUMP-VERSION'] ?? env.CF_VERSION_METADATA;
  return metadata?.id ?? metadata?.tag ?? null;
}

/** Only exceptions from calling a verified binding may fail open. */
async function checkRateLimit(
  request: Request,
  env: CloudflareEnv,
  requestId: string,
  signal: AbortSignal,
) {
  const limiter = assertLimiterBinding(env);
  const ip = request.headers.get('CF-Connecting-IP');
  if (!validClientIp(ip)) throw new JumpError('signer_unavailable');
  let result: unknown;
  try {
    result = await raceAbort(limiter.limit({ key: ip }), signal);
  } catch {
    throwIfAborted(signal);
    emitSecurityLog({
      level: 'warn',
      event: 'jump_rate_limit_skipped',
      reason: 'limiter_call_exception',
      request_id: requestId,
      rate_limit_outcome: 'skipped',
    });
    return null;
  }
  if (
    !result ||
    typeof result !== 'object' ||
    !('success' in result) ||
    typeof result.success !== 'boolean'
  )
    throw new JumpError('signer_unavailable');
  if (result.success === true) return null;
  return new Response(
    renderRateLimitPage(
      asLocale(request.headers.get('Accept-Language')?.startsWith('en') ? 'en' : 'ja'),
    ),
    { status: 429, headers: publicErrorHeaders('rate_limited') },
  );
}

function validClientIp(value: string | null): value is string {
  if (!value || /[\s\[\]\/\\?#@%]/.test(value)) return false;
  try {
    if (value.includes(':')) return new URL(`https://[${value}]`).hostname.startsWith('[');
    const parts = value.split('.');
    return (
      parts.length === 4 &&
      parts.every((part) => /^(0|[1-9][0-9]{0,2})$/.test(part) && Number(part) <= 255) &&
      new URL(`https://${value}`).hostname === value
    );
  } catch {
    return false;
  }
}

function isStaticAsset(url: URL) {
  return url.pathname === '/favicon.ico';
}

async function serveStaticAsset(request: Request, env: CloudflareEnv, requestId: string) {
  const response = env.ASSETS
    ? await env.ASSETS.fetch(request)
    : new Response(null, { status: 204 });
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(STANDALONE_HTML_SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  headers.delete('Set-Cookie');
  headers.set('X-Request-ID', requestId);
  return new Response(request.method === 'HEAD' ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

class LazyCloudflareSigner implements OutboundSigner {
  constructor(
    private readonly env: CloudflareEnv,
    private readonly cache: CloudflareKeyMaterialCache,
    private readonly signal: AbortSignal,
  ) {}

  async sign(claim: OutboundJumpClaim) {
    throwIfAborted(this.signal);
    const signer = await this.cache.getSigner(this.env, this.signal);
    throwIfAborted(this.signal);
    return raceAbort(signer.sign(claim), this.signal);
  }
}

type KeyMaterial = {
  signer: OutboundSigner;
  jwks: JumpJwks;
  expiresAt: number;
};

class CloudflareKeyMaterialCache {
  private readonly entries = new Map<string, Promise<KeyMaterial>>();

  constructor(private readonly ttlMs = 300_000) {}

  async getSigner(env: CloudflareEnv, signal: AbortSignal) {
    return (await this.get(env, signal)).signer;
  }

  async getJwks(env: CloudflareEnv, signal: AbortSignal) {
    return (await this.get(env, signal)).jwks;
  }

  private async get(env: CloudflareEnv, signal: AbortSignal) {
    throwIfAborted(signal);
    const kid = await readPrivateKeyKid(env, signal);
    if (!kid) {
      emitSecurityLog({ level: 'warn', event: 'jump_reject', reason: 'missing_active_kid' });
      throw new JumpError('signer_unavailable');
    }
    if (kid.length > 128) throw new JumpError('signer_unavailable');
    const key = `${cloudflareRevision(env) ?? 'unversioned'}:${kid}`;
    const current = this.entries.get(key);
    if (current) {
      const material = await raceAbort(current, signal);
      if (material.expiresAt > Date.now()) return material;
      this.entries.delete(key);
    }
    for (const [entryKey, entry] of this.entries) {
      void entry.then(
        (material) => {
          if (material.expiresAt <= Date.now()) this.entries.delete(entryKey);
        },
        () => this.entries.delete(entryKey),
      );
    }
    const loading = loadKeyMaterial(env, kid, signal, this.ttlMs);
    this.entries.set(key, loading);
    try {
      return await raceAbort(loading, signal);
    } catch (error) {
      this.entries.delete(key);
      throw error;
    }
  }
}

async function loadKeyMaterial(
  env: CloudflareEnv,
  kid: string,
  signal: AbortSignal,
  ttlMs: number,
): Promise<KeyMaterial> {
  const [pem, configuredJwks] = await Promise.all([
    readPrivateKeyPem(env, signal),
    readConfiguredJumpJwks(env, signal),
  ]);
  const context = {
    private_key_present: Boolean(pem),
    kid_present: true,
    kid,
    jwks_present: Boolean(configuredJwks),
  };
  logSignerConfig(context);
  if (!pem) {
    logSignerUnavailable({ ...context, reason: 'missing_private_key' });
    throw new JumpError('signer_unavailable', 'outbound signer not configured');
  }

  if (!configuredJwks) {
    logSignerUnavailable({ ...context, reason: 'missing_public_jwks' });
    throw new JumpError('signer_unavailable');
  }
  let privateKey: Parameters<SignJWT['sign']>[0];
  try {
    privateKey = await raceAbort(importPKCS8(pem, 'ES384', { extractable: false }), signal);
    // Every public key must import; only the active one is pair checked.
    await raceAbort(Promise.all(configuredJwks.keys.map((key) => importJWK(key, 'ES384'))), signal);
  } catch {
    throwIfAborted(signal);
    logSignerUnavailable({ ...context, reason: 'key_import_failed' });
    throw new JumpError('signer_unavailable');
  }
  const jwks = configuredJwks;
  const publicJwk = jwks.keys.find((key) => key.kid === kid);
  if (!publicJwk) {
    logSignerUnavailable({ ...context, reason: 'kid_not_in_public_jwks' });
    throw new JumpError('signer_unavailable', 'outbound signer public key mismatch');
  }

  try {
    await raceAbort(assertPrivateKeyMatchesPublicJwk(privateKey, publicJwk, kid), signal);
  } catch (error) {
    logSignerPairCheckFailed(context, error);
    logSignerUnavailable({ ...context, import_pkcs8_ok: true, reason: 'key_pair_mismatch' });
    throw new JumpError('signer_unavailable', 'outbound signer public key mismatch');
  }

  logSignerConfigured({
    kid,
    public_jwks_kids: jwks.keys.flatMap((key) => (key.kid ? [key.kid] : [])),
  });
  return {
    signer: new JoseOutboundSigner(privateKey, kid),
    jwks,
    expiresAt: Date.now() + ttlMs,
  };
}

async function readPrivateKeyPem(env: CloudflareEnv, signal?: AbortSignal) {
  const value = await readBinding(env.UMAXICA_JUMP_PRIVATE_KEY_PEM, 'private_key_pem', signal);
  return normalizePem(value);
}

async function readPrivateKeyKid(env: CloudflareEnv, signal?: AbortSignal) {
  const value = await readBinding(env.UMAXICA_JUMP_PRIVATE_KEY_KID, 'private_key_kid', signal);
  return value?.trim() || null;
}

async function readConfiguredJumpJwks(env: CloudflareEnv, signal?: AbortSignal) {
  const value = await readBinding(env.UMAXICA_JUMP_PUBLIC_JWKS, 'public_jwks', signal);
  if (!value) return undefined;
  try {
    return parseJumpJwks(value);
  } catch {
    // A malformed runtime variable is service configuration failure, not a bad
    // client request. Keep the public response at 503 and log only the class.
    // eslint-disable-next-line no-console -- no JWKS body or secret material.
    console.error(
      JSON.stringify({
        event: 'jump_public_jwks_invalid',
        reason: 'operation_failed',
      }),
    );
    throw new JumpError('signer_unavailable', 'outbound public jwks invalid');
  }
}

async function readJumpJwks(
  env: CloudflareEnv,
  cache: CloudflareKeyMaterialCache,
  signal: AbortSignal,
) {
  // Publish only the same keyset that has passed the private/public pair check
  // used by outbound signing. This also avoids reparsing the configured JWKS on
  // every discovery request.
  return cache.getJwks(env, signal);
}

async function readBinding(binding: SecretBinding | undefined, name: string, signal?: AbortSignal) {
  throwIfAborted(signal);
  if (!binding) return null;
  if (typeof binding === 'string') return binding;
  try {
    const value = await raceAbort(binding.get(), signal);
    throwIfAborted(signal);
    return value;
  } catch (error) {
    if (error instanceof JumpError) throw error;
    // A Secrets Store binding throws when the secret is absent from the store
    // (local `wrangler dev`, an unprovisioned store, a rotation gap). Without
    // this catch the rejection escapes the fetch handler and every request
    // 500s, including /about and /health, which need no key at all. Degrade to
    // "not configured" instead: the signer then reports signer_unavailable and
    // only the redirect path is affected.
    logSecretUnavailable(name, error);
    return null;
  }
}

async function assertPrivateKeyMatchesPublicJwk(
  privateKey: Parameters<SignJWT['sign']>[0],
  publicJwk: JWK,
  kid: string,
) {
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({ probe: true, iat: now })
    .setProtectedHeader({ typ: 'JWT', alg: 'ES384', kid })
    .sign(privateKey);
  await jwtVerify(token, await importJWK(publicJwk, 'ES384'), {
    algorithms: ['ES384'],
    typ: 'JWT',
    currentDate: new Date(now * 1000),
  });
}

function logSecretUnavailable(name: string, _error: unknown) {
  // eslint-disable-next-line no-console -- binding name and error class only; never provider messages or values.
  console.warn(
    JSON.stringify({
      event: 'jump_secret_binding_unavailable',
      binding: name,
      reason: 'operation_failed',
    }),
  );
}

function logSignerConfig(entry: {
  private_key_present: boolean;
  kid_present: boolean;
  kid?: string | undefined;
  jwks_present: boolean;
}) {
  // eslint-disable-next-line no-console -- safe signer diagnostics omit tokens and secret material.
  console.warn(JSON.stringify({ event: 'jump_signer_config', ...entry }));
}

function logSignerUnavailable(entry: {
  reason: string;
  private_key_present: boolean;
  kid_present: boolean;
  kid?: string | undefined;
  jwks_present: boolean;
  import_pkcs8_ok?: boolean | undefined;
}) {
  // eslint-disable-next-line no-console -- safe signer diagnostics omit tokens and secret material.
  console.warn(JSON.stringify({ event: 'jump_signer_unavailable', ...entry }));
}

function logSignerPairCheckFailed(
  entry: {
    private_key_present: boolean;
    kid_present: boolean;
    kid?: string | undefined;
    jwks_present: boolean;
  },
  _error: unknown,
) {
  // eslint-disable-next-line no-console -- safe signer diagnostics omit tokens and secret material.
  console.error(
    JSON.stringify({
      event: 'jump_signer_pair_check_failed',
      ...entry,
      import_pkcs8_ok: true,
      reason: 'operation_failed',
    }),
  );
}

function logSignerConfigured(entry: { kid: string; public_jwks_kids: string[] }) {
  // eslint-disable-next-line no-console -- safe signer diagnostics omit tokens and secret material.
  console.info(
    JSON.stringify({
      event: 'jump_signer_configured',
      signer_configured: true,
      signer_kid: entry.kid,
      private_key_imported: true,
      public_jwks_kids: entry.public_jwks_kids,
    }),
  );
}

function normalizePem(value: string | null) {
  let normalized = value?.trim();
  if (!normalized) return null;

  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    const quote = normalized[0];
    if (quote === '"') {
      try {
        const parsed = JSON.parse(normalized) as unknown;
        if (typeof parsed === 'string') normalized = parsed.trim();
      } catch {
        normalized = normalized.slice(1, -1).trim();
      }
    } else {
      normalized = normalized.slice(1, -1).trim();
    }
  }

  return normalized.replaceAll('\\r\\n', '\n').replaceAll('\\n', '\n').replaceAll('\r\n', '\n');
}

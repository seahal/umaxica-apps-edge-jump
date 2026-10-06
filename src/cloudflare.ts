import { importJWK, importPKCS8, jwtVerify, SignJWT, type JWK } from 'jose';
import { registry as umaxicaRegistry } from './config/registry.umaxica';
import { fetchRegistryJwks } from './core/fetch_jwks';
import { createApp } from './index';
import { JwksCache } from './core/jwks_cache';
import type { Locale } from './core/i18n';
import { renderRateLimitPage } from './core/page';
import { emitSecurityLog } from './core/security_log';
import { publicErrorHeaders, publicErrorResponse } from './core/public_error';
import { STANDALONE_HTML_SECURITY_HEADERS } from './core/security_headers';
import { JoseOutboundSigner, type OutboundSigner } from './core/sign_outbound';
import { JumpError, type OutboundJumpClaim } from './core/types';
import { validateServiceOrigin, hasMalformedRtQuery } from './core/normalize_url';
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

/**
 * One app, and with it one issuer `JwksCache`, per isolate.
 *
 * Not keyed on `env`: Workers may reuse module state across requests but does
 * not promise the same `env` reference, so an `env`-keyed app could refetch
 * every issuer keyset on every request. The app holds nothing derived from
 * `env` beyond the canonical service origin — the registry is static, issuer
 * keysets are public and fetched from registry-pinned URLs, and signing
 * material is read from each request's own `env` (see `keyMaterialCaches`).
 *
 * A single entry bounds it. It is an optimization only: a cold isolate, or a
 * request whose origin or Worker version differs, builds a fresh app and
 * reaches the same decision at the cost of a JWKS fetch.
 */
let cachedApp:
  | { serviceOrigin: string; revision: string | null; app: ReturnType<typeof createApp> }
  | undefined;

/**
 * Imported signing key material, kept separate from the app cache above.
 *
 * This one *is* keyed on `env`, deliberately: its entries are derived from the
 * secret bindings that hang off `env`, and the cache keys them by `kid` alone.
 * Sharing it across differing `env`s would hand out a signer built from one
 * secret to a request carrying another. In production `kid` and private key are
 * 1:1, so this only costs a re-import on isolates where `env` identity is not
 * stable — CPU-only work, unlike the JWKS fetch the isolate-scope app shares.
 */
let keyMaterialCaches = new WeakMap<object, CloudflareKeyMaterialCache>();

/**
 * Drops the module-scope caches, so a caller can start from a cold isolate.
 * Exists for tests — each case needs its own JWKS keyset, which is exactly the
 * state a warm isolate is supposed to keep. Production never calls this.
 */
export function resetIsolateCachesForTest() {
  cachedApp = undefined;
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
    const locale = requestLocale(request);
    let response: Response;
    try {
      response = await raceAbort(
        dispatch(request, env, executionContext, requestId, controller.signal),
        controller.signal,
      );
    } catch (error) {
      const code = error instanceof JumpError ? error.code : 'internal_error';
      emitSecurityLog({ level: 'warn', event: 'jump_reject', reason: code, request_id: requestId });
      response = publicErrorResponse(code, locale);
    } finally {
      clearTimeout(timer);
    }
    return new Response(request.method === 'HEAD' ? null : response.body, {
      status: response.status,
      headers: hardenedHeaders(response, requestId),
    });
  },
};

function requestLocale(request: Request): Locale {
  return request.headers.get('Accept-Language')?.startsWith('en') ? 'en' : 'ja';
}

function hardenedHeaders(response: Response, requestId: string) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(STANDALONE_HTML_SECURITY_HEADERS))
    headers.set(name, value);
  headers.delete('Set-Cookie');
  headers.set('X-Request-ID', requestId);
  return headers;
}

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
      // The production registry has no external allow-list.
      /* v8 ignore start */
      (Array.isArray(external) && external.includes(serviceOrigin))
      /* v8 ignore stop */
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
  if (hasMalformedRtQuery(url)) throw new JumpError('malformed');
  const limited = await checkRateLimit(request, env, requestId, signal);
  throwIfAborted(signal);
  if (limited) return limited;
  if (isStaticAsset(url)) return raceAbort(serveStaticAsset(request, env, requestId), signal);
  const app = getApp(env, serviceOrigin);
  return app.fetch(request, env, ctx, { requestId, signal });
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
  const revision = cloudflareRevision(env);
  if (cachedApp?.serviceOrigin === serviceOrigin && cachedApp.revision === revision)
    return cachedApp.app;
  const app = createApp({
    registry: umaxicaRegistry,
    jwksCache: new JwksCache(fetchRegistryJwks),
    config: { serviceOrigin },
    runtime: { edge: 'cloudflare', production: true },
    signerForRequest: (requestEnv, signal) => {
      const cfEnv = requestEnv as CloudflareEnv;
      return new LazyCloudflareSigner(cfEnv, keyMaterialCacheFor(cfEnv), signal);
    },
    // Publish only the same keyset that has passed the private/public pair check
    // used by outbound signing. This also avoids reparsing the configured JWKS on
    // every discovery request.
    jumpJwksForRequest: (requestEnv, signal) => {
      const cfEnv = requestEnv as CloudflareEnv;
      return keyMaterialCacheFor(cfEnv).getJwks(cfEnv, signal);
    },
  });
  cachedApp = { serviceOrigin, revision, app };
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
  return new Response(renderRateLimitPage(requestLocale(request)), {
    status: 429,
    headers: publicErrorHeaders('rate_limited'),
  });
}

function validClientIp(value: string | null): value is string {
  if (!value || /[\s[\]/\\?#@%]/.test(value)) return false;
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
  return new Response(request.method === 'HEAD' ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: hardenedHeaders(response, requestId),
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
        /* v8 ignore next -- rejected loads are removed by their own caller */
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
  const [pem, jwks] = await Promise.all([
    readPrivateKeyPem(env, signal),
    readConfiguredJumpJwks(env, signal),
  ]);
  const context = {
    private_key_present: Boolean(pem),
    kid_present: true,
    kid,
    jwks_present: Boolean(jwks),
  };
  logSignerConfig(context);
  if (!pem) {
    logSignerUnavailable({ ...context, reason: 'missing_private_key' });
    throw new JumpError('signer_unavailable', 'outbound signer not configured');
  }

  if (!jwks) {
    logSignerUnavailable({ ...context, reason: 'missing_public_jwks' });
    throw new JumpError('signer_unavailable');
  }
  let privateKey: Parameters<SignJWT['sign']>[0];
  try {
    privateKey = await raceAbort(importPKCS8(pem, 'ES384', { extractable: false }), signal);
    // Every public key must import; only the active one is pair checked.
    await raceAbort(Promise.all(jwks.keys.map((key) => importJWK(key, 'ES384'))), signal);
  } catch {
    throwIfAborted(signal);
    logSignerUnavailable({ ...context, reason: 'key_import_failed' });
    throw new JumpError('signer_unavailable');
  }
  const publicJwk = jwks.keys.find((key) => key.kid === kid);
  if (!publicJwk) {
    logSignerUnavailable({ ...context, reason: 'kid_not_in_public_jwks' });
    throw new JumpError('signer_unavailable', 'outbound signer public key mismatch');
  }

  try {
    await raceAbort(assertPrivateKeyMatchesPublicJwk(privateKey, publicJwk, kid), signal);
  } catch {
    logSignerPairCheckFailed(context);
    logSignerUnavailable({ ...context, import_pkcs8_ok: true, reason: 'key_pair_mismatch' });
    throw new JumpError('signer_unavailable', 'outbound signer public key mismatch');
  }

  logSignerConfigured({
    kid,
    /* v8 ignore next -- parseJumpJwks requires every key to carry a kid */
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
    logSecretUnavailable(name);
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

function logSecretUnavailable(name: string) {
  // eslint-disable-next-line no-console -- binding name and error class only; never provider messages or values.
  console.warn(
    JSON.stringify({
      event: 'jump_secret_binding_unavailable',
      binding: name,
      reason: 'operation_failed',
    }),
  );
}

type SignerDiagnostics = {
  private_key_present: boolean;
  kid_present: boolean;
  kid?: string | undefined;
  jwks_present: boolean;
};

function logSignerConfig(entry: SignerDiagnostics) {
  // eslint-disable-next-line no-console -- safe signer diagnostics omit tokens and secret material.
  console.warn(JSON.stringify({ event: 'jump_signer_config', ...entry }));
}

function logSignerUnavailable(
  entry: SignerDiagnostics & { reason: string; import_pkcs8_ok?: boolean | undefined },
) {
  // eslint-disable-next-line no-console -- safe signer diagnostics omit tokens and secret material.
  console.warn(JSON.stringify({ event: 'jump_signer_unavailable', ...entry }));
}

function logSignerPairCheckFailed(entry: SignerDiagnostics) {
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

  const quote = normalized[0];
  if ((quote === '"' || quote === "'") && normalized.endsWith(quote)) {
    let unquoted = normalized.slice(1, -1);
    if (quote === '"') {
      try {
        // A double-quoted JSON literal always parses to a string.
        unquoted = JSON.parse(normalized) as string;
      } catch {
        // Not valid JSON: fall back to stripping the quotes.
      }
    }
    normalized = unquoted.trim();
  }

  return normalized.replaceAll('\\r\\n', '\n').replaceAll('\\n', '\n').replaceAll('\r\n', '\n');
}

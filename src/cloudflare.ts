import { importJWK, importPKCS8, jwtVerify, SignJWT, type JWK } from 'jose';
import { registry as umaxicaRegistry } from './config/registry.umaxica';
import { fetchRegistryJwks } from './core/fetch_jwks';
import { createApp, isKnownRoute } from './index';
import { JwksCache } from './core/jwks_cache';
import { localeFromAcceptLanguage, type Locale } from './core/i18n';
import { emitSecurityLog } from './core/security_log';
import { publicErrorResponse } from './core/public_error';
import { STANDALONE_HTML_SECURITY_HEADERS } from './core/security_headers';
import { JoseOutboundSigner, type OutboundSigner } from './core/sign_outbound';
import type { RateLimiter } from './core/rate_limit';
import { isJumpEnvironment } from './core/token_profile';
import { isValidKid } from './core/issuer_jwks';
import {
  JumpError,
  type JumpEnvironment,
  type JumpErrorCode,
  type OutboundJumpClaim,
} from './core/types';
import { validateServiceOrigin, hasMalformedRtQuery } from './core/normalize_url';
import { raceAbort, throwIfAborted } from './core/deadline';
import { parseJumpJwks, type JumpJwks } from './core/jump_jwks';

type SecretBinding = string | { get(): Promise<string> };
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
  UMAXICA_JUMP_ENVIRONMENT?: string;
  UMAXICA_JUMP_PUBLIC_JWKS?: SecretBinding;
  'UMAXICA-APPS-EDGE-JUMP-VERSION'?: VersionMetadata;
};

/**
 * One app, and with it one issuer `JwksCache`, per isolate.
 *
 * Not keyed on `env`: Workers may reuse module state across requests but does
 * not promise the same `env` reference, so an `env`-keyed app could refetch
 * every issuer keyset on every request. The app does not retain binding
 * instances from `env`: the rate limiter is resolved from each request's env,
 * and signing material is read from that env (see `keyMaterialCaches`). The
 * registry is static, and issuer keysets are public and fetched from pinned
 * URLs.
 *
 * A single entry bounds it. It is an optimization only: a cold isolate, or a
 * request whose origin or Worker version differs, builds a fresh app and
 * reaches the same decision at the cost of a JWKS fetch.
 */
let cachedApp:
  | {
      serviceOrigin: string;
      environment: JumpEnvironment;
      revision: string | null;
      app: ReturnType<typeof createApp>;
    }
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
    let appOwnsRejectionLog = false;
    let response: Response;
    try {
      response = await raceAbort(
        dispatch(request, env, executionContext, requestId, controller.signal, () => {
          appOwnsRejectionLog = true;
        }),
        controller.signal,
      );
    } catch (error) {
      const code = error instanceof JumpError ? error.code : 'internal_error';
      const reason = error instanceof JumpError ? (error.rejectionReason ?? code) : code;
      response = publicErrorResponse(code, locale);
      if (!appOwnsRejectionLog) logRejectedRequest(requestId, reason, response.status);
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
  return localeFromAcceptLanguage(request.headers.get('Accept-Language'));
}

class CloudflareRejectionError extends JumpError {
  constructor(code: JumpErrorCode, reason: string) {
    super(code, undefined, reason);
  }
}

function logRejectedRequest(requestId: string, reason: string, status: number) {
  emitSecurityLog({
    level: 'warn',
    event: 'jump_reject',
    result: 'rejected',
    reason,
    request_id: requestId,
    status,
  });
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
  appOwnsRejectionLog: () => void,
) {
  let serviceOrigin: string;
  try {
    serviceOrigin = validateServiceOrigin(env.UMAXICA_JUMP_ORIGIN);
  } catch {
    throw new CloudflareRejectionError('signer_unavailable', 'invalid_service_origin');
  }
  const environment = env.UMAXICA_JUMP_ENVIRONMENT;
  if (!isJumpEnvironment(environment)) {
    throw new CloudflareRejectionError('signer_unavailable', 'invalid_environment');
  }
  for (const issuer of Object.values(umaxicaRegistry)) {
    if (issuer.iss === serviceOrigin || issuer.allowed_dst_internal.includes(serviceOrigin)) {
      throw new CloudflareRejectionError('signer_unavailable', 'invalid_service_origin');
    }
  }
  const url = new URL(request.url);
  if (url.origin !== serviceOrigin) {
    throw new CloudflareRejectionError('malformed', 'request_origin_mismatch');
  }
  if (request.method !== 'GET' && request.method !== 'HEAD' && isKnownRoute(url.pathname)) {
    const response = publicErrorResponse('method_not_allowed', requestLocale(request));
    response.headers.set('Allow', 'GET, HEAD');
    logRejectedRequest(requestId, 'method_not_allowed', response.status);
    return response;
  }
  if (hasMalformedRtQuery(url)) throw new JumpError('malformed');
  if (isStaticAsset(url)) return raceAbort(serveStaticAsset(request, env, requestId), signal);
  const app = getApp(env, serviceOrigin, environment);
  appOwnsRejectionLog();
  return app.fetch(request, env, ctx, { requestId, signal });
}

function getApp(env: CloudflareEnv, serviceOrigin: string, environment: JumpEnvironment) {
  const revision = cloudflareRevision(env);
  if (
    cachedApp?.serviceOrigin === serviceOrigin &&
    cachedApp.environment === environment &&
    cachedApp.revision === revision
  )
    return cachedApp.app;
  const app = createApp({
    registry: umaxicaRegistry,
    jwksCache: new JwksCache(fetchRegistryJwks),
    config: { serviceOrigin, environment },
    runtime: { edge: 'cloudflare', production: true },
    // Resolve the isolate binding from this request's env while retaining the
    // app and issuer JWKS cache across requests.
    rateLimiter: (requestEnv) => (requestEnv as CloudflareEnv).JUMP_RATE_LIMITER ?? null,
    signerForRequest: (requestEnv, signal, requestId) => {
      const cfEnv = requestEnv as CloudflareEnv;
      return new LazyCloudflareSigner(cfEnv, keyMaterialCacheFor(cfEnv), signal, requestId);
    },
    // Publish only the same keyset that has passed the private/public pair check
    // used by outbound signing. This also avoids reparsing the configured JWKS on
    // every discovery request.
    jumpJwksForRequest: (requestEnv, signal, requestId) => {
      const cfEnv = requestEnv as CloudflareEnv;
      return keyMaterialCacheFor(cfEnv).getJwks(cfEnv, signal, requestId);
    },
  });
  cachedApp = { serviceOrigin, environment, revision, app };
  return app;
}

function cloudflareRevision(env: CloudflareEnv) {
  const metadata = env['UMAXICA-APPS-EDGE-JUMP-VERSION'] ?? env.CF_VERSION_METADATA;
  return metadata?.id ?? metadata?.tag ?? null;
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
    private readonly requestId: string,
  ) {}

  async sign(claim: OutboundJumpClaim, typ: string) {
    throwIfAborted(this.signal);
    const signer = await this.cache.getSigner(this.env, this.signal, this.requestId);
    throwIfAborted(this.signal);
    return raceAbort(signer.sign(claim, typ), this.signal);
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

  async getSigner(env: CloudflareEnv, signal: AbortSignal, requestId: string) {
    return (await this.get(env, signal, requestId)).signer;
  }

  async getJwks(env: CloudflareEnv, signal: AbortSignal, requestId: string) {
    return (await this.get(env, signal, requestId)).jwks;
  }

  private async get(env: CloudflareEnv, signal: AbortSignal, requestId: string) {
    throwIfAborted(signal);
    const configuredKid = await readPrivateKeyKid(env, signal, requestId);
    if (!configuredKid?.trim()) {
      throw new CloudflareRejectionError('signer_unavailable', 'missing_active_kid');
    }
    if (!isValidKid(configuredKid)) {
      throw new CloudflareRejectionError('signer_unavailable', 'invalid_active_kid');
    }
    const kid = configuredKid.trim();
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
    const loading = loadKeyMaterial(env, kid, signal, this.ttlMs, requestId);
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
  requestId: string,
): Promise<KeyMaterial> {
  const [pem, jwks] = await Promise.all([
    readPrivateKeyPem(env, signal, requestId),
    readConfiguredJumpJwks(env, signal, requestId),
  ]);
  const context = {
    private_key_present: Boolean(pem),
    kid_present: true,
    kid,
    jwks_present: Boolean(jwks),
  };
  logSignerConfig(context, requestId);
  if (!pem) {
    logSignerUnavailable({ ...context, reason: 'missing_private_key' }, requestId);
    throw new JumpError('signer_unavailable', 'outbound signer not configured');
  }

  if (!jwks) {
    logSignerUnavailable({ ...context, reason: 'missing_public_jwks' }, requestId);
    throw new JumpError('signer_unavailable');
  }
  let privateKey: Parameters<SignJWT['sign']>[0];
  try {
    privateKey = await raceAbort(importPKCS8(pem, 'PS256', { extractable: false }), signal);
    // Every public key must import; only the active one is pair checked.
    await raceAbort(Promise.all(jwks.keys.map((key) => importJWK(key, 'PS256'))), signal);
  } catch {
    throwIfAborted(signal);
    logSignerUnavailable({ ...context, reason: 'key_import_failed' }, requestId);
    throw new JumpError('signer_unavailable');
  }
  const publicJwk = jwks.keys.find((key) => key.kid === kid);
  if (!publicJwk) {
    logSignerUnavailable({ ...context, reason: 'kid_not_in_public_jwks' }, requestId);
    throw new JumpError('signer_unavailable', 'outbound signer public key mismatch');
  }

  try {
    await raceAbort(assertPrivateKeyMatchesPublicJwk(privateKey, publicJwk, kid), signal);
  } catch {
    logSignerPairCheckFailed(context, requestId);
    logSignerUnavailable(
      { ...context, import_pkcs8_ok: true, reason: 'key_pair_mismatch' },
      requestId,
    );
    throw new JumpError('signer_unavailable', 'outbound signer public key mismatch');
  }

  logSignerConfigured(kid, requestId);
  return {
    signer: new JoseOutboundSigner(privateKey, kid),
    jwks,
    expiresAt: Date.now() + ttlMs,
  };
}

async function readPrivateKeyPem(env: CloudflareEnv, signal: AbortSignal, requestId: string) {
  const value = await readBinding(
    env.UMAXICA_JUMP_PRIVATE_KEY_PEM,
    'private_key_pem',
    signal,
    requestId,
  );
  return normalizePem(value);
}

async function readPrivateKeyKid(env: CloudflareEnv, signal: AbortSignal, requestId: string) {
  return readBinding(env.UMAXICA_JUMP_PRIVATE_KEY_KID, 'private_key_kid', signal, requestId);
}

async function readConfiguredJumpJwks(env: CloudflareEnv, signal: AbortSignal, requestId: string) {
  const value = await readBinding(env.UMAXICA_JUMP_PUBLIC_JWKS, 'public_jwks', signal, requestId);
  if (!value) return undefined;
  try {
    return parseJumpJwks(value);
  } catch {
    // A malformed runtime variable is service configuration failure, not a bad
    // client request. Keep the public response at 503 and log only the class.
    throw new CloudflareRejectionError('signer_unavailable', 'invalid_public_jwks');
  }
}

async function readBinding(
  binding: SecretBinding | undefined,
  name: string,
  signal: AbortSignal,
  requestId: string,
) {
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
    logSecretUnavailable(name, requestId);
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
    .setProtectedHeader({ typ: 'jump-key-pair-probe', alg: 'PS256', kid })
    .sign(privateKey);
  await jwtVerify(token, await importJWK(publicJwk, 'PS256'), {
    algorithms: ['PS256'],
    typ: 'jump-key-pair-probe',
    currentDate: new Date(now * 1000),
  });
}

function logSecretUnavailable(name: string, requestId: string) {
  emitSecurityLog({
    level: 'warn',
    event: 'jump_secret_binding_unavailable',
    binding: name,
    reason: 'operation_failed',
    request_id: requestId,
    result: 'rejected',
    status: 503,
  });
}

type SignerDiagnostics = {
  private_key_present: boolean;
  kid_present: boolean;
  kid?: string | undefined;
  jwks_present: boolean;
};

function logSignerConfig(entry: SignerDiagnostics, requestId: string) {
  emitSecurityLog({ level: 'info', event: 'jump_signer_config', ...entry, request_id: requestId });
}

function logSignerUnavailable(
  entry: SignerDiagnostics & { reason: string; import_pkcs8_ok?: boolean | undefined },
  requestId: string,
) {
  emitSecurityLog({
    level: 'warn',
    event: 'jump_signer_unavailable',
    ...entry,
    request_id: requestId,
    result: 'rejected',
    status: 503,
  });
}

function logSignerPairCheckFailed(entry: SignerDiagnostics, requestId: string) {
  emitSecurityLog({
    level: 'warn',
    event: 'jump_signer_pair_check_failed',
    ...entry,
    request_id: requestId,
    result: 'rejected',
    status: 503,
    reason: 'operation_failed',
  });
}

function logSignerConfigured(kid: string, requestId: string) {
  emitSecurityLog({
    level: 'info',
    event: 'jump_signer_configured',
    result: 'accepted',
    kid,
    request_id: requestId,
  });
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

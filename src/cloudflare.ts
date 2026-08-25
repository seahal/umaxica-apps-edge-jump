import { exportJWK, importJWK, importPKCS8, jwtVerify, SignJWT, type JWK } from 'jose';
import { registry as umaxicaRegistry } from './config/registry.umaxica';
import { fetchRegistryJwks } from './core/fetch_jwks';
import { createApp } from './index';
import { JwksCache } from './core/jwks_cache';
import { asLocale } from './core/i18n';
import { renderRateLimitPage } from './core/page';
import { NoopReplayCache } from './core/replay_cache';
import { STANDALONE_HTML_SECURITY_HEADERS } from './core/security_headers';
import { JoseOutboundSigner, type OutboundSigner } from './core/sign_outbound';
import { JumpError, PRODUCTION_SERVICE_ORIGIN, type OutboundJumpClaim } from './core/types';
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
  INFO_RATE_LIMITER?: RateLimiter;
  JUMP_RATE_LIMITER?: RateLimiter;
  JWKS_RATE_LIMITER?: RateLimiter;
  JUMP_PRIVATE_KEY_PEM?: SecretBinding;
  JUMP_PRIVATE_KEY_KID?: SecretBinding;
  UMAXICA_JUMP_PRIVATE_KEY_PEM?: SecretBinding;
  UMAXICA_JUMP_PRIVATE_KEY_KID?: SecretBinding;
  UMAXICA_JUMP_ORIGIN?: string;
  UMAXICA_JUMP_PUBLIC_JWKS?: SecretBinding;
  UMAXICA_JUMP_PUBLIC_KEYSET?: SecretBinding;
  'UMAXICA-APPS-EDGE-JUMP-VERSION'?: VersionMetadata;
};

/**
 * Module scope, so the Hono app, the JWKS cache, and the imported signing key
 * survive across every request served by the same isolate.
 *
 * Deliberately NOT keyed on the `env` object: the Workers runtime makes no
 * guarantee that successive invocations receive the same `env` reference, and
 * keying on identity would silently rebuild the app — and drop both caches —
 * on every request. The key is instead every part of `env` that changes how the
 * app is built: the service origin and the deployment revision. Both are fixed
 * for a given deployment, so in a deployed Worker this map holds exactly one
 * entry for the isolate's lifetime.
 */
const apps = new Map<string, ReturnType<typeof createApp>>();

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
const keyMaterialCaches = new WeakMap<object, CloudflareKeyMaterialCache>();

/**
 * Drops the module-scope caches, so a caller can start from a cold isolate.
 * Exists for tests — each case needs its own JWKS keyset, which is exactly the
 * state a warm isolate is supposed to keep. Production never calls this.
 */
export function resetIsolateCachesForTest() {
  apps.clear();
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
    const url = new URL(request.url);
    if (isStaticAsset(url)) return serveStaticAsset(request, env, requestId);
    const rateLimit = await checkRateLimit(request, env, requestId);
    if (rateLimit) return rateLimit;
    const app = getApp(env);
    return app.fetch(request, env, executionContext);
  },
};

function getApp(env: CloudflareEnv) {
  const serviceOrigin = env.UMAXICA_JUMP_ORIGIN || PRODUCTION_SERVICE_ORIGIN;
  const revision = cloudflareRevision(env);
  const appKey = `${serviceOrigin}\n${revision ?? ''}`;
  const existing = apps.get(appKey);
  if (existing) return existing;
  const app = createApp({
    registry: umaxicaRegistry,
    jwksCache: new JwksCache(fetchRegistryJwks),
    config: { serviceOrigin },
    runtime: {
      edge: 'cloudflare',
      version: revision,
      production: true,
    },
    replayCache: new NoopReplayCache(),
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
  apps.set(appKey, app);
  return app;
}

function cloudflareRevision(env: CloudflareEnv) {
  const metadata = env['UMAXICA-APPS-EDGE-JUMP-VERSION'] ?? env.CF_VERSION_METADATA;
  return metadata?.id ?? metadata?.tag ?? null;
}

const JWKS_PATH = '/.well-known/jwks.json';

/**
 * The keyset is consumed in exactly two places: signing an outbound redirect,
 * and publishing the public keyset. Keep this in sync with the `signer` and
 * `jumpJwks` options passed to createApp below.
 */
async function checkRateLimit(request: Request, env: CloudflareEnv, requestId: string) {
  const { pathname } = new URL(request.url);
  const route = rateLimitRoute(pathname);
  const rateLimiter =
    route === 'jump'
      ? env.JUMP_RATE_LIMITER
      : route === 'jwks'
        ? env.JWKS_RATE_LIMITER
        : env.INFO_RATE_LIMITER;
  if (!rateLimiter) return null;
  const clientIp = request.headers.get('CF-Connecting-IP');
  if (!clientIp) {
    // Cloudflare sets this on all edge-routed traffic, so this should be
    // unreachable in production. Fail open rather than closed — the binding is
    // a coarse abuse control, not an authorization gate, and a redirect service
    // should not go dark over a missing header — but say so, because silently
    // unlimited traffic is exactly what nobody notices. The header value itself
    // is an IP and is never logged.
    // eslint-disable-next-line no-console -- route class only; no IP, token, or URL.
    console.warn(
      JSON.stringify({ event: 'jump_rate_limit_skipped', reason: 'client_ip_unavailable', route }),
    );
    return null;
  }
  const { success } = await rateLimiter.limit({ key: clientIp });
  if (success) return null;
  // Rate limiting runs before the Hono app, so languageDetector is unavailable here.
  const locale = asLocale(
    request.headers.get('Accept-Language')?.trim().toLowerCase().startsWith('en') ? 'en' : 'ja',
  );
  // This answers before the Hono app exists, so jumpSecureHeaders/responseHygiene
  // cannot run: apply the same protections explicitly.
  return new Response(renderRateLimitPage(locale), {
    status: 429,
    headers: {
      ...STANDALONE_HTML_SECURITY_HEADERS,
      'Content-Language': locale,
      'Content-Type': 'text/html; charset=utf-8',
      'X-Request-ID': requestId,
    },
  });
}

function rateLimitRoute(pathname: string): 'jump' | 'jwks' | 'info' {
  if (pathname === '/') return 'jump';
  if (pathname === JWKS_PATH) return 'jwks';
  return 'info';
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
    if (!kid) throw new JumpError('signer_unavailable', 'outbound signer kid not configured');
    if (/\b(?:dev|development|staging|test)\b/i.test(kid)) {
      throw new JumpError('signer_unavailable', 'non-production signer kid rejected');
    }
    const key = `${cloudflareRevision(env) ?? 'unversioned'}:${kid}`;
    const current = this.entries.get(key);
    if (current) {
      const material = await raceAbort(current, signal);
      if (material.expiresAt > Date.now()) return material;
      this.entries.delete(key);
    }
    for (const [entryKey, entry] of this.entries) {
      void entry.then((material) => {
        if (material.expiresAt <= Date.now()) this.entries.delete(entryKey);
      });
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

  let privateKey: Parameters<SignJWT['sign']>[0];
  try {
    privateKey = await raceAbort(importPKCS8(pem, 'ES384', { extractable: true }), signal);
  } catch (error) {
    logSignerImportFailed(context, error);
    logSignerUnavailable({ ...context, import_pkcs8_ok: false, reason: 'pkcs8_import_failed' });
    throw new JumpError('signer_unavailable', 'outbound signer not configured');
  }

  let jwks = configuredJwks;
  if (!jwks) {
    try {
      const privateJwk = await raceAbort(exportJWK(privateKey), signal);
      const publicJwk = stripPrivateJwkFields({
        ...privateJwk,
        kid,
        alg: 'ES384',
        use: 'sig',
      });
      jwks = parseJumpJwks(JSON.stringify({ keys: [publicJwk] }));
      logDerivedJwks({ kid, pair_check_ok: true });
    } catch (error) {
      logDerivedJwksFailed({ kid, reason: error instanceof Error ? error.name : 'unknown' });
      throw new JumpError('signer_unavailable', 'outbound public jwks unavailable');
    }
  }

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
  const value = await readBinding(
    env.UMAXICA_JUMP_PRIVATE_KEY_PEM ?? env.JUMP_PRIVATE_KEY_PEM,
    'private_key_pem',
    signal,
  );
  return normalizePem(value);
}

async function readPrivateKeyKid(env: CloudflareEnv, signal?: AbortSignal) {
  const value = await readBinding(
    env.UMAXICA_JUMP_PRIVATE_KEY_KID ?? env.JUMP_PRIVATE_KEY_KID,
    'private_key_kid',
    signal,
  );
  return value?.trim() || null;
}

async function readConfiguredJumpJwks(env: CloudflareEnv, signal?: AbortSignal) {
  const value = await readBinding(
    env.UMAXICA_JUMP_PUBLIC_JWKS ?? env.UMAXICA_JUMP_PUBLIC_KEYSET,
    'public_jwks',
    signal,
  );
  return value ? parseJumpJwks(value) : undefined;
}

async function readJumpJwks(
  env: CloudflareEnv,
  cache: CloudflareKeyMaterialCache,
  signal: AbortSignal,
) {
  const configured = await readConfiguredJumpJwks(env, signal);
  if (configured) return configured;
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

function stripPrivateJwkFields(jwk: JWK): JWK {
  const publicJwk = { ...jwk } as Record<string, unknown>;
  for (const field of ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k']) {
    delete publicJwk[field];
  }
  return publicJwk;
}

function logSecretUnavailable(name: string, error: unknown) {
  // eslint-disable-next-line no-console -- binding name only; never the secret value.
  console.warn(
    JSON.stringify({
      event: 'jump_secret_binding_unavailable',
      binding: name,
      reason: error instanceof Error ? error.message : 'unknown',
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

function logSignerImportFailed(
  entry: {
    private_key_present: boolean;
    kid_present: boolean;
    kid?: string | undefined;
    jwks_present: boolean;
  },
  error: unknown,
) {
  // eslint-disable-next-line no-console -- safe signer diagnostics omit tokens and secret material.
  console.error(
    JSON.stringify({
      event: 'jump_signer_import_failed',
      ...entry,
      import_pkcs8_ok: false,
      reason: error instanceof Error ? error.name : 'unknown',
    }),
  );
}

function logSignerPairCheckFailed(
  entry: {
    private_key_present: boolean;
    kid_present: boolean;
    kid?: string | undefined;
    jwks_present: boolean;
  },
  error: unknown,
) {
  // eslint-disable-next-line no-console -- safe signer diagnostics omit tokens and secret material.
  console.error(
    JSON.stringify({
      event: 'jump_signer_pair_check_failed',
      ...entry,
      import_pkcs8_ok: true,
      reason: error instanceof Error ? error.name : 'unknown',
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

function logDerivedJwks(entry: { kid: string; pair_check_ok: boolean }) {
  // eslint-disable-next-line no-console -- safe signer diagnostics omit tokens and secret material.
  console.info(
    JSON.stringify({
      event: 'jump_jwks_derived_from_private_key',
      kid: entry.kid,
      jwks_derived_from_private_key: true,
      pair_check_ok: entry.pair_check_ok,
    }),
  );
}

function logDerivedJwksFailed(entry: { kid: string; reason: string }) {
  // eslint-disable-next-line no-console -- safe signer diagnostics omit tokens and secret material.
  console.warn(
    JSON.stringify({
      event: 'jump_jwks_derive_failed',
      kid: entry.kid,
      jwks_derived_from_private_key: false,
      reason: entry.reason,
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

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new JumpError('deadline_exceeded', 'request deadline exceeded');
}

async function raceAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  throwIfAborted(signal);
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new JumpError('deadline_exceeded', 'request deadline exceeded'));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

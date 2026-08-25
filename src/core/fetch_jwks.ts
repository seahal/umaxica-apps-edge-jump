import type { JWK } from 'jose';
import type { FetchJwks } from './jwks_cache';
import { JumpError } from './types';

const MAX_BYTES = 64 * 1024;
const JSON_CONTENT_TYPE = /^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/i;

export const fetchRegistryJwks: FetchJwks = async (issuer, signal) => {
  assertJwksUrl(issuer);
  try {
    const response = await fetch(issuer.jwks_uri, {
      headers: { Accept: 'application/json' },
      redirect: 'error',
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) {
      if (response.status >= 500 || response.status === 429) {
        throw new JumpError('jwks_unavailable', 'issuer jwks temporarily unavailable');
      }
      throw new JumpError('jwks_bad_gateway', 'issuer jwks response rejected');
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!JSON_CONTENT_TYPE.test(contentType)) {
      throw new JumpError('jwks_bad_gateway', 'issuer jwks content-type rejected');
    }
    const advertisedLength = Number(response.headers.get('content-length') ?? '');
    if (Number.isFinite(advertisedLength) && advertisedLength > MAX_BYTES) {
      throw new JumpError('jwks_bad_gateway', 'issuer jwks response too large');
    }

    const body = await readBodyWithCap(response, MAX_BYTES);
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new JumpError('jwks_bad_gateway', 'issuer jwks json rejected');
    }
    const jwks = parseJwks(parsed);
    if (!jwks) throw new JumpError('jwks_bad_gateway', 'issuer jwks shape rejected');
    return jwks;
  } catch (error) {
    if (error instanceof JumpError) throw error;
    if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      throw new JumpError('deadline_exceeded', 'request deadline exceeded');
    }
    throw new JumpError('jwks_unavailable', 'issuer jwks fetch failed');
  }
};

function assertJwksUrl(issuer: Parameters<FetchJwks>[0]) {
  let url: URL;
  try {
    url = new URL(issuer.jwks_uri);
  } catch {
    throw new JumpError('jwks_bad_gateway', 'issuer jwks url rejected');
  }
  const issuerUrl = new URL(issuer.iss);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.origin !== issuerUrl.origin ||
    url.pathname !== '/.well-known/jwks.json' ||
    url.search ||
    url.hash
  ) {
    throw new JumpError('jwks_bad_gateway', 'issuer jwks url contract rejected');
  }
}

const PRIVATE_JWK_FIELDS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k'] as const;

/** A key the Jump handshake can actually verify with: ES384 over P-384, for signing. */
function isVerificationJwk(jwk: Record<string, unknown>) {
  return (
    jwk.kty === 'EC' &&
    jwk.crv === 'P-384' &&
    jwk.alg === 'ES384' &&
    (jwk.use === undefined || jwk.use === 'sig') &&
    typeof jwk.kid === 'string' &&
    jwk.kid !== '' &&
    typeof jwk.x === 'string' &&
    typeof jwk.y === 'string'
  );
}

/**
 * Validates an issuer keyset beyond "it parsed".
 *
 * Non-conforming keys are dropped rather than failing the whole set, so an
 * issuer publishing an unrelated future key does not take its own redirects
 * down. Two conditions do fail the set outright, because both make the
 * remaining keys untrustworthy rather than merely unusable: private key
 * material in a public keyset, and a duplicate `kid` — `getKey` resolves a kid
 * with `find`, so a duplicate lets whichever entry is listed first decide which
 * key verifies a token.
 *
 * Returns the filtered keyset, or null if the set cannot be trusted.
 */
function parseJwks(value: unknown): { keys: JWK[] } | null {
  if (!value || typeof value !== 'object') return null;
  const keys = (value as { keys?: unknown }).keys;
  if (!Array.isArray(keys)) return null;

  const usable: JWK[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    if (!key || typeof key !== 'object') return null;
    const jwk = key as Record<string, unknown>;
    if (PRIVATE_JWK_FIELDS.some((field) => jwk[field] !== undefined)) return null;
    if (!isVerificationJwk(jwk)) continue;
    const kid = jwk.kid as string;
    if (seen.has(kid)) return null;
    seen.add(kid);
    usable.push(jwk as JWK);
  }
  return usable.length > 0 ? { keys: usable } : null;
}

async function readBodyWithCap(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes)
      throw new JumpError('jwks_bad_gateway', 'issuer jwks response too large');
    return text;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes)
        throw new JumpError('jwks_bad_gateway', 'issuer jwks response too large');
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

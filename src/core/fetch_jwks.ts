import { raceAbort, throwIfAborted } from './deadline';
import type { FetchJwks } from './jwks_cache';
import { JumpError } from './types';

export const MAX_JWKS_BYTES = 64 * 1024;
/**
 * RFC 7517 JWK Set media type, or plain JSON as Rails serves it, with at most a
 * UTF-8 charset parameter. Other types, other parameters and an absent header
 * are rejected.
 */
const JWKS_CONTENT_TYPE =
  /^application\/(?:jwk-set\+json|json)[ \t]*(?:;[ \t]*charset=(?:"utf-8"|utf-8)[ \t]*)?$/i;

export const fetchRegistryJwks: FetchJwks = async (issuer, signal) => {
  const started = performance.now();
  let stage = 'url_validation';
  let upstreamStatus: number | undefined;
  try {
    assertJwksUrl(issuer);
    stage = 'fetch';
    const response = await fetch(issuer.jwks_uri, {
      headers: { Accept: 'application/jwk-set+json, application/json' },
      // Bypass any cache between the Worker and the issuer, so a forced refresh
      // after a rotation is not answered with the previous keyset.
      cache: 'no-store',
      // Cloudflare Workers implements only `follow` and `manual`. Manual keeps
      // registry-pinned JWKS requests from following a redirect; the non-2xx
      // check below rejects the redirect response itself.
      redirect: 'manual',
      ...(signal ? { signal } : {}),
    });
    upstreamStatus = response.status;
    if (response.status !== 200) {
      stage = 'http_status';
      if (response.status >= 500 || response.status === 429) {
        throw new JumpError('jwks_unavailable', 'issuer jwks temporarily unavailable');
      }
      throw new JumpError('jwks_bad_gateway', 'issuer jwks response rejected');
    }

    const contentType = response.headers.get('content-type') ?? '';
    stage = 'content_type';
    if (!JWKS_CONTENT_TYPE.test(contentType)) {
      throw new JumpError('jwks_bad_gateway', 'issuer jwks content-type rejected');
    }
    const advertisedLength = Number(response.headers.get('content-length') ?? '');
    if (Number.isFinite(advertisedLength) && advertisedLength > MAX_JWKS_BYTES) {
      throw new JumpError('jwks_bad_gateway', 'issuer jwks response too large');
    }

    stage = 'body';
    const body = await readBodyWithCap(response, MAX_JWKS_BYTES, signal);
    try {
      stage = 'json';
      return JSON.parse(body) as unknown;
    } catch {
      throw new JumpError('jwks_bad_gateway', 'issuer jwks json rejected');
    }
  } catch (error) {
    if (error instanceof JumpError) {
      logJwksFetchFailure(issuer.iss, error.code, stage, started, upstreamStatus, error);
      throw error;
    }
    if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      logJwksFetchFailure(issuer.iss, 'deadline_exceeded', stage, started, upstreamStatus, error);
      throw new JumpError('deadline_exceeded', 'request deadline exceeded');
    }
    logJwksFetchFailure(issuer.iss, 'jwks_unavailable', stage, started, upstreamStatus, error);
    throw new JumpError('jwks_unavailable', 'issuer jwks fetch failed');
  }
};

function logJwksFetchFailure(
  issuer: string,
  reason: string,
  stage: string,
  started: number,
  upstreamStatus?: number,
  error?: unknown,
) {
  // eslint-disable-next-line no-console -- only registry issuer and coarse failure metadata.
  console.error(
    JSON.stringify({
      event: 'jump_jwks_fetch_failed',
      result: 'failed',
      iss: issuer,
      reason,
      stage,
      ...(upstreamStatus === undefined ? {} : { upstream_status: upstreamStatus }),
      ...safeErrorMetadata(error),
      latency_ms: Math.round(performance.now() - started),
    }),
  );
}

function safeErrorMetadata(error: unknown) {
  const errorName = safeDiagnosticValue(error instanceof Error ? error.name : undefined);
  const cause = error instanceof Error ? error.cause : undefined;
  const causeName = safeDiagnosticValue(cause instanceof Error ? cause.name : undefined);
  const causeCode = safeDiagnosticValue(
    cause && typeof cause === 'object' && 'code' in cause
      ? (cause as { code?: unknown }).code
      : undefined,
  );
  return {
    ...(errorName === undefined ? {} : { error_name: errorName }),
    ...(causeName === undefined ? {} : { cause_name: causeName }),
    ...(causeCode === undefined ? {} : { cause_code: causeCode }),
  };
}

function safeDiagnosticValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,64}$/.test(value)) return value;
  return undefined;
}

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

async function readBodyWithCap(
  response: Response,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const cancel = () => {
    /* v8 ignore next -- cancel rejection is only swallowed */
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener('abort', cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      throwIfAborted(signal);
      const { value, done } = await raceAbort(reader.read(), signal);
      throwIfAborted(signal);
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        cancel();
        throw new JumpError('jwks_bad_gateway', 'issuer jwks response too large');
      }
      chunks.push(value);
    }
  } catch (error) {
    cancel();
    throw error;
  } finally {
    signal?.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(merged);
  } catch {
    throw new JumpError('jwks_bad_gateway', 'issuer jwks encoding rejected');
  }
}

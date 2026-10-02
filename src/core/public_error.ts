import { renderSplashPage, type SplashKind } from './page';
import type { Locale } from './i18n';

type PublicErrorCode =
  | 'invalid_request'
  | 'service_unavailable'
  | 'temporarily_unavailable'
  | 'deadline_exceeded'
  | 'internal_error'
  | 'method_not_allowed'
  | 'rate_limited';

export type PublicErrorContract = {
  code: PublicErrorCode;
  status: 400 | 405 | 429 | 500 | 503 | 504;
};

/**
 * Client-denied rejections of an untrusted `rt`.
 *
 * `jwks_bad_gateway` stays here: the issuer answered, but the document cannot
 * be used to verify. That is not a retry signal. Fetch timeouts, network
 * errors, and upstream 5xx/429 use `jwks_unavailable` instead so callers can
 * retry without learning fetch details.
 */
const CLIENT_DENIED = new Set<string>([
  'malformed',
  'invalid_header',
  'invalid_signature',
  'invalid_claim',
  'expired',
  'invalid_dst',
  'invalid_url',
  'jwks_bad_gateway',
]);

/** Jump's own missing configuration — independent of any inbound token. */
const UNAVAILABLE = new Set<string>(['signer_unavailable']);

/** Registered-issuer JWKS dependency outage. Coarse: no issuer, URL, or cause. */
const TEMPORARY = new Set<string>(['jwks_unavailable']);

export function publicJumpError(internal: string): PublicErrorContract {
  if (internal === 'method_not_allowed') return { code: 'method_not_allowed', status: 405 };
  if (internal === 'rate_limited') return { code: 'rate_limited', status: 429 };
  if (internal === 'deadline_exceeded') return { code: 'deadline_exceeded', status: 504 };
  if (internal === 'internal_error') return { code: 'internal_error', status: 500 };
  if (TEMPORARY.has(internal)) return { code: 'temporarily_unavailable', status: 503 };
  if (UNAVAILABLE.has(internal)) return { code: 'service_unavailable', status: 503 };
  if (CLIENT_DENIED.has(internal)) return { code: 'invalid_request', status: 400 };
  return { code: 'internal_error', status: 500 };
}

export function publicErrorHeaders(
  internal: string,
  locale: Locale = 'ja',
): Record<string, string> {
  const pub = publicJumpError(internal);
  return {
    'Content-Language': locale,
    'Content-Type': 'text/html; charset=utf-8',
    'X-Jump-Error': pub.code,
  };
}

export function publicErrorResponse(internal: string, locale: Locale = 'ja'): Response {
  const pub = publicJumpError(internal);
  return new Response(renderSplashPage(splashKind(pub.code), locale), {
    status: pub.status,
    headers: publicErrorHeaders(internal, locale),
  });
}

function splashKind(code: PublicErrorCode): SplashKind {
  if (code === 'rate_limited') return 'rate';
  if (
    code === 'service_unavailable' ||
    code === 'temporarily_unavailable' ||
    code === 'deadline_exceeded' ||
    code === 'internal_error'
  ) {
    return 'unavailable';
  }
  return 'invalid';
}

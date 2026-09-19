import { renderError } from './render_error';
import type { Locale } from './i18n';

export type PublicErrorCode =
  | 'invalid_request'
  | 'service_unavailable'
  | 'deadline_exceeded'
  | 'internal_error'
  | 'method_not_allowed'
  | 'rate_limited';

export type PublicErrorContract = {
  code: PublicErrorCode;
  status: 400 | 405 | 429 | 500 | 503 | 504;
};

/**
 * One public class for every rejection an untrusted `rt` can provoke.
 *
 * The issuer JWKS failures belong here rather than with the 503s below: they
 * are only reachable for an `iss` that is in the registry, so keeping them at
 * `service_unavailable` let an unauthenticated caller tell a registered issuer
 * from an unregistered one whenever that issuer's JWKS endpoint was down. The
 * real code is still carried by the structured security log, which is where
 * operators read it.
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
  'jwks_unavailable',
]);

/** Jump's own missing configuration — independent of any inbound token. */
const UNAVAILABLE = new Set<string>(['signer_unavailable']);

export function publicJumpError(internal: string): PublicErrorContract {
  if (internal === 'method_not_allowed') return { code: 'method_not_allowed', status: 405 };
  if (internal === 'rate_limited') return { code: 'rate_limited', status: 429 };
  if (internal === 'deadline_exceeded') return { code: 'deadline_exceeded', status: 504 };
  if (internal === 'internal_error') return { code: 'internal_error', status: 500 };
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
  return new Response(renderError(locale), {
    status: pub.status,
    headers: publicErrorHeaders(internal, locale),
  });
}

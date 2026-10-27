import { errors, jwtVerify, type JWTPayload } from 'jose';
import { throwIfAborted } from './deadline';
import { hasControlCharacter, isValidKid } from './issuer_jwks';
import { getIssuer } from './registry';
import type { JwksCache } from './jwks_cache';
import { JumpError, type InboundJumpClaim, type IssuerRegistry } from './types';

/** The only signature algorithm; never taken from the token. */
const ALG = 'ES384';
/**
 * Compact serialization bound, checked before any decoding. The largest token
 * the claim bounds below allow (url 2048, jti 128, kid 128 characters) is about
 * 3.8 KiB, so this leaves headroom without letting arbitrary input reach a parser.
 */
export const MAX_TOKEN_LENGTH = 4096;
const ES384_SIGNATURE_LENGTH = 128;
const MAX_JTI_LENGTH = 128;
const MAX_URL_LENGTH = 2048;
export const CLOCK_SKEW_SECONDS = 5;
export const MAX_INBOUND_TTL_SECONDS = 30;
/** NumericDate upper bound (2100-01-01T00:00:00Z); larger values are not plausible issuance times. */
const MAX_NUMERIC_DATE = 4_102_444_800;

/** Every protected header member the profile defines. Anything else is a JOSE directive Jump does not implement. */
const HEADER_MEMBERS = new Set(['alg', 'kid', 'typ']);
/** The closed schema-1 request claim set. */
const CLAIM_MEMBERS = new Set([
  'schema',
  'rpl',
  'iss',
  'aud',
  'sub',
  'iat',
  'nbf',
  'exp',
  'jti',
  'dst',
  'url',
]);

export type VerifyJumpJwtOptions = {
  registry: IssuerRegistry;
  jwksCache: JwksCache;
  now: number;
  serviceOrigin: string;
  /** Exact protected-header `typ` this deployment accepts. */
  typ: string;
  signal?: AbortSignal | undefined;
};

export async function verifyJumpJwt(token: string, options: VerifyJumpJwtOptions) {
  const { registry, jwksCache, now, serviceOrigin, typ, signal } = options;
  throwIfAborted(signal);
  if (token.length > MAX_TOKEN_LENGTH) throw new JumpError('malformed', 'jwt too large');
  const parts = token.split('.');
  if (parts.length !== 3) throw new JumpError('malformed', 'not compact jwt');
  for (const part of parts) assertBase64Url(part);
  // ES384 signatures are exactly 96 bytes (r || s), 128 base64url characters.
  if (String(parts[2]).length !== ES384_SIGNATURE_LENGTH)
    throw new JumpError('malformed', 'signature length rejected');

  const header = decodeJsonObject(String(parts[0]), 'invalid_header');
  for (const name of Object.keys(header)) {
    if (!HEADER_MEMBERS.has(name)) throw new JumpError('invalid_header', 'header member rejected');
  }
  if (header.typ !== typ) throw new JumpError('invalid_header', 'typ rejected');
  if (header.alg !== ALG) throw new JumpError('invalid_header', 'alg rejected');
  if (!isValidKid(header.kid)) throw new JumpError('invalid_header', 'kid rejected');
  const kid = header.kid;

  // Unverified payload: used only to select a registered issuer, never to
  // build a network destination or to authorize anything.
  const unsafePayload = decodeJsonObject(String(parts[1]), 'malformed');
  if (unsafePayload.rpl !== 'reuse') throw new JumpError('invalid_claim');
  if (typeof unsafePayload.iss !== 'string') throw new JumpError('invalid_claim', 'iss required');
  const issuer = getIssuer(registry, unsafePayload.iss);
  if (!issuer) throw new JumpError('invalid_claim', 'issuer rejected');

  const verify = async (forceRefresh: boolean) => {
    const key = await jwksCache.getKey(issuer, kid, forceRefresh, signal);
    throwIfAborted(signal);
    const verified = await jwtVerify(token, key, {
      issuer: issuer.iss,
      audience: serviceOrigin,
      algorithms: [ALG],
      typ,
      clockTolerance: CLOCK_SKEW_SECONDS,
      currentDate: new Date(now * 1000),
    });
    return verified.payload;
  };

  let payload: JWTPayload;
  try {
    payload = await verify(false);
  } catch (error) {
    if (error instanceof JumpError) throw error;
    if (!(error instanceof errors.JWSSignatureVerificationFailed)) throw mapJoseVerifyError(error);
    try {
      // A failed signature may mean a rotated key; retry once against a fresh keyset.
      payload = await verify(true);
    } catch (retryError) {
      /* v8 ignore next -- defensive for JWKS cache failures after a signature retry */
      if (retryError instanceof JumpError) throw retryError;
      throw mapJoseVerifyError(retryError);
    }
  }

  const claim = validateClaim(payload, issuer.iss, now, serviceOrigin);
  throwIfAborted(signal);
  return { claim, issuer, kid };
}

function mapJoseVerifyError(error: unknown) {
  if (error instanceof errors.JWTExpired) return new JumpError('expired', 'expired');
  if (error instanceof errors.JWTClaimValidationFailed) {
    return new JumpError('invalid_claim', 'claim validation failed');
  }
  return new JumpError('invalid_signature', 'verify failed');
}

export function assertBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) {
    throw new JumpError('malformed', 'invalid base64url');
  }
}

function decodeJsonObject(
  value: string,
  code: 'malformed' | 'invalid_header',
): Record<string, unknown> {
  let decoded: unknown;
  try {
    const bytes = Uint8Array.from(atob(toBase64(value)), (char) => char.charCodeAt(0));
    decoded = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new JumpError(code, 'json decode failed');
  }
  if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) {
    throw new JumpError(code, 'json object required');
  }
  return decoded as Record<string, unknown>;
}

function toBase64(value: string) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/');
  return padded + '='.repeat((4 - (padded.length % 4)) % 4);
}

function validateClaim(
  payload: JWTPayload,
  iss: string,
  now: number,
  serviceOrigin: string,
): InboundJumpClaim {
  for (const name of Object.keys(payload)) {
    if (!CLAIM_MEMBERS.has(name)) throw new JumpError('invalid_claim', 'unknown claim rejected');
  }
  if (payload.schema !== 1) throw new JumpError('invalid_claim', 'schema rejected');
  /* v8 ignore next -- jose issuer verification enforces this before local shape checks */
  if (payload.iss !== iss) throw new JumpError('invalid_claim', 'iss mismatch');
  // jose accepts audience arrays containing this origin; this contract requires one string.
  if (payload.aud !== serviceOrigin) throw new JumpError('invalid_claim', 'aud rejected');
  if (payload.sub !== 'jump-redirect') throw new JumpError('invalid_claim', 'sub rejected');
  if (!isNumericDate(payload.exp)) throw new JumpError('invalid_claim', 'exp required');
  if (!isNumericDate(payload.nbf)) throw new JumpError('invalid_claim', 'nbf required');
  if (!isNumericDate(payload.iat)) throw new JumpError('invalid_claim', 'iat required');
  /* v8 ignore next -- jose expiration verification enforces this before local shape checks */
  if (payload.exp < now - CLOCK_SKEW_SECONDS) throw new JumpError('expired', 'expired');
  /* v8 ignore next -- jose nbf verification enforces this before local shape checks */
  if (payload.nbf > now + CLOCK_SKEW_SECONDS) throw new JumpError('invalid_claim', 'nbf future');
  if (payload.iat > now + CLOCK_SKEW_SECONDS) throw new JumpError('invalid_claim', 'iat future');
  if (payload.exp <= payload.iat) throw new JumpError('invalid_claim', 'exp must follow iat');
  if (payload.nbf > payload.exp) throw new JumpError('invalid_claim', 'nbf after exp');
  if (payload.exp - payload.iat > MAX_INBOUND_TTL_SECONDS)
    throw new JumpError('invalid_claim', 'ttl exceeded');
  if (
    typeof payload.jti !== 'string' ||
    !/^[\x21-\x7e]+$/.test(payload.jti) ||
    payload.jti.length > MAX_JTI_LENGTH
  )
    throw new JumpError('invalid_claim', 'jti rejected');
  if (payload.dst !== 'internal') throw new JumpError('invalid_dst', 'dst rejected');
  if (
    typeof payload.url !== 'string' ||
    !payload.url ||
    payload.url.length > MAX_URL_LENGTH ||
    hasControlCharacter(payload.url)
  )
    throw new JumpError('invalid_url', 'url rejected');
  /* v8 ignore next -- rpl is checked on the unverified payload before signature verification */
  if (payload.rpl !== 'reuse') throw new JumpError('invalid_claim');
  return payload as InboundJumpClaim;
}

/** Positive integer seconds; fractional, zero, negative and implausibly large values are rejected. */
function isNumericDate(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= MAX_NUMERIC_DATE
  );
}

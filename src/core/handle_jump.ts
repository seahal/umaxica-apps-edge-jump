import { ENTRY_QUERY, normalizeUrl, validateInternalTarget } from './normalize_url';
import { assertDestinationPolicy } from './policy';
import { publicErrorResponse } from './public_error';
import { tokenTypes } from './token_profile';
import { verifyJumpJwt } from './verify_jwt';
import {
  JumpError,
  type JumpConfig,
  type IssuerConfig,
  type IssuerRegistry,
  type OutboundJumpClaim,
  type RuntimeInfo,
} from './types';
import type { JwksCache } from './jwks_cache';
import type { Locale } from './i18n';
import type { OutboundSigner } from './sign_outbound';
import type { NormalizedUrl } from './normalize_url';

export type JumpDeps = {
  registry: IssuerRegistry;
  jwksCache: JwksCache;
  runtime: RuntimeInfo;
  signer: OutboundSigner;
  config: JumpConfig;
  auditLog?: AuditLog;
  locale?: Locale;
  now?: () => number;
  randomJti?: () => string;
  outboundTtl?: number;
  signal?: AbortSignal;
};

const DEFAULT_OUTBOUND_TTL = 30;

export type AuditLog = (entry: JumpAuditLogEntry) => void;

export type JumpAuditLogEntry = {
  level: 'info' | 'warn';
  event: 'jump_accept' | 'jump_reject';
  result: 'accepted' | 'rejected';
  reason?: string;
  iss?: string;
  kid?: string;
  dst?: 'internal';
  dst_origin?: string;
  request_id?: string;
  cf_ray?: string;
  status?: number;
  latency_ms?: number;
};

export async function handleJump(request: Request, deps: JumpDeps): Promise<Response> {
  let audit: Partial<JumpAuditLogEntry> = {};
  try {
    const token = readEntryToken(new URL(request.url));
    const now = deps.now?.() ?? Math.floor(Date.now() / 1000);
    const { claim, issuer, kid } = await verifyJumpJwt(token, {
      registry: deps.registry,
      jwksCache: deps.jwksCache,
      now,
      serviceOrigin: serviceOrigin(deps),
      typ: tokenTypes(deps.config.environment).inbound,
      signal: deps.signal,
    });
    audit = { iss: claim.iss, kid, dst: claim.dst };
    const target = validateInternalTarget(
      normalizeUrl(claim.url, deps.runtime, serviceOrigin(deps)),
    );
    audit.dst_origin = target.origin;
    assertDestinationPolicy(claim, issuer, target);

    const location = await buildInternalLocation(target, issuer, deps, now);
    /* v8 ignore next -- buildInternalLocation already checks after signing */
    if (deps.signal?.aborted) throw new JumpError('deadline_exceeded');
    deps.auditLog?.({ level: 'info', event: 'jump_accept', result: 'accepted', ...audit });
    return new Response(null, {
      status: 302,
      headers: { Location: location },
    });
  } catch (error) {
    const code = error instanceof JumpError ? error.code : 'internal_error';
    deps.auditLog?.({
      level: 'warn',
      event: 'jump_reject',
      result: 'rejected',
      reason: code,
      ...audit,
    });
    return publicErrorResponse(code, deps.locale);
  }
}

/** The entry query is exactly `?rt=<compact JWS>`; see `ENTRY_QUERY`. */
function readEntryToken(url: URL) {
  if (!ENTRY_QUERY.test(url.search)) throw new JumpError('malformed', 'entry query rejected');
  return url.search.slice('?rt='.length);
}

async function buildInternalLocation(
  target: NormalizedUrl,
  issuer: IssuerConfig,
  deps: JumpDeps,
  now: number,
) {
  const ttl = deps.outboundTtl ?? DEFAULT_OUTBOUND_TTL;
  const outbound: OutboundJumpClaim = {
    schema: 1,
    rpl: 'reuse',
    iss: serviceOrigin(deps),
    aud: target.origin,
    sub: 'jump-redirect',
    iat: now,
    nbf: now,
    exp: now + ttl,
    jti: deps.randomJti?.() ?? crypto.randomUUID(),
    src: issuer.iss,
    dst: 'internal',
    url: target.href,
  };
  const token = await deps.signer.sign(outbound, tokenTypes(deps.config.environment).outbound);
  if (deps.signal?.aborted) throw new JumpError('deadline_exceeded');
  if (token.length > 8192) throw new JumpError('invalid_claim');
  const destination = new URL(target.href);
  destination.searchParams.set('rt', token);
  return destination.href;
}

function serviceOrigin(deps: JumpDeps) {
  return deps.config.serviceOrigin;
}

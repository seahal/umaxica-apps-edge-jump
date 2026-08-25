import { normalizeUrl } from './normalize_url';
import { assertDestinationPolicy } from './policy';
import { renderCushion } from './render_cushion';
import { renderError } from './render_error';
import { verifyJumpJwt } from './verify_jwt';
import {
  JumpError,
  PRODUCTION_SERVICE_ORIGIN,
  type JumpConfig,
  type IssuerConfig,
  type IssuerRegistry,
  type OutboundJumpClaim,
  type RuntimeInfo,
} from './types';
import type { JwksCache } from './jwks_cache';
import type { Locale } from './i18n';
import type { ReplayCache } from './replay_cache';
import type { OutboundSigner } from './sign_outbound';
import type { NormalizedUrl } from './normalize_url';

export type JumpDeps = {
  registry: IssuerRegistry;
  jwksCache: JwksCache;
  replayCache: ReplayCache;
  runtime: RuntimeInfo;
  signer: OutboundSigner;
  config?: JumpConfig;
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
  dst?: 'internal' | 'external';
  dst_origin?: string;
  request_id?: string;
  cf_ray?: string;
  status?: number;
  latency_ms?: number;
};

export async function handleJump(request: Request, deps: JumpDeps): Promise<Response> {
  let audit: Partial<JumpAuditLogEntry> = {};
  try {
    const url = new URL(request.url);
    for (const name of url.searchParams.keys()) {
      if (name !== 'rt') throw new JumpError('malformed', 'unknown query parameter rejected');
    }
    const tokens = url.searchParams.getAll('rt');
    if (tokens.length !== 1) throw new JumpError('malformed', 'rt count rejected');
    if (!tokens[0]) throw new JumpError('malformed', 'empty rt rejected');
    const now = deps.now?.() ?? Math.floor(Date.now() / 1000);
    const { claim, issuer } = await verifyJumpJwt(
      String(tokens[0]),
      deps.registry,
      deps.jwksCache,
      deps.replayCache,
      now,
      serviceOrigin(deps),
      deps.signal,
    );
    audit = {
      iss: claim.iss,
      dst: claim.dst,
    };
    const kid = readProtectedKid(String(tokens[0]));
    if (kid) audit.kid = kid;
    const target = normalizeUrl(claim.url, deps.runtime, serviceOrigin(deps));
    audit.dst_origin = target.origin;
    assertDestinationPolicy(claim, issuer, target);

    if (claim.dst === 'external') {
      deps.auditLog?.({ level: 'info', event: 'jump_accept', result: 'accepted', ...audit });
      return new Response(renderCushion(target, deps.locale), {
        status: 200,
        headers: htmlHeaders(deps.locale),
      });
    }

    const location = await buildInternalLocation(target, issuer, deps, now);
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
    return new Response(renderError(deps.locale), {
      status: errorStatus(code),
      headers: {
        ...htmlHeaders(deps.locale),
        'X-Jump-Error': code,
      },
    });
  }
}

function errorStatus(code: string) {
  if (code === 'jwks_bad_gateway') return 502;
  if (code === 'jwks_unavailable' || code === 'signer_unavailable') return 503;
  if (code === 'deadline_exceeded') return 504;
  if (code === 'internal_error') return 500;
  return 400;
}

function htmlHeaders(locale: Locale = 'ja') {
  return {
    'Content-Language': locale,
    'Content-Type': 'text/html; charset=utf-8',
  };
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
  const token = await deps.signer.sign(outbound);
  const destination = new URL(target.href);
  destination.searchParams.set('rt', token);
  return destination.href;
}

function serviceOrigin(deps: JumpDeps) {
  return deps.config?.serviceOrigin ?? PRODUCTION_SERVICE_ORIGIN;
}

function readProtectedKid(token: string) {
  const [encodedHeader] = token.split('.');
  const header = decodeUntrustedJson<Record<string, unknown>>(encodedHeader);
  return typeof header?.kid === 'string' && header.kid ? header.kid : undefined;
}

function decodeUntrustedJson<T>(value: string | undefined): T | null {
  if (!value) return null;
  try {
    const padded = value.replaceAll('-', '+').replaceAll('_', '/');
    const base64 = padded + '='.repeat((4 - (padded.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}

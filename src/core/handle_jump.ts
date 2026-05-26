import { normalizeUrl } from './normalize_url';
import { assertDestinationPolicy } from './policy';
import { renderCushion } from './render_cushion';
import { renderError } from './render_error';
import { verifyJumpJwt } from './verify_jwt';
import {
  JumpError,
  SERVICE,
  type IssuerConfig,
  type IssuerRegistry,
  type OutboundJumpClaim,
  type RuntimeInfo,
} from './types';
import type { JwksCache } from './jwks_cache';
import type { ReplayCache } from './replay_cache';
import type { OutboundSigner } from './sign_outbound';
import type { NormalizedUrl } from './normalize_url';

export type JumpDeps = {
  registry: IssuerRegistry;
  jwksCache: JwksCache;
  replayCache: ReplayCache;
  runtime: RuntimeInfo;
  signer: OutboundSigner;
  now?: () => number;
  randomJti?: () => string;
  outboundTtl?: number;
};

const DEFAULT_OUTBOUND_TTL = 60;

export async function handleJump(request: Request, deps: JumpDeps): Promise<Response> {
  try {
    const url = new URL(request.url);
    const tokens = url.searchParams.getAll('rt');
    if (tokens.length !== 1) throw new JumpError('malformed', 'rt count rejected');
    const now = deps.now?.() ?? Math.floor(Date.now() / 1000);
    const { claim, issuer } = await verifyJumpJwt(
      String(tokens[0]),
      deps.registry,
      deps.jwksCache,
      deps.replayCache,
      now,
    );
    const target = normalizeUrl(claim.url, deps.runtime);
    assertDestinationPolicy(claim, issuer, target);

    if (claim.dst === 'external') {
      return new Response(renderCushion(target), {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    const location = await buildInternalLocation(target, issuer, deps, now);
    return new Response(null, {
      status: 302,
      headers: { Location: location },
    });
  } catch (error) {
    const code = error instanceof JumpError ? error.code : 'malformed';
    return new Response(renderError(), {
      status: code === 'expired' ? 410 : 400,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Jump-Error': code,
      },
    });
  }
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
    iss: SERVICE.origin,
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

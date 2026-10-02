import { JumpError, type InboundJumpClaim, type IssuerConfig } from './types';
import type { NormalizedUrl } from './normalize_url';

export function assertDestinationPolicy(
  claim: InboundJumpClaim,
  issuer: IssuerConfig,
  target: NormalizedUrl,
) {
  if (target.origin === claim.iss) throw new JumpError('invalid_dst');
  if (claim.dst === 'internal') {
    if (!originAllowed(issuer.allowed_dst_internal, target.origin)) {
      throw new JumpError('invalid_dst', 'internal destination rejected');
    }
    return;
  }

  if (claim.dst === 'external') {
    const allowed = issuer.allowed_dst_external;
    if (Array.isArray(allowed) && originAllowed(allowed, target.origin)) return;
    throw new JumpError('invalid_dst', 'external destination rejected');
  }

  throw new JumpError('invalid_dst', 'unknown dst');
}

function originAllowed(allowedOrigins: readonly string[], targetOrigin: string) {
  return allowedOrigins.includes(targetOrigin);
}

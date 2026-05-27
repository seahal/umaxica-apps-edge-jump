import { JumpError, type InboundJumpClaim, type IssuerConfig } from './types';
import { normalizeOrigin, type NormalizedUrl } from './normalize_url';

const POLICY_RUNTIME = { edge: 'unknown', production: true } as const;

export function assertDestinationPolicy(
  claim: InboundJumpClaim,
  issuer: IssuerConfig,
  target: NormalizedUrl,
) {
  if (claim.dst === 'internal') {
    if (!originAllowed(issuer.allowed_dst_internal, target.origin)) {
      throw new JumpError('invalid_dst', 'internal destination rejected');
    }
    return;
  }

  if (claim.dst === 'external') {
    const allowed = issuer.allowed_dst_external;
    if (allowed === true) return;
    if (Array.isArray(allowed) && originAllowed(allowed, target.origin)) return;
    throw new JumpError('invalid_dst', 'external destination rejected');
  }

  throw new JumpError('invalid_dst', 'unknown dst');
}

function originAllowed(allowedOrigins: string[], targetOrigin: string) {
  return allowedOrigins.some((origin) => normalizeOrigin(origin, POLICY_RUNTIME) === targetOrigin);
}

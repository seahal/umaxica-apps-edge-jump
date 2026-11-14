import { JumpError, type InboundJumpClaim, type IssuerConfig } from './types';
import type { NormalizedUrl } from './normalize_url';

/** Internal-only gateway: the target origin must be an approved edge of the issuer. */
export function assertDestinationPolicy(
  claim: InboundJumpClaim,
  issuer: IssuerConfig,
  target: NormalizedUrl,
) {
  if (target.origin === claim.iss) throw new JumpError('invalid_dst');
  if (claim.dst !== 'internal') throw new JumpError('invalid_dst', 'unknown dst');
  if (!issuer.allowed_dst_internal.includes(target.origin)) {
    throw new JumpError('invalid_dst', 'internal destination rejected');
  }
}

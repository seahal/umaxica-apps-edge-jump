import type { JumpEnvironment } from './types';

export type TokenTypes = {
  /** Required `typ` of issuer → Jump request tokens. */
  inbound: string;
  /** `typ` of Jump → receiver return tokens. */
  outbound: string;
};

const TOKEN_TYPES: Record<JumpEnvironment, TokenTypes> = {
  production: { inbound: 'JWT', outbound: 'JWT' },
  staging: { inbound: 'jump-request+jwt', outbound: 'jump-return+jwt' },
};

export function tokenTypes(environment: JumpEnvironment): TokenTypes {
  return TOKEN_TYPES[environment];
}

export function isJumpEnvironment(value: unknown): value is JumpEnvironment {
  return value === 'production' || value === 'staging';
}

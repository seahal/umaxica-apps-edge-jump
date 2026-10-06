export const SERVICE = {
  name: 'jump',
  version: '0.3.0',
} as const;

type EdgeName = 'cloudflare';

export type RuntimeInfo = {
  edge: EdgeName;
  production: true;
};

/**
 * Deployment the Worker runs as. It selects only the JOSE `typ` pair: staging
 * enforces the explicit types, production keeps schema-1 `JWT` until the
 * coordinated Rails migration. Each deployment accepts exactly one value.
 */
export type JumpEnvironment = 'production' | 'staging';

export type JumpConfig = {
  serviceOrigin: string;
  environment: JumpEnvironment;
};

export type IssuerConfig = {
  iss: string;
  jwks_uri: string;
  allowed_dst_internal: string[];
  revoked_kids?: string[];
};

export type IssuerRegistry = Record<string, IssuerConfig>;

export type InboundJumpClaim = {
  schema: 1;
  rpl: 'reuse';
  iss: string;
  aud: string;
  sub: 'jump-redirect';
  iat: number;
  nbf: number;
  exp: number;
  jti: string;
  dst: 'internal';
  url: string;
};

export type OutboundJumpClaim = {
  schema: 1;
  rpl: 'reuse';
  iss: string;
  aud: string;
  sub: 'jump-redirect';
  iat: number;
  nbf: number;
  exp: number;
  jti: string;
  src: string;
  dst: 'internal';
  url: string;
};

export type JumpErrorCode =
  | 'malformed'
  | 'invalid_header'
  | 'invalid_signature'
  | 'invalid_claim'
  | 'expired'
  | 'invalid_dst'
  | 'invalid_url'
  | 'non_navigation_request'
  | 'signer_unavailable'
  | 'jwks_bad_gateway'
  | 'jwks_unavailable'
  | 'deadline_exceeded'
  | 'internal_error';

export class JumpError extends Error {
  readonly code: JumpErrorCode;

  constructor(code: JumpErrorCode, message?: string) {
    const text = message ?? code;
    super(text);
    this.code = code;
  }
}

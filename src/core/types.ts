export const SERVICE = {
  name: 'jump',
  version: '0.3.0',
} as const;

type EdgeName = 'cloudflare';

export type RuntimeInfo = {
  edge: EdgeName;
  production: true;
};

export type JumpConfig = {
  serviceOrigin: string;
};

export type IssuerConfig = {
  iss: string;
  jwks_uri: string;
  allowed_dst_internal: string[];
  allowed_dst_external: false | readonly string[];
  revoked_kids?: string[];
};

export type IssuerRegistry = Record<string, IssuerConfig>;

type JumpDst = 'internal' | 'external';

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
  dst: JumpDst;
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

import { isSupportedPublicKey } from './issuer_jwks';
import type { JWK } from 'jose';
import { JumpError } from './types';

const PRIVATE_JWK_FIELDS = new Set(['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k']);
const REQUIRED_PUBLIC_FIELDS = ['kty', 'kid', 'alg', 'use'] as const;

export type JumpJwks = {
  keys: JWK[];
};

export function parseJumpJwks(value: string): JumpJwks {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new JumpError('malformed', 'jump jwks json rejected');
  }
  return validateJumpJwks(parsed);
}

export function validateJumpJwks(value: unknown): JumpJwks {
  if (!isRecord(value) || !Array.isArray(value.keys)) {
    throw new JumpError('malformed', 'jump jwks keys required');
  }
  if (value.keys.length === 0) throw new JumpError('malformed', 'jump jwks empty');
  const keys = value.keys.map(validatePublicJwk);
  if (new Set(keys.map((key) => key.kid)).size !== keys.length) {
    throw new JumpError('malformed', 'jump jwks duplicate kid rejected');
  }
  return { keys };
}

function validatePublicJwk(value: unknown): JWK {
  if (!isRecord(value)) throw new JumpError('malformed', 'jump jwk rejected');
  for (const field of REQUIRED_PUBLIC_FIELDS) {
    if (typeof value[field] !== 'string' || !value[field]) {
      throw new JumpError('malformed', `jump jwk ${field} required`);
    }
  }
  if (!isSupportedPublicKey(value) || value.use !== 'sig')
    throw new JumpError('malformed', 'jump jwk profile rejected');
  if (
    String(value.kid).length > 128 ||
    (value.key_ops !== undefined &&
      (!Array.isArray(value.key_ops) ||
        value.key_ops.length !== 1 ||
        value.key_ops[0] !== 'verify'))
  )
    throw new JumpError('malformed');
  for (const field of PRIVATE_JWK_FIELDS) {
    if (field in value) throw new JumpError('malformed', 'jump private jwk material rejected');
  }
  return value as JWK;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

import type { JWK } from 'jose';
import { JumpError } from './types';

const PRIVATE_JWK_FIELDS = new Set(['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k']);
const REQUIRED_PUBLIC_FIELDS = ['kty', 'crv', 'kid', 'alg', 'use', 'x', 'y'] as const;

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
  return { keys: value.keys.map(validatePublicJwk) };
}

function validatePublicJwk(value: unknown): JWK {
  if (!isRecord(value)) throw new JumpError('malformed', 'jump jwk rejected');
  for (const field of REQUIRED_PUBLIC_FIELDS) {
    if (typeof value[field] !== 'string' || !value[field]) {
      throw new JumpError('malformed', `jump jwk ${field} required`);
    }
  }
  if (value.alg !== 'ES384') throw new JumpError('malformed', 'jump jwk alg rejected');
  if (value.use !== 'sig') throw new JumpError('malformed', 'jump jwk use rejected');
  for (const field of PRIVATE_JWK_FIELDS) {
    if (field in value) throw new JumpError('malformed', 'jump private jwk material rejected');
  }
  return value as JWK;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

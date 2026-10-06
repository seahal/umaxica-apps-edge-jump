import { importJWK } from 'jose';
import { JumpError } from './types';

/**
 * Upper bound on keys in one issuer JWK Set: previous, current and next signing
 * key during a prepublish-first rotation, plus one slot for an emergency key.
 */
export const MAX_ISSUER_JWKS_KEYS = 4;
const MAX_KID_LENGTH = 128;

const PRIVATE_JWK_FIELDS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k'] as const;
const P384_COORDINATE = /^[A-Za-z0-9_-]{64}$/;

export type IssuerKeys = ReadonlyMap<string, CryptoKey>;

/** `kid` profile shared by token headers and JWKs: compared byte for byte, never normalized. */
export function isValidKid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_KID_LENGTH &&
    !hasControlCharacter(value)
  );
}

/** C0 controls (NUL included), DEL and C1 controls. */
export function hasControlCharacter(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

/**
 * Validates a fetched issuer JWK Set and imports every key.
 *
 * The set is accepted whole or not at all: every entry must be an ES384
 * signature verification key over P-384 whose coordinates import as a curve
 * point. Only `kty`, `crv`, `x` and `y` reach the importer, so remote-reference
 * or certificate members (`x5u`, `x5c`, `jku`, ...) are never dereferenced.
 */
export async function importIssuerJwks(value: unknown): Promise<IssuerKeys> {
  if (!isRecord(value) || !Array.isArray(value.keys)) throw rejected('jwks shape rejected');
  const entries: unknown[] = value.keys;
  if (entries.length === 0 || entries.length > MAX_ISSUER_JWKS_KEYS)
    throw rejected('jwks key count rejected');
  const keys = new Map<string, CryptoKey>();
  for (const entry of entries) {
    if (!isRecord(entry)) throw rejected('jwk shape rejected');
    if (PRIVATE_JWK_FIELDS.some((field) => Object.hasOwn(entry, field)))
      throw rejected('private jwk material rejected');
    if (
      entry.kty !== 'EC' ||
      entry.crv !== 'P-384' ||
      entry.alg !== 'ES384' ||
      entry.use !== 'sig' ||
      !isValidKid(entry.kid) ||
      typeof entry.x !== 'string' ||
      !P384_COORDINATE.test(entry.x) ||
      typeof entry.y !== 'string' ||
      !P384_COORDINATE.test(entry.y) ||
      (entry.key_ops !== undefined &&
        (!Array.isArray(entry.key_ops) ||
          entry.key_ops.length !== 1 ||
          entry.key_ops[0] !== 'verify'))
    )
      throw rejected('jwk profile rejected');
    if (keys.has(entry.kid)) throw rejected('duplicate kid rejected');
    let key: CryptoKey;
    try {
      key = (await importJWK(
        { kty: 'EC', crv: 'P-384', x: entry.x, y: entry.y },
        'ES384',
      )) as CryptoKey;
    } catch {
      throw rejected('jwk import rejected');
    }
    keys.set(entry.kid, key);
  }
  return keys;
}

function rejected(message: string) {
  return new JumpError('jwks_bad_gateway', message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

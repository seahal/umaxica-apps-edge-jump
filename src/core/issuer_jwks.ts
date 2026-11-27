import { importJWK } from 'jose';
import { JumpError } from './types';

/** Total slots for simultaneous PS256 and OIDC key rotations. */
export const MAX_ISSUER_JWKS_KEYS = 8;
/** Previous, current, next and one emergency Jump verification key. */
export const MAX_ISSUER_PS256_KEYS = 4;
const MAX_KID_LENGTH = 128;

const PRIVATE_JWK_FIELDS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k'] as const;

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
 * Checks the entire set for shape and private material, then imports only
 * explicitly labeled PS256 keys. Invalid PS256 keys reject the whole set.
 * Only public parameters reach the importer; remote references are ignored.
 */
export async function importIssuerJwks(value: unknown): Promise<IssuerKeys> {
  if (!isRecord(value) || !Array.isArray(value.keys)) throw rejected('jwks shape rejected');
  const entries: unknown[] = value.keys;
  if (entries.length === 0 || entries.length > MAX_ISSUER_JWKS_KEYS)
    throw rejected('jwks key count rejected');
  const candidates: Record<string, unknown>[] = [];
  for (const entry of entries) {
    if (!isRecord(entry)) throw rejected('jwk shape rejected');
    if (PRIVATE_JWK_FIELDS.some((field) => Object.hasOwn(entry, field)))
      throw rejected('private jwk material rejected');
    if (entry.alg === 'PS256') candidates.push(entry);
  }
  if (candidates.length === 0 || candidates.length > MAX_ISSUER_PS256_KEYS)
    throw rejected('jwks PS256 key count rejected');

  const keys = new Map<string, CryptoKey>();
  for (const entry of candidates) {
    if (
      !isSupportedPublicKey(entry) ||
      entry.use !== 'sig' ||
      !isValidKid(entry.kid) ||
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
        { kty: 'RSA', n: entry.n as string, e: entry.e as string },
        'PS256',
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

/** RSA-3072 with exponent 65537; no legacy algorithms. */
export function isSupportedPublicKey(value: Record<string, unknown>): boolean {
  if (
    value.alg !== 'PS256' ||
    value.kty !== 'RSA' ||
    value.e !== 'AQAB' ||
    typeof value.n !== 'string' ||
    !/^[A-Za-z0-9_-]{512}$/.test(value.n)
  )
    return false;
  return (atob(value.n.replaceAll('-', '+').replaceAll('_', '/')).charCodeAt(0) & 128) !== 0;
}

import { unicodeHostname } from './idna';
import { JumpError, type RuntimeInfo } from './types';

export type NormalizedUrl = {
  href: string;
  origin: string;
  hostname: string;
  unicodeHostname: string;
  hasNonAsciiHostname: boolean;
};

const FORBIDDEN_PROTOCOLS = new Set(['javascript:', 'data:', 'file:', 'blob:']);
const METADATA_V4 = '169.254.169.254';

function containsControlCharacter(input: string) {
  for (let index = 0; index < input.length; index++) {
    const code = input.charCodeAt(index);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

export function normalizeUrl(
  input: string,
  runtime: RuntimeInfo,
  serviceOrigin: string,
): NormalizedUrl {
  if (
    typeof input !== 'string' ||
    !input ||
    /[ \\]/.test(input) ||
    containsControlCharacter(input) ||
    /%(?![0-9a-fA-F]{2})/.test(input)
  )
    throw new JumpError('invalid_url');
  try {
    const decoded = decodeURI(input);
    if (/[\\]/.test(decoded) || containsControlCharacter(decoded)) throw new Error();
  } catch {
    throw new JumpError('invalid_url');
  }
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new JumpError('invalid_url', 'url parse failed');
  }

  if (FORBIDDEN_PROTOCOLS.has(parsed.protocol))
    throw new JumpError('invalid_url', 'forbidden protocol');
  if (parsed.username || parsed.password) throw new JumpError('invalid_url', 'userinfo rejected');
  if (parsed.protocol === 'http:') throw new JumpError('invalid_url', 'http rejected');
  /* v8 ignore next -- URL only reaches this after explicit forbidden protocol checks */
  if (!['https:', 'http:'].includes(parsed.protocol))
    throw new JumpError('invalid_url', 'protocol rejected');

  const rawHost = parsed.hostname;
  if (rawHost.endsWith('.') || parsed.port) throw new JumpError('invalid_url');
  const hostname = rawHost.toLowerCase();
  parsed.hostname = hostname;

  if (hostname === new URL(serviceOrigin).hostname)
    throw new JumpError('invalid_url', 'self link rejected');
  if (isForbiddenHost(hostname)) throw new JumpError('invalid_url', 'forbidden host');

  const hasNonAsciiHostname = hostname.split('.').some((label) => label.startsWith('xn--'));
  return {
    href: parsed.href,
    origin: parsed.origin,
    hostname,
    unicodeHostname: hasNonAsciiHostname ? unicodeHostname(hostname) : hostname,
    hasNonAsciiHostname,
  };
}

export function normalizeOrigin(
  input: string,
  runtime: RuntimeInfo,
  serviceOrigin: string,
): string {
  const parsed = normalizeUrl(input, runtime, serviceOrigin);
  const originPath = new URL(parsed.href);
  if (originPath.pathname !== '/' || originPath.search || originPath.hash) {
    throw new JumpError('invalid_dst', 'origin allowlist entries must be origins');
  }
  if (input !== parsed.origin) throw new JumpError('invalid_dst');
  return parsed.origin;
}

function isForbiddenHost(hostname: string) {
  if (!hostname.includes('.') && !hostname.startsWith('[')) return true;
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true;
  if (hostname === METADATA_V4 || hostname === 'metadata.google.internal') return true;
  const ipv4 = parseIpv4(hostname);
  if (ipv4) return isPrivateIpv4(ipv4);
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return isForbiddenIpv6(hostname.slice(1, -1));
  }
  return false;
}

function parseIpv4(hostname: string) {
  const parts = hostname.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((part) => {
    /* v8 ignore next -- WHATWG URL rejects non-numeric IPv4 labels before this point */
    if (!/^\d+$/.test(part)) return Number.NaN;
    const value = Number(part);
    /* v8 ignore next -- WHATWG URL rejects out-of-range IPv4 labels before this point */
    return value >= 0 && value <= 255 ? value : Number.NaN;
  });
  /* v8 ignore next -- invalid IPv4 labels are rejected by WHATWG URL parsing first */
  return nums.every(Number.isInteger) ? (nums as [number, number, number, number]) : null;
}

function isPrivateIpv4([a, b, c]: [number, number, number, number]) {
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 0) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0 && c === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

function isForbiddenIpv6(address: string) {
  const lower = address.toLowerCase();
  const groups = expandIpv6(lower);
  /* v8 ignore next -- WHATWG URL validates bracketed IPv6 before this point */
  if (!groups) return true;

  if (groups.every((group) => group === 0)) return true;
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) return true;

  const normalizedMapped = matchExpandedIpv4Mapped(groups);
  if (normalizedMapped) return isPrivateIpv4(normalizedMapped);

  const normalizedCompat = matchExpandedIpv4Compatible(groups);
  if (normalizedCompat) return isPrivateIpv4(normalizedCompat);

  const normalized6to4 = matchExpanded6to4(groups);
  if (normalized6to4) return isPrivateIpv4(normalized6to4);

  const first = Number(groups[0]);
  if ((first & 0xffc0) === 0xfe80) return true;
  if ((first & 0xfe00) === 0xfc00) return true;
  if ((first & 0xff00) === 0xff00) return true;
  if (isNat64WellKnown(groups)) return true;

  return false;
}

function isNat64WellKnown(groups: number[]) {
  return (
    groups[0] === 0x64 &&
    groups[1] === 0xff9b &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0
  );
}

function matchExpandedIpv4Mapped(groups: number[]): [number, number, number, number] | null {
  /* v8 ignore next -- callers pass expanded IPv6 groups */
  if (groups.length !== 8) return null;
  if (!groups.slice(0, 5).every((group) => group === 0)) return null;
  if (groups[5] !== 0xffff) return null;
  const high = Number(groups[6]);
  const low = Number(groups[7]);
  return [high >> 8, high & 0xff, low >> 8, low & 0xff];
}

function matchExpandedIpv4Compatible(groups: number[]): [number, number, number, number] | null {
  /* v8 ignore next -- callers pass expanded IPv6 groups */
  if (groups.length !== 8) return null;
  if (!groups.slice(0, 6).every((group) => group === 0)) return null;
  const high = Number(groups[6]);
  const low = Number(groups[7]);
  return [high >> 8, high & 0xff, low >> 8, low & 0xff];
}

function matchExpanded6to4(groups: number[]): [number, number, number, number] | null {
  /* v8 ignore next -- callers pass expanded IPv6 groups */
  if (groups.length !== 8) return null;
  if (groups[0] !== 0x2002) return null;
  const high = Number(groups[1]);
  const low = Number(groups[2]);
  return [high >> 8, high & 0xff, low >> 8, low & 0xff];
}

function expandIpv6(address: string): number[] | null {
  const doubleColonCount = address.split('::').length - 1;
  /* v8 ignore next -- WHATWG URL rejects multiple compression markers before this point */
  if (doubleColonCount > 1) return null;

  let head: string[] = [];
  let rest: string[] = [];
  /* v8 ignore else -- WHATWG URL serializes supported IPv6 inputs with compression */
  if (address.includes('::')) {
    const [left, right] = address.split('::');
    head = left ? left.split(':') : [];
    rest = right ? right.split(':') : [];
  } else {
    head = address.split(':');
  }

  const total = head.length + rest.length;
  /* v8 ignore next -- WHATWG URL validates IPv6 group count before this point */
  if (!address.includes('::') && total !== 8) return null;
  /* v8 ignore next -- WHATWG URL validates IPv6 group count before this point */
  if (address.includes('::') && total > 8) return null;

  const fillCount = 8 - total;
  const groups = [...head, ...Array(fillCount).fill('0'), ...rest];
  /* v8 ignore next -- derived from validated group count */
  if (groups.length !== 8) return null;

  const numeric: number[] = [];
  for (const group of groups) {
    /* v8 ignore next -- WHATWG URL validates IPv6 digits before this point */
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    numeric.push(Number.parseInt(group, 16));
  }
  return numeric;
}

/** Additional special-use identity restrictions; .example is allowed for test DI. */
function isForbiddenServiceHost(hostname: string) {
  if (isForbiddenHost(hostname)) return true;
  if (
    !hostname.startsWith('[') &&
    (hostname.length > 253 ||
      !hostname
        .split('.')
        .every((label) => /^(?!-)[a-z0-9-]{1,63}$/.test(label) && !label.endsWith('-')))
  )
    return true;
  if (
    ['local', 'internal', 'arpa', 'alt', 'onion', 'invalid', 'test'].some(
      (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
    )
  )
    return true;
  const ipv4 = parseIpv4(hostname);
  if (ipv4) {
    const [a, b, c] = ipv4;
    return (
      (a === 192 && b === 0 && c === 2) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 192 && b === 31 && c === 196) ||
      (a === 192 && b === 52 && c === 193) ||
      (a === 192 && b === 175 && c === 48) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (hostname.startsWith('[')) {
    const groups = expandIpv6(hostname.slice(1, -1));
    /* v8 ignore next -- URL parsing has already validated the IPv6 literal */
    if (!groups) return true;
    const first = Number(groups[0]);
    const second = Number(groups[1]);
    return (
      (first & 0xe000) !== 0x2000 ||
      (first === 0x2001 && (second < 0x200 || second === 0xdb8)) ||
      first === 0x2002 ||
      (first === 0x2620 && second === 0x4f && groups[2] === 0x8000) ||
      (first === 0x3fff && second < 0x1000)
    );
  }
  return false;
}

/** Protocol identity; never derived from request headers or defaulted. */
export function validateServiceOrigin(input: unknown): string {
  try {
    if (
      typeof input !== 'string' ||
      !input ||
      /[\s\\]/.test(input) ||
      containsControlCharacter(input)
    )
      throw new Error();
    const url = new URL(input);
    if (
      input !== url.origin ||
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      url.hostname.endsWith('.') ||
      isForbiddenServiceHost(url.hostname)
    )
      throw new Error();
    return url.origin;
  } catch {
    throw new JumpError('signer_unavailable');
  }
}

export function isRtKey(name: string) {
  return name === 'rt' || name.startsWith('rt[');
}

/**
 * The only accepted entry query, matched on the raw serialized query rather
 * than decoded parameters: exactly one literal `rt` key whose value is three
 * Base64URL segments. Percent-encoded keys or values, `+`, `;`, `rt[]`, empty
 * or repeated `rt` and any other parameter therefore never reach a parser that
 * could disagree with another one about what `rt` is.
 */
export const ENTRY_QUERY = /^\?rt=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/** `rt` is accepted only on `/`, in exactly the `ENTRY_QUERY` form. */
export function hasMalformedRtQuery(url: URL) {
  if (url.pathname !== '/') return [...url.searchParams.keys()].some(isRtKey);
  if (!url.search) return false;
  return !ENTRY_QUERY.test(url.search);
}

export function validateInternalTarget(target: NormalizedUrl): NormalizedUrl {
  const url = new URL(target.href);
  if (url.hash || target.href.includes('#')) throw new JumpError('invalid_url');
  const single = new Set(['redirect_uri', 'state', 'nonce', 'code', 'next', 'return_to']);
  const seen = new Set<string>();
  for (const name of url.searchParams.keys()) {
    if (isRtKey(name) || (single.has(name) && seen.has(name))) throw new JumpError('invalid_url');
    seen.add(name);
  }
  // Canonical query serialization shared by claim and Location (not input bytes).
  url.search = url.searchParams.toString();
  return { ...target, href: url.href };
}

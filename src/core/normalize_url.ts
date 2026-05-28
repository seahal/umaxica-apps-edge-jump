import { JumpError, PRODUCTION_SERVICE_ORIGIN, type RuntimeInfo } from './types';

export type NormalizedUrl = {
  href: string;
  origin: string;
  hostname: string;
  hasNonAsciiHostname: boolean;
};

const FORBIDDEN_PROTOCOLS = new Set(['javascript:', 'data:', 'file:', 'blob:']);
const METADATA_V4 = '169.254.169.254';

export function normalizeUrl(
  input: string,
  runtime: RuntimeInfo,
  serviceOrigin: string = PRODUCTION_SERVICE_ORIGIN,
): NormalizedUrl {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new JumpError('invalid_url', 'url parse failed');
  }

  if (FORBIDDEN_PROTOCOLS.has(parsed.protocol))
    throw new JumpError('invalid_url', 'forbidden protocol');
  if (parsed.username || parsed.password) throw new JumpError('invalid_url', 'userinfo rejected');
  if (runtime.production && parsed.protocol === 'http:')
    throw new JumpError('invalid_url', 'http rejected');
  /* v8 ignore next -- URL only reaches this after explicit forbidden protocol checks */
  if (!['https:', 'http:'].includes(parsed.protocol))
    throw new JumpError('invalid_url', 'protocol rejected');

  const rawHost = parsed.hostname;
  const hostname = rawHost.endsWith('.')
    ? rawHost.slice(0, -1).toLowerCase()
    : rawHost.toLowerCase();
  parsed.hostname = hostname;

  if (hostname === new URL(serviceOrigin).hostname)
    throw new JumpError('invalid_url', 'self link rejected');
  if (isForbiddenHost(hostname)) throw new JumpError('invalid_url', 'forbidden host');

  return {
    href: parsed.href,
    origin: parsed.origin,
    hostname,
    hasNonAsciiHostname: hostname.split('.').some((label) => label.startsWith('xn--')),
  };
}

export function normalizeOrigin(input: string, runtime: RuntimeInfo): string {
  const parsed = normalizeUrl(input, runtime);
  const originPath = new URL(parsed.href);
  if (originPath.pathname !== '/' || originPath.search || originPath.hash) {
    throw new JumpError('invalid_dst', 'origin allowlist entries must be origins');
  }
  return parsed.origin;
}

function isForbiddenHost(hostname: string) {
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

function isPrivateIpv4([a, b]: [number, number, number, number]) {
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 0) return true;
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

  return false;
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

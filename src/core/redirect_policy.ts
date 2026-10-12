import { JumpError } from './types';

/** Direct pathname only. Never recursively applied to OAuth query values. */
export function assertDirectPath(pathname: string) {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    throw new JumpError('invalid_url');
  }
  if (/[;\\]/.test(decoded) || hasControl(decoded)) throw new JumpError('invalid_url');
  if (
    !pathname.startsWith('/') ||
    pathname.includes('//') ||
    /[;\\ ]/.test(pathname) ||
    hasControl(pathname) ||
    /%(?![a-f0-9]{2})/i.test(pathname) ||
    /%(?:2f|5c|25)/i.test(pathname) ||
    pathname.split('/').some((segment) => {
      const dots = segment.replaceAll(/%2e/gi, '.');
      return dots === '.' || dots === '..';
    })
  )
    throw new JumpError('invalid_url');
}

export type PathRule = Readonly<{
  origin: string;
  pathname: string;
  mode: 'exact' | 'subtree';
  formatSuffix?: true;
}>;

export function validatePathRules(rules: readonly PathRule[]): readonly PathRule[] {
  return Object.freeze(
    rules.map((rule) => {
      const url = new URL(rule.origin);
      if (
        url.protocol !== 'https:' ||
        url.origin !== rule.origin ||
        !['exact', 'subtree'].includes(rule.mode) ||
        (rule.formatSuffix !== undefined && rule.formatSuffix !== true)
      )
        throw new Error('invalid_path_policy');
      assertDirectPath(rule.pathname);
      if (
        rule.pathname !== new URL(rule.pathname, rule.origin).pathname ||
        decodeURIComponent(rule.pathname) !== rule.pathname
      )
        throw new Error('invalid_path_policy');
      if (rule.pathname !== '/' && rule.pathname.endsWith('/'))
        throw new Error('invalid_path_policy');
      return Object.freeze({ ...rule });
    }),
  );
}

// Audited Base/Core/Warp GET completion consumes logout state; Auth re-forwards to Base. Callback and authorize
// endpoints are deliberately not blanket-denied: they need owner integration proof.
export const PATH_DENYLIST = validatePathRules(
  [
    'https://www.umaxica.app',
    'https://www.umaxica.com',
    'https://www.umaxica.org',
    'https://jp.umaxica.app',
    'https://jp.umaxica.com',
    'https://jp.umaxica.org',
    'https://www-jp.umaxica.app',
    'https://www-jp.umaxica.com',
    'https://www-jp.umaxica.org',
    'https://auth.umaxica.app',
    'https://auth.umaxica.com',
    'https://auth.umaxica.org',
  ].map((origin) => ({
    origin,
    pathname: '/sign/out',
    mode: 'exact' as const,
    formatSuffix: true as const,
  })),
);

export function assertPathAllowed(origin: string, pathname: string, rules = PATH_DENYLIST) {
  pathname = decodeURIComponent(pathname);
  // Compare route aliases without rewriting the navigation target. Rails can
  // remove a terminal slash before recognizing a format suffix, so both
  // transformations must participate in the same denial decision.
  const routePath = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  for (const rule of rules) {
    if (origin !== rule.origin) continue;
    if (
      pathname === rule.pathname ||
      pathname === `${rule.pathname}/` ||
      (rule.formatSuffix &&
        routePath.startsWith(`${rule.pathname}.`) &&
        !routePath.slice(rule.pathname.length).includes('/')) ||
      (rule.mode === 'subtree' &&
        (rule.pathname === '/' || pathname.startsWith(`${rule.pathname}/`)))
    )
      throw new JumpError('invalid_url');
  }
}

export const FORBIDDEN_DOMAINS = Object.freeze([
  'example.com',
  'example.org',
  'example.net',
  'example.dev',
  'example.app',
  'exampe.net',
  'exampe.dev',
]);
export function isDeniedDomain(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return [
    ...FORBIDDEN_DOMAINS,
    'localhost',
    'local',
    'internal',
    'arpa',
    'alt',
    'onion',
    'invalid',
    'test',
    'example',
  ].some((domain) => host === domain || host.endsWith(`.${domain}`));
}

export function assertTransferQuery(url: URL, isSpecialHost: (host: string) => boolean) {
  for (const [name, value] of url.searchParams) {
    // No receiving-route contract authorizes these generic redirect controls.
    if (/^(?:next|return_to|return_url|redirect|redirect_url|url|continue)(?:\[|$)/i.test(name))
      throw new JumpError('invalid_url');
    if (/^(?:redirect_uri|post_logout_redirect_uri)\[/i.test(name))
      throw new JumpError('invalid_url');
    if (name !== 'redirect_uri' && name !== 'post_logout_redirect_uri') continue;
    if (!value || /[\s\\]/.test(value) || hasControl(value) || /%(?![a-f0-9]{2})/i.test(value))
      throw new JumpError('invalid_url');
    let nested: URL;
    try {
      nested = new URL(value);
    } catch {
      throw new JumpError('invalid_url');
    }
    if (
      ['https:', 'http:'].includes(nested.protocol) &&
      !/^https?:\/\/[^/?#]+(?:[/?#]|$)/i.test(value)
    )
      throw new JumpError('invalid_url');
    const nativeLoopback =
      name === 'redirect_uri' &&
      nested.protocol === 'http:' &&
      ['127.0.0.1', '[::1]'].includes(nested.hostname);
    if (
      nested.username ||
      nested.password ||
      nested.hash ||
      value.includes('#') ||
      ['javascript:', 'data:', 'file:', 'blob:', 'ftp:', 'ws:', 'wss:'].includes(nested.protocol) ||
      (nested.protocol === 'http:' && !nativeLoopback) ||
      (nested.hostname &&
        (isDeniedDomain(nested.hostname) || (!nativeLoopback && isSpecialHost(nested.hostname))))
    )
      throw new JumpError('invalid_url');
    // Registered native private-use schemes remain the authorization server's
    // responsibility (RFC 8252). No URI bytes are rewritten or decoded again.
  }
}

function hasControl(input: string) {
  for (let index = 0; index < input.length; index++) {
    const code = input.charCodeAt(index);
    if (code < 32 || (code >= 127 && code <= 159)) return true;
  }
  return false;
}

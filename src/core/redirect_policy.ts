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

const FORBIDDEN_DOMAINS = Object.freeze([
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
    const lowerName = name.toLowerCase();
    // No receiving-route contract authorizes these generic redirect controls.
    if (/^(?:next|return_to|return_url|redirect|redirect_url|url|continue)(?:\[|$)/i.test(name))
      throw new JumpError('invalid_url');
    if (/^(?:redirect_uri|post_logout_redirect_uri)\[/i.test(name))
      throw new JumpError('invalid_url');
    if (lowerName !== 'redirect_uri' && lowerName !== 'post_logout_redirect_uri') continue;
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
      lowerName === 'redirect_uri' &&
      nested.protocol === 'http:' &&
      ['127.0.0.1', '[::1]'].includes(nested.hostname);
    const privateUseScheme = /^[a-z][a-z0-9+.-]*\.[a-z0-9+.-]+:$/.test(nested.protocol);
    if (
      nested.username ||
      nested.password ||
      nested.hash ||
      value.includes('#') ||
      (nested.protocol !== 'https:' && !nativeLoopback && !privateUseScheme) ||
      (nested.protocol === 'https:' && !/^https:\/\/[^/?#]+(?:[/?#]|$)/i.test(value)) ||
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

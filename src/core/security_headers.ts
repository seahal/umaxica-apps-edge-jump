import type { Context, Next } from 'hono';
import { secureHeaders } from 'hono/secure-headers';

export const CUSHION_INLINE_SCRIPT = 'history.replaceState(null,"",location.pathname)';
const CUSHION_INLINE_SCRIPT_SHA256 = '8A+3er73YJf04rRHGhbZwZQACPiiipi9EPduIeAAIDk=';
const STRICT_TRANSPORT_SECURITY = 'max-age=63072000; includeSubDomains; preload';

const CONTENT_SECURITY_POLICY = {
  defaultSrc: ["'none'"],
  baseUri: ["'none'"],
  formAction: ["'none'"],
  frameAncestors: ["'none'"],
  imgSrc: ["'self'"],
  scriptSrc: [`'sha256-${CUSHION_INLINE_SCRIPT_SHA256}'`],
  styleSrc: ["'none'"],
};

const PERMISSIONS_POLICY = {
  accelerometer: [],
  camera: [],
  geolocation: [],
  gyroscope: [],
  microphone: [],
  payment: [],
  usb: [],
};

export function jumpSecureHeaders() {
  return secureHeaders({
    contentSecurityPolicy: { ...CONTENT_SECURITY_POLICY },
    crossOriginEmbedderPolicy: true,
    strictTransportSecurity: STRICT_TRANSPORT_SECURITY,
    xContentTypeOptions: 'nosniff',
    xFrameOptions: 'DENY',
    referrerPolicy: 'no-referrer',
    permissionsPolicy: { ...PERMISSIONS_POLICY },
    removePoweredBy: true,
  });
}

/**
 * The same protection set as `jumpSecureHeaders` + `responseHygiene`, as a plain
 * header record, for HTML responses produced outside the Hono app — today only
 * the Cloudflare rate-limit rejection, which must answer before the app is
 * constructed. Both are serialized from the constants above, and
 * `expectSecurityHeaders` in test/jump.test.ts asserts the two paths stay equal.
 */
export const STANDALONE_HTML_SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': serializeCsp(CONTENT_SECURITY_POLICY),
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': serializePermissionsPolicy(PERMISSIONS_POLICY),
  'Origin-Agent-Cluster': '?1',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': STRICT_TRANSPORT_SECURITY,
  'X-Content-Type-Options': 'nosniff',
  'X-DNS-Prefetch-Control': 'off',
  'X-Download-Options': 'noopen',
  'X-Frame-Options': 'DENY',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'X-XSS-Protection': '0',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
};

/** `defaultSrc: ["'none'"]` -> `default-src 'none'`, joined with `; `. */
function serializeCsp(directives: Readonly<Record<string, readonly string[]>>) {
  return Object.entries(directives)
    .map(([name, values]) => `${kebabCase(name)} ${values.join(' ')}`)
    .join('; ');
}

/** `camera: []` -> `camera=()`, joined with `, `. */
function serializePermissionsPolicy(directives: Readonly<Record<string, readonly string[]>>) {
  return Object.entries(directives)
    .map(([name, values]) => `${kebabCase(name)}=(${values.join(' ')})`)
    .join(', ');
}

function kebabCase(value: string) {
  return value.replaceAll(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

export async function responseHygiene(c: Context, next: Next) {
  await next();
  c.header('Cache-Control', 'no-store');
  c.res.headers.set('Strict-Transport-Security', STRICT_TRANSPORT_SECURITY);
  c.header('X-Robots-Tag', 'noindex, nofollow, noarchive');
  c.res.headers.delete('Set-Cookie');
}

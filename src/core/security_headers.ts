import type { Context, Next } from 'hono';
import { secureHeaders } from 'hono/secure-headers';

export const CUSHION_INLINE_SCRIPT = 'history.replaceState(null,"",location.pathname)';
const CUSHION_INLINE_SCRIPT_SHA256 = '8A+3er73YJf04rRHGhbZwZQACPiiipi9EPduIeAAIDk=';
/** Reveals the splash back button only when there is history to go back to. */
export const SPLASH_INLINE_SCRIPT =
  'if(history.length>1){var b=document.querySelector(".back");b.hidden=false;b.onclick=function(){history.back()}}';
export const SPLASH_INLINE_SCRIPT_SHA256 = 'vPJn6crxETojP3AC1Ba4gei79O4BWnDhKxdJbH8WF/4=';
const STRICT_TRANSPORT_SECURITY = 'max-age=31536000; includeSubDomains; preload';

/** About (and the dormant cushion page) only. Health HTML stays unstyled. */
export const PRODUCT_PAGE_CSS =
  'html{color-scheme:light}body.product{margin:0;min-height:100dvh;display:flex;flex-direction:column;background:#f6f4ef;color:#1c1917;font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic UI","Yu Gothic",YuGothic,system-ui,sans-serif;line-height:1.65}body.product header,body.product footer{padding:1rem 1.25rem}body.product header{border-bottom:1px solid #e4e0d8}body.product header a{color:inherit;text-decoration:none;font-weight:700;letter-spacing:.12em}body.product main{flex:1;width:min(40rem,calc(100% - 2.5rem));margin:2.5rem auto}body.product h1{font-size:clamp(1.5rem,4vw,2rem);line-height:1.25;margin:0 0 1rem}body.product p{margin:0 0 1rem}body.product .lede,body.product .note{color:#57534e}body.product .punycode{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.95rem;word-break:break-all}body.product .punycode{font-weight:400;color:#57534e}body.product [role=alert]{margin:0 0 1rem;padding:.75rem 1rem;background:#fff7ed;border:1px solid #fdba74;color:#9a3412}body.product dl{margin:0 0 1.5rem;padding:1rem 1.15rem;background:#fffdf8;border:1px solid #e4e0d8}body.product dt{font-size:.75rem;color:#78716c;margin:0 0 .15rem}body.product dd{margin:0 0 .85rem;word-break:break-all}body.product dd:last-child{margin-bottom:0}body.product .host{font-size:1.35rem;font-weight:700;line-height:1.3}body.product .actions{display:flex;flex-wrap:wrap;gap:.85rem 1.1rem;align-items:center}body.product .continue{display:inline-block;padding:.75rem 1.15rem;background:#1c1917;color:#f6f4ef;text-decoration:none;font-weight:600}body.product .continue:hover{background:#44403c}body.product .continue:focus{outline:2px solid #1c1917;outline-offset:3px}body.product .home{color:#44403c}body.product footer{margin-top:auto;border-top:1px solid #e4e0d8;color:#78716c;font-size:.875rem}@media (min-width:40rem){body.product header,body.product footer{padding:1.1rem 2rem}}';

export const PRODUCT_PAGE_CSS_SHA256 = 'SvrTGxSKg0ooQsAfgydWs3RKKlGc1l964SIfl9aKeM4=';

/** 400/405/429/5xx splash cards. Distinct from the product reading layout. */
export const SPLASH_PAGE_CSS =
  'html{color-scheme:dark}body.splash{margin:0;min-height:100dvh;display:grid;place-items:center;background:#1c1917;color:#1c1917;font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic UI","Yu Gothic",YuGothic,system-ui,sans-serif;padding:1.25rem}body.splash main{width:min(26rem,100%);box-sizing:border-box;padding:1.25rem 1.5rem 1.75rem;background:#f6f4ef}body.splash .bar{display:grid;grid-template-columns:2.75rem 1fr 2.75rem;align-items:center;margin:0 0 1.25rem}body.splash .brand{grid-column:2;text-align:center;font-size:.75rem;letter-spacing:.14em;font-weight:700;color:#78716c}body.splash .back,body.splash .about{display:grid;place-items:center;box-sizing:border-box;width:2.75rem;height:2.75rem;padding:0;border:1px solid #d6d3d1;border-radius:50%;background:none;color:#44403c;cursor:pointer}body.splash .back{grid-column:1}body.splash .about{grid-column:3}body.splash .back[hidden]{display:none}body.splash .back:hover,body.splash .about:hover{background:#e7e5e4}body.splash .back:focus-visible,body.splash .about:focus-visible{outline:2px solid #1c1917;outline-offset:3px}body.splash h1{font-size:1.25rem;line-height:1.3;margin:0 0 .75rem}body.splash p{margin:0 0 1.25rem;color:#44403c;line-height:1.65}body.splash p:last-child{margin-bottom:0}body.splash .actions{display:flex;justify-content:center}body.splash .primary{display:inline-block;padding:.7rem 1.1rem;background:#1c1917;color:#f6f4ef;text-decoration:none;font-weight:600}body.splash .primary:hover{background:#44403c}body.splash .primary:focus{outline:2px solid #1c1917;outline-offset:3px}';

export const SPLASH_PAGE_CSS_SHA256 = 'cVUKrEkyFCRMl3H8XSMy4ikGbaGhA4Oa4cAbB2xGeQA=';

const CONTENT_SECURITY_POLICY = {
  defaultSrc: ["'none'"],
  baseUri: ["'none'"],
  formAction: ["'none'"],
  frameAncestors: ["'none'"],
  imgSrc: ["'self'"],
  scriptSrc: [
    `'sha256-${CUSHION_INLINE_SCRIPT_SHA256}'`,
    `'sha256-${SPLASH_INLINE_SCRIPT_SHA256}'`,
  ],
  styleSrc: [`'sha256-${PRODUCT_PAGE_CSS_SHA256}'`, `'sha256-${SPLASH_PAGE_CSS_SHA256}'`],
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
    xXssProtection: '0',
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
  c.header('X-XSS-Protection', '0');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'no-referrer');
  c.res.headers.delete('Set-Cookie');
}

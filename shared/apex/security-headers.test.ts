import { Hono } from 'hono';
import { applySecurityHeaders, buildCspHeader } from './security-headers';

describe(buildCspHeader, () => {
  it('returns a CSP header with default style-src', () => {
    const csp = buildCspHeader();

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("style-src 'self'");
    expect(csp).toContain('upgrade-insecure-requests');
  });

  it('accepts a custom style-src value', () => {
    const csp = buildCspHeader("'self' 'unsafe-inline'");

    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  });
});

describe(applySecurityHeaders, () => {
  it('sets all required security headers on the response', async () => {
    const app = new Hono();
    app.use('*', async (c, next) => {
      await next();
      applySecurityHeaders(c);
    });
    app.get('/', (c) => c.text('ok'));

    const res = await app.request('/');

    expect(res.headers.get('strict-transport-security')).toContain('max-age=31536000');
    expect(res.headers.get('strict-transport-security')).toContain('includeSubDomains');
    expect(res.headers.get('strict-transport-security')).toContain('preload');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(res.headers.get('permissions-policy')).toContain('accelerometer=()');
    expect(res.headers.get('permissions-policy')).toContain('camera=()');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
  });
});

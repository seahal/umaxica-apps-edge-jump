import { buildRegionErrorPayload } from '../../src/root-redirect';
import { requestFromApp } from '../utils/request';

const SITE_URL = 'umaxica.app';
const DEFAULT_REGION = 'jp';
const DEFAULT_REGION_URL = `https://${DEFAULT_REGION}.${SITE_URL}/`;

describe('GET /', () => {
  it('redirects to the default region when `ri` is missing', async () => {
    const response = await requestFromApp('/');

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe(DEFAULT_REGION_URL);
  });

  it('redirects to the default region when `ri` is not allowed', async () => {
    const response = await requestFromApp('/?ri=eu');

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe(DEFAULT_REGION_URL);
  });

  it('redirects to the requested region when `ri` is allowed', async () => {
    const response = await requestFromApp('/?ri=us');

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe(`https://us.${SITE_URL}/`);
  });

  it('normalizes the region parameter to lowercase before checking allowlist', async () => {
    const response = await requestFromApp('/?ri=US');

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe(`https://us.${SITE_URL}/`);
  });

  it('applies security headers to redirect responses', async () => {
    const response = await requestFromApp('/');

    expect(response.headers.get('strict-transport-security')).toContain('max-age=31536000');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(response.headers.get('permissions-policy')).toContain('accelerometer=()');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  });

  // セキュリティテスト: オープンリダイレクト対策
  describe('Open Redirect Protection', () => {
    it('rejects region parameter with special characters', async () => {
      const response = await requestFromApp('/?ri=jp.evil.com');

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe(DEFAULT_REGION_URL);
    });

    it('rejects region parameter with URL encoding attempts', async () => {
      const response = await requestFromApp('/?ri=jp%2eevil%2ecom');

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe(DEFAULT_REGION_URL);
    });

    it('rejects region parameter with slashes', async () => {
      const response = await requestFromApp('/?ri=jp/evil');

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe(DEFAULT_REGION_URL);
    });

    it('rejects region parameter with backslashes', async () => {
      const response = await requestFromApp(String.raw`/?ri=jp\evil`);

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe(DEFAULT_REGION_URL);
    });

    it('rejects region parameter with @ symbol', async () => {
      const response = await requestFromApp('/?ri=jp@evil.com');

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe(DEFAULT_REGION_URL);
    });

    it('only redirects to whitelisted URLs for jp region', async () => {
      const response = await requestFromApp('/?ri=jp');

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe(`https://jp.${SITE_URL}/`);
    });

    it('only redirects to whitelisted URLs for us region', async () => {
      const response = await requestFromApp('/?ri=us');

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe(`https://us.${SITE_URL}/`);
    });

    it('rejects empty string as region', async () => {
      const response = await requestFromApp('/?ri=');

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe(DEFAULT_REGION_URL);
    });

    it('rejects numeric region codes', async () => {
      const response = await requestFromApp('/?ri=123');

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe(DEFAULT_REGION_URL);
    });

    it('rejects region parameter with spaces', async () => {
      const response = await requestFromApp('/?ri=jp us');

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe(DEFAULT_REGION_URL);
    });
  });

  // エッジケーステスト
  describe('Edge Cases', () => {
    it('handles multiple query parameters correctly', async () => {
      const response = await requestFromApp('/?ri=us&foo=bar');

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe(`https://us.${SITE_URL}/`);
    });

    it('handles case-insensitive region for jp', async () => {
      const response = await requestFromApp('/?ri=JP');

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe(`https://jp.${SITE_URL}/`);
    });

    it('handles mixed case region codes', async () => {
      const response = await requestFromApp('/?ri=Us');

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe(`https://us.${SITE_URL}/`);
    });
  });

  it('exposes a stable error payload for unsupported regions', () => {
    expect(buildRegionErrorPayload()).toStrictEqual({
      error: 'region_not_supported',
      message: 'Unable to determine a safe redirect target',
    });
  });

  describe('Additional Edge Cases', () => {
    it('handles very long query strings gracefully', async () => {
      const longValue = 'a'.repeat(1000);
      const response = await requestFromApp(`/?ri=${longValue}`);

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe(DEFAULT_REGION_URL);
    });

    it('handles special Unicode characters in region parameter', async () => {
      const response = await requestFromApp('/?ri=日本');

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe(DEFAULT_REGION_URL);
    });

    it('handles null bytes in region parameter', async () => {
      const response = await requestFromApp('/?ri=jp%00evil');

      expect(response.status).toBe(301);
      expect(response.headers.get('location')).toBe(DEFAULT_REGION_URL);
    });

    it('applies HSTS header with includeSubDomains', async () => {
      const response = await requestFromApp('/');

      expect(response.headers.get('strict-transport-security')).toContain('includeSubDomains');
      expect(response.headers.get('strict-transport-security')).toContain('preload');
    });
  });
});

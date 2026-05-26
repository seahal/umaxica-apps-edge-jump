import { requestFromApp } from '../utils/request';

describe('GET /health', () => {
  it('returns OK HTML status page with expected content', async () => {
    const response = await requestFromApp('/health');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');

    const body = await response.text();

    expect(body).toContain('<title>UMAXICA</title>');
    expect(body).toContain('<meta name="robots" content="noindex, nofollow" />');
    expect(body).toContain('<strong>Status:</strong> OK');
    expect(body).toContain('Timestamp:');
    expect(body).not.toContain('<header');
    expect(body).not.toContain('<footer');
  });

  it('uses BRAND_NAME from env in the health page title', async () => {
    const response = await requestFromApp('/health', {}, { BRAND_NAME: 'UMAXCA' });
    const body = await response.text();
    expect(body).toContain('<title>UMAXCA</title>');
  });

  it('applies security headers to HTML responses', async () => {
    const response = await requestFromApp('/health');

    expect(response.headers.get('strict-transport-security')).toContain('max-age=31536000');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('includes valid ISO 8601 timestamp format', async () => {
    const response = await requestFromApp('/health');
    const body = await response.text();

    const timestampMatch = body.match(/Timestamp:<\/strong>\s*([^<]+)/);
    expect(timestampMatch?.[1]).toBeTruthy();

    const timestamp = timestampMatch?.[1];
    if (!timestamp) {
      throw new Error('Timestamp match missing captured value');
    }

    const normalizedTimestamp = timestamp.trim();
    expect(normalizedTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    const date = new Date(normalizedTimestamp);
    expect(date.toString()).not.toBe('Invalid Date');
  });

  it('returns valid HTML structure', async () => {
    const response = await requestFromApp('/health');
    const body = await response.text();

    expect(body).toContain('<html');
    expect(body).toContain('</html>');
    expect(body).toContain('charSet');
    expect(body).toContain('viewport');
  });

  it('includes all required CSP directives', async () => {
    const response = await requestFromApp('/health');
    const csp = response.headers.get('content-security-policy');

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain('upgrade-insecure-requests');
  });
});

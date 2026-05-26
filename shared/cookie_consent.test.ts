import { describe, it, expect, vi, beforeEach, afterEach } from 'vite-plus/test';
import { getCookie } from './cookie';
import { parseConsentedCookie, shouldShowCookieBanner } from './consentState';
import { acceptCookieConsent } from './cookieConsentApi';

describe('Cookie and Consent State', () => {
  describe('getCookie', () => {
    it('returns null if no cookie source is available', () => {
      // @ts-ignore
      const originalDocument = global.document;
      // @ts-ignore
      delete global.document;

      expect(getCookie('test')).toBeNull();

      // @ts-ignore
      global.document = originalDocument;
    });

    it('gets a cookie from a provided string', () => {
      const cookieString = 'name=value; test=true; other=foo';
      expect(getCookie('test', cookieString)).toBe('true');
      expect(getCookie('name', cookieString)).toBe('value');
      expect(getCookie('other', cookieString)).toBe('foo');
    });

    it('returns null if cookie is not found', () => {
      const cookieString = 'name=value; test=true';
      expect(getCookie('missing', cookieString)).toBeNull();
    });

    it('handles encoded characters in cookie values', () => {
      const cookieString = 'test=hello%20world';
      expect(getCookie('test', cookieString)).toBe('hello world');
    });

    it('handles encoded characters in cookie names', () => {
      const cookieString = 'my%20test=value';
      expect(getCookie('my test', cookieString)).toBe('value');
    });

    it('returns null for an empty cookie string', () => {
      expect(getCookie('test', '')).toBeNull();
    });
  });

  describe('parseConsentedCookie', () => {
    it('returns "accepted" for true and "1"', () => {
      expect(parseConsentedCookie('true')).toBe('accepted');
      expect(parseConsentedCookie('1')).toBe('accepted');
    });

    it('returns "denied" for false and "0"', () => {
      expect(parseConsentedCookie('false')).toBe('denied');
      expect(parseConsentedCookie('0')).toBe('denied');
    });

    it('returns "unknown" for other values', () => {
      expect(parseConsentedCookie('maybe')).toBe('unknown');
      expect(parseConsentedCookie(null)).toBe('unknown');
    });
  });

  describe('shouldShowCookieBanner', () => {
    it('returns true if state is not "accepted"', () => {
      expect(shouldShowCookieBanner('denied')).toBe(true);
      expect(shouldShowCookieBanner('unknown')).toBe(true);
    });

    it('returns false if state is "accepted"', () => {
      expect(shouldShowCookieBanner('accepted')).toBe(false);
    });
  });

  describe('acceptCookieConsent', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
      global.fetch = vi.fn<typeof fetch>();
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('successfully accepts cookie consent', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ show_banner: false }),
      } as Response);

      const result = await acceptCookieConsent();
      expect(result).toEqual({ show_banner: false });
      expect(fetch).toHaveBeenCalledWith(
        '/web/v1/cookie',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ consented: true }),
        }),
      );
    });

    it('throws error on non-ok response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);

      await expect(acceptCookieConsent()).rejects.toThrow(
        'Cookie consent update failed with status 500',
      );
    });

    it('throws error on invalid json response (not an object)', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => null,
      } as Response);

      await expect(acceptCookieConsent()).rejects.toThrow('Cookie consent response is invalid');
    });

    it('throws error on invalid json response (missing show_banner)', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);

      await expect(acceptCookieConsent()).rejects.toThrow('Cookie consent response is invalid');
    });
  });
});

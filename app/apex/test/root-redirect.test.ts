import {
  buildRegionErrorPayload,
  getDefaultRedirectUrl,
  resolveRedirectUrl,
} from '../src/root-redirect';

describe('root-redirect utilities', () => {
  describe(resolveRedirectUrl, () => {
    it("returns the correct URL for 'jp' region", () => {
      expect(resolveRedirectUrl('jp')).toBe('https://jp.umaxica.app/');
    });

    it("returns the correct URL for 'us' region", () => {
      expect(resolveRedirectUrl('us')).toBe('https://us.umaxica.app/');
    });

    it('returns the correct URL for uppercase region', () => {
      expect(resolveRedirectUrl('JP')).toBe('https://jp.umaxica.app/');
      expect(resolveRedirectUrl('US')).toBe('https://us.umaxica.app/');
    });

    it('returns null for unsupported region', () => {
      expect(resolveRedirectUrl('eu')).toBeNull();
      expect(resolveRedirectUrl('uk')).toBeNull();
    });

    it('returns null for null input', () => {
      expect(resolveRedirectUrl(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(resolveRedirectUrl(undefined)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(resolveRedirectUrl('')).toBeNull();
    });

    it('returns null for whitespace string', () => {
      expect(resolveRedirectUrl('   ')).toBeNull();
    });
  });

  describe(getDefaultRedirectUrl, () => {
    it('returns the default region URL (jp)', () => {
      expect(getDefaultRedirectUrl()).toBe('https://jp.umaxica.app/');
    });
  });

  describe(buildRegionErrorPayload, () => {
    it('returns the correct error payload structure', () => {
      const payload = buildRegionErrorPayload();
      expect(payload).toStrictEqual({
        error: 'region_not_supported',
        message: 'Unable to determine a safe redirect target',
      });
    });

    it('returns a new object on each call', () => {
      const payload1 = buildRegionErrorPayload();
      const payload2 = buildRegionErrorPayload();
      expect(payload1).not.toBe(payload2);
      expect(payload1).toStrictEqual(payload2);
    });
  });
});

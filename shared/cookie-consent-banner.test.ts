import { describe, expect, it } from 'vitest';
import { CookieConsentBanner } from './CookieConsentBanner';

describe('CookieConsentBanner', () => {
  it('returns a string containing the banner HTML', () => {
    const result = CookieConsentBanner();
    expect(result).toContain('jit-cookie-consent-banner');
    expect(result).toContain('jit-cookie-consent-accept');
    expect(result).toContain('jit-cookie-consent-cancel');
  });

  it('includes accept and cancel buttons', () => {
    const result = CookieConsentBanner();
    expect(result).toContain('Accept');
    expect(result).toContain('Cancel');
  });

  it('includes cookie notice text', () => {
    const result = CookieConsentBanner();
    expect(result).toContain('This site uses cookies');
  });
});

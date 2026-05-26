import { getCookie } from './cookie';

describe('getCookie', () => {
  it('returns a cookie value from an explicit cookie string', () => {
    expect(getCookie('session', 'session=abc123; theme=dark')).toBe('abc123');
  });

  it('returns null when the cookie does not exist', () => {
    expect(getCookie('missing', 'session=abc123; theme=dark')).toBeNull();
  });

  it('falls back to document.cookie when no cookie string is provided', () => {
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      value: 'theme=dark; locale=ja',
    });

    expect(getCookie('locale')).toBe('ja');
  });

  it('decodes encoded cookie names and values', () => {
    expect(getCookie('display name', 'display%20name=Jane%20Doe')).toBe('Jane Doe');
  });
});

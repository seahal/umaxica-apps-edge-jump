import { describe, expect, test } from 'vite-plus/test';
import { buildRegistry } from '../src/config/registry.umaxica';
import { normalizeUrl, validateInternalTarget } from '../src/core/normalize_url';
import { assertDirectPath, isDeniedDomain } from '../src/core/redirect_policy';

const SERVICE_ORIGIN = 'https://jump.umaxica.net';
const target = (path: string) =>
  validateInternalTarget(normalizeUrl(`https://www.umaxica.app${path}`, SERVICE_ORIGIN));

describe('direct pathname security', () => {
  test('direct path helper rejects malformed percent encoding', () => {
    for (const path of ['/%', '/%FF']) expect(() => assertDirectPath(path)).toThrow();
  });
  test.each(['/a//b', '/a/../b', '/a/%2e%2e/b', '/a/%2F/b', '/a/%5c/b', '/a/%25/b', '/a;b'])(
    'rejects %s',
    (path) => expect(() => target(path)).toThrow(),
  );
  test.each([
    '/',
    '/a/',
    '/a/b',
    '/日本語',
    '/a%20b',
    '/authorize?redirect_uri=https%3A%2F%2Fclient.umaxica.com%2Fa%2F%2Fb&state=s&nonce=n',
  ])('accepts %s', (path) => expect(() => target(path)).not.toThrow());
  test.each(['/a%C2%85b', '/a%C2%9Fb'])('rejects Unicode C1 control path %s', (path) =>
    expect(() => target(path)).toThrow(),
  );
});

describe('transfer query boundary', () => {
  test.each([
    'next=/safe',
    'return_to=https%3A%2F%2Fevil.umaxica.com',
    'NEXT%5Bx%5D=a',
    'redirect_uri=https%3A%2F%2Fsub.EXAMPLE.com%2Fcb',
    'redirect_uri=https%3A%2F%2Fexampe.dev%2Fcb',
    'redirect_uri=%2Frelative',
    'redirect_uri=',
    'redirect_uri=http%3A%2F%2Fclient.umaxica.com%2Fcb',
  ])('rejects %s', (query) => expect(() => target(`/authorize?${query}`)).toThrow());

  test.each([
    'javascript:alert(1)',
    'data:text/html,blocked',
    'vbscript:msgbox(1)',
    'about:blank',
    'view-source:https://client.umaxica.com/cb',
    'file:///etc/passwd',
    'blob:https://client.umaxica.com/id',
    'ftp://client.umaxica.com/cb',
    'ws://client.umaxica.com/cb',
    'wss://client.umaxica.com/cb',
    'intent://client.umaxica.com/cb',
    'mailto:user@client.umaxica.com',
  ])('rejects non-whitelisted single-word scheme %s', (value) => {
    const query = `REDIRECT_URI=${encodeURIComponent(value)}`;
    expect(() => target(`/authorize?${query}`)).toThrow();
  });

  test.each([
    'redirect_uri=https%3A%2F%2Fnotexample.com%2Fcb',
    'redirect_uri=com.umaxica.native%3A%2Fcallback',
    'redirect_uri=com.example.my%2Bapp%3A%2Fcallback',
    'post_logout_redirect_uri=com.umaxica.native%3A%2Fcallback',
    'redirect_uri=http%3A%2F%2F127.0.0.1%3A49152%2Fcallback',
    'redirect_uri=http%3A%2F%2F127.0.0.1%2Fcallback',
    'redirect_uri=http%3A%2F%2F%5B%3A%3A1%5D%3A49152%2Fcallback',
    'REDIRECT_URI=https%3A%2F%2Fclient.umaxica.com%2Fcb',
    'state=example.com&nonce=%252F',
    'redirect_uri=https%3A%2F%2Fclient.umaxica.com%2Fa%3Bb%252Fc',
  ])('preserves allowed or opaque query %s', (query) =>
    expect(() => target(`/authorize?${query}`)).not.toThrow(),
  );

  test.each([
    'redirect_uri=https%3A%2F%2Fclient.umaxica.com%2Fcb&REDIRECT_URI=https%3A%2F%2Fclient.umaxica.com%2Fother',
    'state=a&STATE=b',
    'nonce=a&NONCE=b',
    'client_id=a&CLIENT_ID=b',
    'post_logout_redirect_uri=https%3A%2F%2Fclient.umaxica.com%2Fcb&POST_LOGOUT_REDIRECT_URI=https%3A%2F%2Fclient.umaxica.com%2Fother',
    'REDIRECT_URI%5Bx%5D=a',
    'Post_Logout_Redirect_Uri%5Bx%5D=a',
  ])('rejects case-insensitive duplicate or structured parameter %s', (query) =>
    expect(() => target(`/authorize?${query}`)).toThrow(),
  );

  test.each([
    'post_logout_redirect_uri=http%3A%2F%2F127.0.0.1%2Fcallback',
    'redirect_uri=https%3A%2F%2F127.0.0.1%2Fcb',
    'redirect_uri=https%3A%2F%2Fclient.umaxica.com%2Fcb%23x',
    'redirect_uri=https%3A%2F%2Fu%40client.umaxica.com%2Fcb',
    'redirect_uri=https:client.umaxica.com%2Fcb',
    'redirect_uri=https%3A%2F%2F%2Fclient.umaxica.com%2Fcb',
  ])('rejects unsafe or ambiguous OAuth URI %s', (query) =>
    expect(() => target(`/oauth/authorize?${query}`)).toThrow(),
  );
});

describe('host restrictions', () => {
  test.each([
    'example.com',
    'a.example.org',
    'EXAMPLE.NET.',
    'example.dev',
    'example.app',
    'exampe.net',
    'a.exampe.dev',
  ])('denies parsed host %s', (host) => expect(isDeniedDomain(host)).toBe(true));
  test.each(['notexample.com', 'example.com.umaxica.com', 'exampe.devx'])(
    'keeps domain boundary for %s',
    (host) => expect(isDeniedDomain(host)).toBe(false),
  );
  test.each(['https://auth.example.com', 'https://auth.exampe.dev'])(
    'production registry rejects forbidden origin %s',
    (origin) => expect(() => buildRegistry([['auth-app-ww', origin]], [])).toThrow(),
  );
});

test('validateInternalTarget falls back to parsed pathname when raw path is absent', () => {
  const normalized = normalizeUrl('https://www.umaxica.app/path', SERVICE_ORIGIN);
  const { rawPathname: _rawPathname, ...targetWithoutRawPath } = normalized;
  expect(() => validateInternalTarget(targetWithoutRawPath)).not.toThrow();
});

test.each(['/sign/out.json', '/sign/out.html', '/sign/out%2ejson', '/sign/out.xml'])(
  'allows former logout route %s',
  (path) => expect(() => target(path)).not.toThrow(),
);

test.each(['https:client.umaxica.com/cb', 'https:///client.umaxica.com/cb'])(
  'rejects ambiguous OAuth HTTPS spelling %s',
  (value) =>
    expect(() => target(`/oauth/authorize?redirect_uri=${encodeURIComponent(value)}`)).toThrow(),
);

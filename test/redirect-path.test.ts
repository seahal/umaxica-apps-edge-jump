import { describe, expect, test } from 'vitest';
import { normalizeUrl, validateInternalTarget } from '../src/core/normalize_url';
const runtime = { edge: 'cloudflare', production: true } as const;
const target = (path: string) =>
  validateInternalTarget(
    normalizeUrl(`https://www.umaxica.app${path}`, runtime, 'https://jump.umaxica.net'),
  );
describe('direct pathname security', () => {
  test.each(['/a//b', '/a/../b', '/a/%2e%2e/b', '/a/%2F/b', '/a/%5c/b', '/a/%25/b', '/a;b'])(
    'rejects %s',
    (path) => {
      expect(() => target(path)).toThrow();
    },
  );
  test.each([
    '/',
    '/a/',
    '/a/b',
    '/日本語',
    '/a%20b',
    '/authorize?redirect_uri=https%3A%2F%2Fclient.umaxica.com%2Fa%2F%2Fb&state=s&nonce=n',
  ])('accepts %s', (path) => {
    expect(() => target(path)).not.toThrow();
  });
});

describe('transfer query boundary', () => {
  test.each([
    'next=/safe',
    'return_to=https%3A%2F%2Fevil.umaxica.com',
    'NEXT%5Bx%5D=a',
    'redirect_uri=https%3A%2F%2Fsub.EXAMPLE.com%2Fcb',
    'redirect_uri=https%3A%2F%2Fexampe.dev%2Fcb',
    'redirect_uri=javascript%3Aalert(1)',
    'redirect_uri=%2Frelative',
    'redirect_uri=http%3A%2F%2Fclient.umaxica.com%2Fcb',
  ])('rejects %s', (query) => {
    expect(() => target(`/authorize?${query}`)).toThrow();
  });
  test.each([
    'redirect_uri=https%3A%2F%2Fnotexample.com%2Fcb',
    'redirect_uri=com.umaxica.native%3A%2Fcallback',
    'state=example.com&nonce=%252F',
    'redirect_uri=https%3A%2F%2Fclient.umaxica.com%2Fa%3Bb%252Fc',
  ])('preserves %s', (query) => {
    expect(() => target(`/authorize?${query}`)).not.toThrow();
  });
});

import { assertPathAllowed, isDeniedDomain, validatePathRules } from '../src/core/redirect_policy';
describe('static deny policy', () => {
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
    'keeps boundary %s',
    (host) => expect(isDeniedDomain(host)).toBe(false),
  );
  test('origin and segment boundaries and trailing slash', () => {
    const rules = validatePathRules([
      { origin: 'https://www.umaxica.app', pathname: '/foo', mode: 'subtree' },
    ]);
    for (const path of ['/foo', '/foo/', '/foo/bar'])
      expect(() => assertPathAllowed('https://www.umaxica.app', path, rules)).toThrow();
    expect(() => assertPathAllowed('https://www.umaxica.app', '/foobar', rules)).not.toThrow();
    expect(() => assertPathAllowed('https://www.umaxica.com', '/foo', rules)).not.toThrow();
    expect(() => target('/sign/out')).toThrow();
    expect(() => target('/sign/out/edit')).not.toThrow();
  });
  test.each(['http://www.umaxica.app', 'https://www.umaxica.app/'])(
    'rejects policy origin %s',
    (origin) =>
      expect(() => validatePathRules([{ origin, pathname: '/foo', mode: 'exact' }])).toThrow(),
  );
  test.each(['/foo/', '/a/../b', '/a//b'])('rejects policy path %s', (pathname) =>
    expect(() =>
      validatePathRules([{ origin: 'https://www.umaxica.app', pathname, mode: 'exact' }]),
    ).toThrow(),
  );
});

describe('adversarial policy edge cases', () => {
  test.each([
    '/a%3Bb',
    '/sign/%6fut',
    '/sign/out/',
    '/a%00b',
    '/a%7fb',
    '/a/%FF',
    '/a/%',
    '/a/.%2E/b',
    '/a/%2e./b',
  ])('rejects %s', (path) => expect(() => target(path)).toThrow());
  test.each([
    'redirect_uri=http%3A%2F%2F127.0.0.1%3A49152%2Fcallback',
    'redirect_uri=http%3A%2F%2F%5B%3A%3A1%5D%3A49152%2Fcallback',
  ])('preserves native loopback %s', (query) =>
    expect(() => target(`/oauth/authorize?${query}`)).not.toThrow(),
  );
  test.each([
    'redirect_uri%5Bx%5D=a',
    'post_logout_redirect_uri%5Bx%5D=a',
    'state%5Bx%5D=a',
    'redirect_uri=https%3A%2F%2F127.0.0.1%2Fcb',
    'redirect_uri=https%3A%2F%2Fclient.umaxica.com%2Fcb%23x',
    'redirect_uri=https%3A%2F%2Fu%40client.umaxica.com%2Fcb',
  ])('rejects structured OAuth %s', (query) =>
    expect(() => target(`/oauth/authorize?${query}`)).toThrow(),
  );
});

test.each(['/sign/out.json', '/sign/out.html', '/sign/out%2ejson', '/sign/out.xml'])(
  'denies Rails implicit format route %s',
  (path) => expect(() => target(path)).toThrow(),
);

test.each(['/foo?x=1', '/foo#x', '/%66oo'])(
  'rejects ambiguous configured pathname %s',
  (pathname) =>
    expect(() =>
      validatePathRules([{ origin: 'https://www.umaxica.app', pathname, mode: 'exact' }]),
    ).toThrow(),
);
test('root subtree denies only its exact origin', () => {
  const rules = validatePathRules([
    { origin: 'https://www.umaxica.app', pathname: '/', mode: 'subtree' },
  ]);
  expect(() => assertPathAllowed('https://www.umaxica.app', '/anything', rules)).toThrow();
  expect(() => assertPathAllowed('https://www.umaxica.com', '/anything', rules)).not.toThrow();
});

test.each(['/a%C2%85b', '/a%C2%9Fb'])('rejects Unicode C1 control path %s', (path) =>
  expect(() => target(path)).toThrow(),
);

import { buildRegistry } from '../src/config/registry.umaxica';
test.each(['https://auth.example.com', 'https://auth.exampe.dev'])(
  'production registry rejects forbidden origin %s',
  (origin) => expect(() => buildRegistry([['auth-app-ww', origin]], [])).toThrow(),
);

test.each(['https:client.umaxica.com/cb', 'https:///client.umaxica.com/cb'])(
  'rejects ambiguous OAuth HTTPS spelling %s',
  (value) =>
    expect(() => target(`/oauth/authorize?redirect_uri=${encodeURIComponent(value)}`)).toThrow(),
);

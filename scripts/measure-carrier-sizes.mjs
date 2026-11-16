// Synthetic serialization only. No keys, signatures, tokens or query values are emitted.
const jump = 'https://jump.umaxica.net';
const issuer = 'https://www.umaxica.app';
const header = { typ: 'JWT', alg: 'PS256', kid: 'same-kid' };
const claim = {
  schema: 1,
  rpl: 'reuse',
  iss: issuer,
  aud: jump,
  sub: 'jump-redirect',
  iat: 1800000000,
  nbf: 1800000000,
  exp: 1800000030,
  jti: '00000000-0000-4000-8000-000000000000',
  dst: 'internal',
  url: '',
};
const encodedLength = (value) => Buffer.from(JSON.stringify(value)).toString('base64url').length;
// RSA-3072 signatures always occupy 384 bytes, or 512 unpadded base64url characters.
const compactLength = (url, worst = false, outbound = false) =>
  encodedLength({ ...header, ...(worst ? { kid: 'k'.repeat(128) } : {}) }) +
  1 +
  encodedLength({
    ...claim,
    ...(worst ? { jti: 'j'.repeat(128) } : {}),
    ...(outbound ? { iss: jump, aud: 'https://visa.umaxica.app', src: issuer } : {}),
    url,
  }) +
  1 +
  512;
const state = 's'.repeat(700);
const authorizationUrl =
  'https://visa.umaxica.app/oauth/authorize?' +
  [
    'response_type=code',
    'client_id=base-app-client-canary',
    'redirect_uri=https%3a%2f%2fwww.umaxica.app%2fsign%2fcallback',
    `code_challenge=${'C'.repeat(43)}`,
    'code_challenge_method=S256',
    `state=${state}`,
    'nonce=nonce-canary%2Bopaque',
    'scope=openid%20profile+email',
    'ri=ri-canary%2f%2F%7e~',
  ].join('&');
const summarize = (url) => ({
  destination_characters: url.length,
  inbound_rt_characters: compactLength(url),
  inbound_rt_max_kid_jti_characters: compactLength(url, true),
  outbound_rt_characters: compactLength(url, false, true),
  location_characters: url.length + 4 + compactLength(url, false, true),
  url_headroom: 2048 - url.length,
  inbound_rt_headroom: 4096 - compactLength(url),
});
const prefix = 'https://visa.umaxica.app/oauth/authorize?payload=';
process.stdout.write(
  JSON.stringify(
    {
      method: 'ASCII JSON/base64url sizing; RSA-3072 signature fixed at 512 characters',
      authorization: summarize(authorizationUrl),
      destination_sizes: [2048, 3072, 4096].map((length) =>
        summarize(prefix + 'a'.repeat(length - prefix.length)),
      ),
    },
    null,
    2,
  ) + '\n',
);

import { generateKeyPairSync, randomBytes, sign, verify } from 'node:crypto';
import { closeSync, mkdirSync, openSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argumentsAfterSeparator = process.argv.slice(2);
if (argumentsAfterSeparator[0] === '--') argumentsAfterSeparator.shift();
const [outputDirectoryArgument, requestedKid] = argumentsAfterSeparator;

if (!outputDirectoryArgument) {
  // eslint-disable-next-line no-console -- CLI usage belongs on stderr.
  console.error('Usage: pnpm run keys:generate -- <empty-output-directory> [kid]');
  process.exit(2);
}

const outputDirectory = resolve(outputDirectoryArgument);
const localDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: process.env.TZ || 'UTC',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());
const kid = requestedKid || `cloudflare-active-${localDate}-${randomBytes(4).toString('hex')}`;

if (!/^[A-Za-z0-9._-]{1,128}$/.test(kid)) {
  throw new Error('kid must contain only letters, digits, dot, underscore, or hyphen');
}

mkdirSync(outputDirectory, { recursive: false, mode: 0o700 });

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'secp384r1' });
const privatePem = privateKey.export({ format: 'pem', type: 'pkcs8' });
const publicJwk = {
  ...publicKey.export({ format: 'jwk' }),
  kid,
  alg: 'ES384',
  use: 'sig',
};
const jwks = { keys: [publicJwk] };

const probe = randomBytes(48);
const signature = sign('sha384', probe, privateKey);
if (!verify('sha384', probe, publicKey, signature)) {
  throw new Error('generated key pair failed its signing self-check');
}

function writeExclusive(name, value, mode) {
  const path = resolve(outputDirectory, name);
  const descriptor = openSync(path, 'wx', mode);
  try {
    writeFileSync(descriptor, value, { encoding: 'utf8' });
  } finally {
    closeSync(descriptor);
  }
  return path;
}

const privateKeyPath = writeExclusive('private.pem', privatePem, 0o600);
const publicJwksPath = writeExclusive('public-jwks.json', `${JSON.stringify(jwks)}\n`, 0o644);
const secretsPath = writeExclusive(
  'wrangler-secrets.json',
  `${JSON.stringify({ UMAXICA_JUMP_PRIVATE_KEY_PEM: privatePem })}\n`,
  0o600,
);

// eslint-disable-next-line no-console -- output contains metadata and paths only, never key material.
console.log(
  JSON.stringify({
    result: 'ok',
    algorithm: 'ES384',
    curve: 'P-384',
    kid,
    pair_check_ok: true,
    private_key_path: privateKeyPath,
    public_jwks_path: publicJwksPath,
    wrangler_secrets_path: secretsPath,
  }),
);

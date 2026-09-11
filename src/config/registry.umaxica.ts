import type { IssuerRegistry } from '../core/types';

export const registry: IssuerRegistry = {
  'https://auth.umaxica.app': {
    iss: 'https://auth.umaxica.app',
    jwks_uri: 'https://auth.umaxica.app/.well-known/jwks.json',
    allowed_dst_internal: ['https://www.umaxica.app'],
    allowed_dst_external: false,
    revoked_kids: [],
  },
  'https://auth.umaxica.com': {
    iss: 'https://auth.umaxica.com',
    jwks_uri: 'https://auth.umaxica.com/.well-known/jwks.json',
    allowed_dst_internal: ['https://www.umaxica.com'],
    allowed_dst_external: false,
    revoked_kids: [],
  },
  'https://auth.umaxica.org': {
    iss: 'https://auth.umaxica.org',
    jwks_uri: 'https://auth.umaxica.org/.well-known/jwks.json',
    allowed_dst_internal: ['https://www.umaxica.org'],
    allowed_dst_external: false,
    revoked_kids: [],
  },
  'https://www.umaxica.app': {
    iss: 'https://www.umaxica.app',
    jwks_uri: 'https://www.umaxica.app/.well-known/jwks.json',
    allowed_dst_internal: ['https://auth.umaxica.app', 'https://jp.umaxica.app'],
    allowed_dst_external: false,
    revoked_kids: [],
  },
  'https://www.umaxica.com': {
    iss: 'https://www.umaxica.com',
    jwks_uri: 'https://www.umaxica.com/.well-known/jwks.json',
    allowed_dst_internal: ['https://auth.umaxica.com', 'https://jp.umaxica.com'],
    allowed_dst_external: false,
    revoked_kids: [],
  },
  'https://www.umaxica.org': {
    iss: 'https://www.umaxica.org',
    jwks_uri: 'https://www.umaxica.org/.well-known/jwks.json',
    allowed_dst_internal: ['https://auth.umaxica.org', 'https://jp.umaxica.org'],
    allowed_dst_external: false,
    revoked_kids: [],
  },
};

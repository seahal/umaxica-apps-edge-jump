import type { IssuerConfig, IssuerRegistry } from '../core/types';

const TLDS = ['app', 'com', 'org'] as const;

type Tld = (typeof TLDS)[number];

/**
 * Host label and the TLDs the role exists on. Roles are defined once and
 * expanded over app/com/org so the three TLDs cannot drift apart.
 */
const ROLES = {
  auth: { host: 'auth', tlds: TLDS },
  base: { host: 'www', tlds: TLDS },
  side: { host: 'www-jp', tlds: TLDS },
  core: { host: 'jp', tlds: TLDS },
  edit: { host: 'edit', tlds: ['org'] },
  palm: { host: 'palm', tlds: ['app'] },
} as const satisfies Record<string, { host: string; tlds: readonly Tld[] }>;

type Role = keyof typeof ROLES;

/**
 * Only `auth` and `base` are issuers. `auth` may only travel to and from
 * `base`: a round trip between auth and anything other than base is treated as
 * an incident risk, so `auth` <-> `side` / `core` / `edit` / `palm` is absent
 * in both directions by construction.
 */
const ALLOWED_INTERNAL_ROLES = {
  auth: ['base'],
  base: ['auth', 'side', 'core', 'edit', 'palm'],
} as const satisfies Record<string, readonly Role[]>;

type IssuerRole = keyof typeof ALLOWED_INTERNAL_ROLES;

function origin(role: Role, tld: Tld) {
  return `https://${ROLES[role].host}.umaxica.${tld}`;
}

function hasTld(role: Role, tld: Tld) {
  return (ROLES[role].tlds as readonly Tld[]).includes(tld);
}

function issuerConfig(role: IssuerRole, tld: Tld): IssuerConfig {
  const iss = origin(role, tld);
  return {
    iss,
    jwks_uri: `${iss}/.well-known/jwks.json`,
    allowed_dst_internal: ALLOWED_INTERNAL_ROLES[role]
      .filter((dst) => hasTld(dst, tld))
      .map((dst) => origin(dst, tld)),
    allowed_dst_external: false,
    revoked_kids: [],
  };
}

export const registry: IssuerRegistry = Object.fromEntries(
  (['auth', 'base'] as const).flatMap((role) =>
    TLDS.filter((tld) => hasTld(role, tld)).map(
      (tld) => [origin(role, tld), issuerConfig(role, tld)] as const,
    ),
  ),
);

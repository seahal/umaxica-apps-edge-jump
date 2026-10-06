import { normalizeOrigin } from '../core/normalize_url';
import type { IssuerRegistry } from '../core/types';

export type NodeDefinition = readonly [id: string, origin: string];
export type EdgeDefinition = readonly [source: string, destination: string];
const nodes: readonly NodeDefinition[] = [
  ['auth-app-ww', 'https://auth.umaxica.app'],
  ['auth-com-ww', 'https://auth.umaxica.com'],
  ['auth-org-ww', 'https://auth.umaxica.org'],
  ['base-app-ww', 'https://www.umaxica.app'],
  ['base-com-ww', 'https://www.umaxica.com'],
  ['base-org-ww', 'https://www.umaxica.org'],
  ['core-app-jp', 'https://jp.umaxica.app'],
  ['core-com-jp', 'https://jp.umaxica.com'],
  ['core-org-jp', 'https://jp.umaxica.org'],
  ['warp-app-jp', 'https://www-jp.umaxica.app'],
  ['warp-com-jp', 'https://www-jp.umaxica.com'],
  ['warp-org-jp', 'https://www-jp.umaxica.org'],
  ['palm-app-jp', 'https://palm-jp.umaxica.app'],
];
const edges: readonly EdgeDefinition[] = [
  ['auth-app-ww', 'base-app-ww'],
  ['auth-com-ww', 'base-com-ww'],
  ['auth-org-ww', 'base-org-ww'],
  ['base-app-ww', 'auth-app-ww'],
  ['base-app-ww', 'core-app-jp'],
  ['base-app-ww', 'palm-app-jp'],
  ['base-app-ww', 'warp-app-jp'],
  ['base-com-ww', 'auth-com-ww'],
  ['base-com-ww', 'core-com-jp'],
  ['base-com-ww', 'warp-com-jp'],
  ['base-org-ww', 'auth-org-ww'],
  ['base-org-ww', 'core-org-jp'],
  ['base-org-ww', 'warp-org-jp'],
  ['core-app-jp', 'base-app-ww'],
  ['core-com-jp', 'base-com-ww'],
  ['core-org-jp', 'base-org-ww'],
  ['palm-app-jp', 'base-app-ww'],
  ['warp-app-jp', 'base-app-ww'],
  ['warp-com-jp', 'base-com-ww'],
  ['warp-org-jp', 'base-org-ww'],
];

export function buildRegistry(
  nodeTable: readonly NodeDefinition[],
  edgeTable: readonly EdgeDefinition[],
): IssuerRegistry {
  const origins = new Map<string, string>();
  const seenOrigins = new Set<string>();
  // A non-domain identity is sufficient here; no implicit production identity.
  const runtime = { edge: 'cloudflare', production: true } as const;
  for (const [id, origin] of nodeTable) {
    if (!/^[a-z]{4}-[a-z]{3}-[a-z]{2}$/.test(id) || origins.has(id) || seenOrigins.has(origin))
      throw new Error('invalid_node_table');
    normalizeOrigin(origin, runtime, 'https://registry-validation.invalid');
    origins.set(id, origin);
    seenOrigins.add(origin);
  }
  const result: IssuerRegistry = Object.create(null);
  for (const origin of origins.values())
    result[origin] = {
      iss: origin,
      jwks_uri: `${origin}/.well-known/jwks.json`,
      allowed_dst_internal: [],
      revoked_kids: [],
    };
  const seen = new Set<string>();
  for (const [src, dst] of edgeTable) {
    const key = `${src}>${dst}`;
    if (
      !origins.has(src) ||
      !origins.has(dst) ||
      src === dst ||
      src.split('-')[1] !== dst.split('-')[1] ||
      seen.has(key)
    )
      throw new Error('invalid_edge_table');
    seen.add(key);
    const source = origins.get(src);
    const destination = origins.get(dst);
    /* v8 ignore next -- origins were checked when the edge was accepted */
    if (!source || !destination || !result[source]) throw new Error('invalid_edge_table');
    result[source].allowed_dst_internal.push(destination);
  }
  return result;
}
export const registry = buildRegistry(nodes, edges);

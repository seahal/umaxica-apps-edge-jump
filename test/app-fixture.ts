// Explicit test-only DI. Production cannot import or select this fixture.
import { createApp as buildApp, type AppOptions } from '../src';
import { registry } from './fixtures/registry.example';
import jwks from './fixtures/jwks.example.json';
import { normalizeUrl as normalize, normalizeOrigin as origin } from '../src/core/normalize_url';
import { verifyJumpJwt as verify } from '../src/core/verify_jwt';
export const PRODUCTION_SERVICE_ORIGIN = 'https://jump.umaxica.net';
export type { AppOptions };
export function createApp(options: AppOptions = {}) {
  return buildApp({
    registry,
    fetchJwks: async () => jwks,
    jumpJwks: jwks,
    config: { serviceOrigin: PRODUCTION_SERVICE_ORIGIN },
    ...options,
  });
}
export const normalizeUrl = (
  input: string,
  runtime: Parameters<typeof normalize>[1],
  serviceOrigin = PRODUCTION_SERVICE_ORIGIN,
) => normalize(input, runtime, serviceOrigin);
export const normalizeOrigin = (
  input: string,
  runtime: Parameters<typeof normalize>[1],
  serviceOrigin = PRODUCTION_SERVICE_ORIGIN,
) => origin(input, runtime, serviceOrigin);
export const verifyJumpJwt = (
  token: string,
  registry: Parameters<typeof verify>[1],
  cache: Parameters<typeof verify>[2],
  now: number,
  serviceOrigin = PRODUCTION_SERVICE_ORIGIN,
  signal?: AbortSignal,
) => verify(token, registry, cache, now, serviceOrigin, signal);

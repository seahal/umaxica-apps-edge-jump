import { raceAbort, throwIfAborted } from './deadline';
import { importIssuerJwks, type IssuerKeys } from './issuer_jwks';
import { JumpError, type IssuerConfig } from './types';

/** Returns the issuer's JWK Set document; `JwksCache` validates it before use. */
export type FetchJwks = (issuer: IssuerConfig, signal?: AbortSignal) => Promise<unknown>;

export type JwksCacheEvent = {
  issuer: string;
  result: 'hit' | 'miss' | 'negative_hit' | 'refresh' | 'in_flight';
};

type CachedSet = { keys: IssuerKeys; expiresAt: number };

/**
 * Everything kept for one registry issuer. Entries are created only for
 * issuers taken from the static registry, so the number of entries is bounded
 * by the registry and never by request input; no `kid` is ever used as a key.
 */
type IssuerState = {
  set?: CachedSet;
  /** Until then a refresh-dependent request answers `jwks_unavailable` without a fetch. */
  outageUntil: number;
  /** Until then a refresh-dependent request answers `jwks_bad_gateway` without a fetch. */
  badDocumentUntil: number;
  /** Earliest time a forced refresh (unknown kid, failed signature) may fetch again. */
  nextForcedRefreshAt: number;
  inFlight?: Promise<CachedSet>;
};

/**
 * Isolate-local optimization only. Every decision made from a warm entry is the
 * one a cold cache reaches after a successful fetch, so eviction, a cold
 * isolate or routing to another instance changes cost, never the outcome.
 */
export class JwksCache {
  private readonly issuers = new Map<string, IssuerState>();

  constructor(
    private readonly fetchJwks: FetchJwks,
    private readonly ttlMs = 30_000,
    private readonly negativeTtlMs = 30_000,
    private readonly forcedRefreshCooldownMs = 10_000,
    private readonly observe?: (event: JwksCacheEvent) => void,
  ) {}

  /** Number of issuers with state; exposed so tests can pin the bound. */
  get stateSize() {
    return this.issuers.size;
  }

  async getKey(
    issuer: IssuerConfig,
    kid: string,
    forceRefresh = false,
    signal?: AbortSignal,
  ): Promise<CryptoKey> {
    throwIfAborted(signal);
    if (issuer.revoked_kids?.includes(kid)) {
      // Emergency denylist, evaluated before any cache or fetch so a warm entry
      // cannot outlive a revocation. `kid` here equals a configured value.
      // eslint-disable-next-line no-console -- issuer and kid only; no token material.
      console.warn(JSON.stringify({ event: 'jump_revoked_kid_rejected', iss: issuer.iss, kid }));
      throw new JumpError('invalid_signature', 'revoked kid');
    }
    const set = await this.getJwks(issuer, forceRefresh, signal);
    const key = set.keys.get(kid);
    if (key) return key;
    if (!forceRefresh) return this.getKey(issuer, kid, true, signal);
    throw new JumpError('invalid_signature', 'kid not found');
  }

  private stateFor(issuer: IssuerConfig) {
    let state = this.issuers.get(issuer.iss);
    if (!state) {
      state = { outageUntil: 0, badDocumentUntil: 0, nextForcedRefreshAt: 0 };
      this.issuers.set(issuer.iss, state);
    }
    return state;
  }

  private async getJwks(issuer: IssuerConfig, forceRefresh: boolean, signal?: AbortSignal) {
    throwIfAborted(signal);
    const now = Date.now();
    const state = this.stateFor(issuer);
    const cached = state.set && state.set.expiresAt > now ? state.set : undefined;
    // A keyset inside its TTL answers a request that needs no refresh, even
    // during an outage. Past the TTL it is never used: there is no stale-key
    // fallback.
    if (!forceRefresh && cached) {
      this.observe?.({ issuer: issuer.iss, result: 'hit' });
      return cached;
    }
    // From here the caller depends on a refresh. An outage is checked before
    // the cooldown so a warm key is never used to answer it as a 400.
    if (state.outageUntil > now) {
      this.observe?.({ issuer: issuer.iss, result: 'negative_hit' });
      throw new JumpError('jwks_unavailable', 'issuer jwks negative cached');
    }
    if (state.badDocumentUntil > now) {
      this.observe?.({ issuer: issuer.iss, result: 'negative_hit' });
      throw new JumpError('jwks_bad_gateway', 'issuer jwks rejected recently');
    }
    if (forceRefresh && cached && state.nextForcedRefreshAt > now) {
      this.observe?.({ issuer: issuer.iss, result: 'hit' });
      return cached;
    }
    if (state.inFlight) {
      this.observe?.({ issuer: issuer.iss, result: 'in_flight' });
      return raceAbort(state.inFlight, signal);
    }
    if (forceRefresh) {
      // Start the cooldown before fetching so a failing issuer cannot turn
      // every unknown kid or bad signature into another upstream request.
      state.nextForcedRefreshAt = now + this.forcedRefreshCooldownMs;
      this.observe?.({ issuer: issuer.iss, result: 'refresh' });
    } else {
      this.observe?.({ issuer: issuer.iss, result: 'miss' });
    }
    const loading = this.fetchAndCache(issuer, state, now, signal);
    state.inFlight = loading;
    try {
      return await raceAbort(loading, signal);
    } finally {
      delete state.inFlight;
    }
  }

  private async fetchAndCache(
    issuer: IssuerConfig,
    state: IssuerState,
    now: number,
    signal?: AbortSignal,
  ): Promise<CachedSet> {
    try {
      const document = await this.fetchJwks(issuer, signal);
      throwIfAborted(signal);
      const keys = await importIssuerJwks(document);
      throwIfAborted(signal);
      state.outageUntil = 0;
      state.badDocumentUntil = 0;
      const set = { keys, expiresAt: now + this.ttlMs };
      state.set = set;
      return set;
    } catch (error) {
      if (error instanceof JumpError && error.code === 'jwks_unavailable') {
        state.outageUntil = now + this.negativeTtlMs;
      } else if (error instanceof JumpError && error.code === 'jwks_bad_gateway') {
        state.badDocumentUntil = now + this.forcedRefreshCooldownMs;
      }
      throw error;
    }
  }
}

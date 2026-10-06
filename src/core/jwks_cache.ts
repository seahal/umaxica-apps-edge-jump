import { raceAbort, throwIfAborted } from './deadline';
import { importJWK, type JWK } from 'jose';
import { JumpError, type IssuerConfig } from './types';

type CachedSet = {
  keys: JWK[];
  expiresAt: number;
};

export type FetchJwks = (issuer: IssuerConfig, signal?: AbortSignal) => Promise<{ keys: JWK[] }>;

export type JwksCacheEvent = {
  issuer: string;
  result: 'hit' | 'miss' | 'negative_hit' | 'refresh' | 'in_flight';
};

const MAX_KID_NEGATIVE_ENTRIES = 1024;

/**
 * Isolate-local optimization only. Every decision made from a warm entry is the
 * one a cold cache reaches after a successful fetch, so eviction, a cold
 * isolate or routing to another instance changes cost, never the outcome.
 */
export class JwksCache {
  private readonly cache = new Map<string, CachedSet>();
  /**
   * Issuer keyset fetch outages (`jwks_unavailable`), keyed by issuer. Issuers
   * come only from the registry, so this map is bounded by it and never evicts.
   */
  private readonly issuerFetchNegative = new Map<string, number>();
  /**
   * Unknown `iss:kid` pairs. `kid` is attacker-chosen, so this map is bounded
   * and evicts; it is kept apart so a flood cannot evict an outage entry.
   */
  private readonly kidNegative = new Map<string, number>();
  private readonly inFlight = new Map<string, Promise<CachedSet>>();
  private readonly nextForcedRefresh = new Map<string, number>();

  constructor(
    private readonly fetchJwks: FetchJwks,
    private readonly ttlMs = 30_000,
    private readonly negativeTtlMs = 30_000,
    private readonly forcedRefreshCooldownMs = 10_000,
    private readonly observe?: (event: JwksCacheEvent) => void,
  ) {}

  async getKey(
    issuer: IssuerConfig,
    kid: string,
    alg: string,
    forceRefresh = false,
    signal?: AbortSignal,
  ): ReturnType<typeof importJWK> {
    throwIfAborted(signal);
    if (issuer.revoked_kids?.includes(kid)) {
      // Emergency denylist, evaluated before any cache or fetch so a warm entry
      // cannot outlive a revocation. Logged because a hit means either an
      // attacker replaying a retired key or a rotation that shipped wrong —
      // both need to be visible. `iss` and `kid` are already permitted fields.
      // eslint-disable-next-line no-console -- issuer and kid only; no token material.
      console.warn(JSON.stringify({ event: 'jump_revoked_kid_rejected', iss: issuer.iss, kid }));
      throw new JumpError('invalid_signature', 'revoked kid');
    }
    const negKey = `${issuer.iss}:${kid}`;
    const now = Date.now();
    if (!forceRefresh) {
      const negativeExpiry = this.kidNegative.get(negKey);
      if (negativeExpiry && negativeExpiry > now) {
        this.observe?.({ issuer: issuer.iss, result: 'negative_hit' });
        throw new JumpError('invalid_signature', 'kid negative cached');
      }
      if (negativeExpiry) this.kidNegative.delete(negKey);
    }

    const jwks = await this.getJwks(issuer, forceRefresh, signal);
    const jwk = jwks.keys.find((key) => key.kid === kid && key.alg === alg);
    if (!jwk) {
      if (!forceRefresh) return this.getKey(issuer, kid, alg, true, signal);
      this.rememberKidNegative(negKey, now);
      throw new JumpError('invalid_signature', 'kid not found');
    }
    throwIfAborted(signal);
    try {
      return await raceAbort(importJWK(jwk, alg), signal);
    } catch (error) {
      /* v8 ignore next -- deadline abort racing the import */
      if (error instanceof JumpError) throw error;
      throw new JumpError('jwks_bad_gateway', 'issuer jwk rejected');
    }
  }

  private rememberKidNegative(key: string, now: number) {
    if (this.kidNegative.size >= MAX_KID_NEGATIVE_ENTRIES) {
      for (const [cachedKey, expiry] of this.kidNegative) {
        if (expiry <= now) this.kidNegative.delete(cachedKey);
      }
    }
    while (this.kidNegative.size >= MAX_KID_NEGATIVE_ENTRIES) {
      const oldest = this.kidNegative.keys().next().value;
      /* v8 ignore next -- the loop condition guarantees a key */
      if (oldest === undefined) break;
      this.kidNegative.delete(oldest);
    }
    this.kidNegative.set(key, now + this.negativeTtlMs);
  }

  private async getJwks(issuer: IssuerConfig, forceRefresh: boolean, signal?: AbortSignal) {
    throwIfAborted(signal);
    const now = Date.now();
    const cached = this.cache.get(issuer.iss);
    // A keyset inside its TTL answers a request that needs no refresh, even
    // while the issuer is negative cached: a failed refresh says nothing about
    // keys already fetched. This is not a stale-key fallback; past the TTL the
    // entry is ignored and the outage below decides.
    if (!forceRefresh && cached && cached.expiresAt > now) {
      this.observe?.({ issuer: issuer.iss, result: 'hit' });
      return cached;
    }
    // From here the caller depends on a refresh (no usable keyset, unknown
    // kid, or a failed signature). During an outage that is a dependency
    // failure, checked before the cooldown so a warm key is never used to
    // answer it as an invalid signature.
    const fetchNegative = this.issuerFetchNegative.get(issuer.iss);
    if (fetchNegative && fetchNegative > now) {
      this.observe?.({ issuer: issuer.iss, result: 'negative_hit' });
      throw new JumpError('jwks_unavailable', 'issuer jwks negative cached');
    }
    if (fetchNegative) this.issuerFetchNegative.delete(issuer.iss);
    if (
      forceRefresh &&
      cached &&
      cached.expiresAt > now &&
      (this.nextForcedRefresh.get(issuer.iss) ?? 0) > now
    ) {
      this.observe?.({ issuer: issuer.iss, result: 'hit' });
      return cached;
    }

    const existing = this.inFlight.get(issuer.iss);
    if (existing) {
      this.observe?.({ issuer: issuer.iss, result: 'in_flight' });
      return raceAbort(existing, signal);
    }

    if (forceRefresh) {
      // Start the cooldown before fetching so a failed issuer response cannot
      // turn every invalid signature into another immediate upstream request.
      this.nextForcedRefresh.set(issuer.iss, now + this.forcedRefreshCooldownMs);
      this.observe?.({ issuer: issuer.iss, result: 'refresh' });
    } else {
      this.observe?.({ issuer: issuer.iss, result: 'miss' });
    }
    const loading = this.fetchAndCache(issuer, now, signal);
    this.inFlight.set(issuer.iss, loading);
    try {
      return await raceAbort(loading, signal);
    } finally {
      this.inFlight.delete(issuer.iss);
    }
  }

  private async fetchAndCache(issuer: IssuerConfig, now: number, signal?: AbortSignal) {
    try {
      const next = await this.fetchJwks(issuer, signal);
      throwIfAborted(signal);
      this.issuerFetchNegative.delete(issuer.iss);
      const cachedSet = { keys: next.keys, expiresAt: now + this.ttlMs };
      this.cache.set(issuer.iss, cachedSet);
      return cachedSet;
    } catch (error) {
      if (error instanceof JumpError && error.code === 'jwks_unavailable') {
        this.issuerFetchNegative.set(issuer.iss, now + this.negativeTtlMs);
      }
      throw error;
    }
  }
}

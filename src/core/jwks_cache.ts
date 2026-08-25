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

export class JwksCache {
  private readonly cache = new Map<string, CachedSet>();
  private readonly negative = new Map<string, number>();
  private readonly inFlight = new Map<string, Promise<CachedSet>>();
  private readonly nextForcedRefresh = new Map<string, number>();

  constructor(
    private readonly fetchJwks: FetchJwks,
    private readonly ttlMs = 300_000,
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
    if (!forceRefresh && (this.negative.get(negKey) ?? 0) > now) {
      this.observe?.({ issuer: issuer.iss, result: 'negative_hit' });
      throw new JumpError('invalid_signature', 'kid negative cached');
    }

    const jwks = await this.getJwks(issuer, forceRefresh, signal);
    const jwk = jwks.keys.find((key) => key.kid === kid && key.alg === alg);
    if (!jwk) {
      if (!forceRefresh) return this.getKey(issuer, kid, alg, true, signal);
      this.negative.set(negKey, now + this.negativeTtlMs);
      throw new JumpError('invalid_signature', 'kid not found');
    }
    throwIfAborted(signal);
    try {
      return await raceAbort(importJWK(jwk, alg), signal);
    } catch (error) {
      if (error instanceof JumpError) throw error;
      throw new JumpError('jwks_bad_gateway', 'issuer jwk rejected');
    }
  }

  private async getJwks(issuer: IssuerConfig, forceRefresh: boolean, signal?: AbortSignal) {
    throwIfAborted(signal);
    const now = Date.now();
    const cached = this.cache.get(issuer.iss);
    if (!forceRefresh && cached && cached.expiresAt > now) {
      this.observe?.({ issuer: issuer.iss, result: 'hit' });
      return cached;
    }
    if (forceRefresh && cached && (this.nextForcedRefresh.get(issuer.iss) ?? 0) > now) {
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
    const next = await this.fetchJwks(issuer, signal);
    throwIfAborted(signal);
    const cachedSet = { keys: next.keys, expiresAt: now + this.ttlMs };
    this.cache.set(issuer.iss, cachedSet);
    return cachedSet;
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new JumpError('deadline_exceeded', 'request deadline exceeded');
}

async function raceAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  throwIfAborted(signal);
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new JumpError('deadline_exceeded', 'request deadline exceeded'));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

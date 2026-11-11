import { assertDefined } from './assert-defined';
import { describe, expect, test, vi } from 'vite-plus/test';
import { exportJWK, generateKeyPair } from 'jose';
import { fetchRegistryJwks } from '../src/core/fetch_jwks';
import { JwksCache } from '../src/core/jwks_cache';
import { raceAbort } from '../src/core/deadline';
import { normalizeUrl } from '../src/core/normalize_url';
import type { IssuerConfig } from '../src/core/types';
const issuer: IssuerConfig = {
  iss: 'https://auth.umaxica.app',
  jwks_uri: 'https://auth.umaxica.app/.well-known/jwks.json',
  allowed_dst_internal: ['https://www.umaxica.app'],
};
describe('K: cancellation and isolated caches', () => {
  test('aborted JWKS stream cancels reader and releases its lock', async () => {
    let cancelled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull() {},
      cancel() {
        cancelled++;
      },
    });
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(body, { headers: { 'content-type': 'application/json' } }));
    const controller = new AbortController();
    const pending = fetchRegistryJwks(issuer, controller.signal);
    await Promise.resolve();
    controller.abort();
    try {
      await expect(pending).rejects.toMatchObject({ code: 'deadline_exceeded' });
      expect(cancelled).toBe(1);
      expect(body.locked).toBe(false);
    } finally {
      fetch.mockRestore();
    }
  });
  test('one cancelled caller leaves the shared fetch available to waiters', async () => {
    const pair = await generateKeyPair('PS256', { modulusLength: 3072 });
    const keys = [{ ...(await exportJWK(pair.publicKey)), kid: 'k', alg: 'PS256', use: 'sig' }];
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const cache = new JwksCache(async (_, signal) => {
      calls++;
      await raceAbort(gate, signal);
      return { keys };
    });
    const first = new AbortController();
    const waiting = cache.getKey(issuer, 'k', false, first.signal);
    const other = cache.getKey(issuer, 'k');
    first.abort();
    await expect(waiting).rejects.toMatchObject({ code: 'deadline_exceeded' });
    const later = cache.getKey(issuer, 'k');
    release();
    await expect(other).resolves.toBeDefined();
    await expect(later).resolves.toBeDefined();
    await expect(cache.getKey(issuer, 'k')).resolves.toBeDefined();
    expect(calls).toBe(1);
  });
  test('shared fetching has an independent deadline and caches upstream timeouts', async () => {
    const fetch = vi.fn(async () => new Promise<unknown>(() => {}));
    const cache = new JwksCache(fetch);
    await expect(cache.getKey(issuer, 'k')).rejects.toMatchObject({ code: 'jwks_unavailable' });
    await expect(cache.getKey(issuer, 'k')).rejects.toMatchObject({ code: 'jwks_unavailable' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  test('a revoked kid is rejected before a warm key is used', async () => {
    const pair = await generateKeyPair('PS256', { modulusLength: 3072 });
    const fetch = vi.fn(async () => ({
      keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k', alg: 'PS256', use: 'sig' }],
    }));
    const cache = new JwksCache(fetch);
    await cache.getKey(issuer, 'k');
    await expect(cache.getKey({ ...issuer, revoked_kids: ['k'] }, 'k')).rejects.toMatchObject({
      code: 'invalid_signature',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  test('same issuer/kid in independent keyset caches does not mix', async () => {
    const a = await generateKeyPair('PS256', { modulusLength: 3072 });
    const b = await generateKeyPair('PS256', { modulusLength: 3072 });
    const caches = await Promise.all(
      [a, b].map(
        async (pair) =>
          new JwksCache(async () => ({
            keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'same', alg: 'PS256', use: 'sig' }],
          })),
      ),
    );
    const ka = await assertDefined(caches[0]).getKey(issuer, 'same');
    const kb = await assertDefined(caches[1]).getKey(issuer, 'same');
    expect(await exportJWK(ka)).not.toEqual(await exportJWK(kb));
  });
  test('invalid escaped control/UTF8 URL partitions reject before signing', () => {
    for (const input of [
      'https://www.umaxica.app/%00',
      'https://www.umaxica.app/?x=%0A',
      'https://www.umaxica.app/%C0%AF',
    ])
      expect(() =>
        normalizeUrl(input, { edge: 'cloudflare', production: true }, 'https://jump.umaxica.net'),
      ).toThrow();
  });
});

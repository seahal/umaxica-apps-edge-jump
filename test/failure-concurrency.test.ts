import { assertDefined } from './assert-defined';
import { describe, expect, test, vi } from 'vitest';
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
  allowed_dst_external: false,
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
  test('one cancelled single-flight fails closed for waiters then recovers', async () => {
    const pair = await generateKeyPair('ES384');
    const keys = [{ ...(await exportJWK(pair.publicKey)), kid: 'k', alg: 'ES384', use: 'sig' }];
    let calls = 0;
    const cache = new JwksCache(async (_, signal) => {
      calls++;
      if (calls === 1) await raceAbort(new Promise(() => {}), signal);
      return { keys };
    });
    const first = new AbortController();
    const waiting = cache.getKey(issuer, 'k', 'ES384', false, first.signal);
    const other = cache.getKey(issuer, 'k', 'ES384');
    first.abort();
    await expect(waiting).rejects.toMatchObject({ code: 'deadline_exceeded' });
    await expect(other).rejects.toMatchObject({ code: 'deadline_exceeded' });
    await expect(cache.getKey(issuer, 'k', 'ES384')).resolves.toBeDefined();
    expect(calls).toBe(2);
  });
  test('a revoked kid is rejected before a warm key is used', async () => {
    const pair = await generateKeyPair('ES384');
    const fetch = vi.fn(async () => ({
      keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k', alg: 'ES384', use: 'sig' }],
    }));
    const cache = new JwksCache(fetch);
    await cache.getKey(issuer, 'k', 'ES384');
    await expect(
      cache.getKey({ ...issuer, revoked_kids: ['k'] }, 'k', 'ES384'),
    ).rejects.toMatchObject({ code: 'invalid_signature' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  test('same issuer/kid in independent keyset caches does not mix', async () => {
    const a = await generateKeyPair('ES384');
    const b = await generateKeyPair('ES384');
    const caches = await Promise.all(
      [a, b].map(
        async (pair) =>
          new JwksCache(async () => ({
            keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'same', alg: 'ES384', use: 'sig' }],
          })),
      ),
    );
    const ka = await assertDefined(caches[0]).getKey(issuer, 'same', 'ES384');
    const kb = await assertDefined(caches[1]).getKey(issuer, 'same', 'ES384');
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

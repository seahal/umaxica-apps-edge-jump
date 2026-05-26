import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { GET } from '../../src/app/health/route';

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: vi
    .fn<() => { env: { REVISION: { id: string; tag: string; timestamp: string } } }>()
    .mockReturnValue({
      env: {
        REVISION: {
          id: 'test-id',
          tag: 'test-tag',
          timestamp: '2024-01-01T00:00:00.000Z',
        },
      },
    }),
}));

describe('app/core health route', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns OK JSON status with expected content', async () => {
    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store, no-cache, must-revalidate');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(json).toEqual({
      status: 'ok',
      timestamp: '2024-01-01T00:00:00.000Z',
      version: {
        id: 'test-id',
        tag: 'test-tag',
        timestamp: '2024-01-01T00:00:00.000Z',
      },
    });
  });

  it('returns error JSON status when Date.toISOString throws', async () => {
    vi.spyOn(Date.prototype, 'toISOString').mockImplementationOnce(() => {
      throw new Error('Date error');
    });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store, no-cache, must-revalidate');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');

    expect(json).toEqual({
      status: 'error',
      timestamp: expect.any(String),
    });
  });

  it('returns OK status even when Cloudflare context is missing', async () => {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    vi.mocked(getCloudflareContext).mockReturnValueOnce(
      {} as unknown as ReturnType<typeof getCloudflareContext>,
    );

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      status: 'ok',
      timestamp: '2024-01-01T00:00:00.000Z',
      version: {
        id: undefined,
        tag: undefined,
        timestamp: undefined,
      },
    });
  });
});

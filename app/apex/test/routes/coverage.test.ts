import { describe, it, expect, vi } from 'vite-plus/test';
// @ts-ignore
import app from '../../src/index';

describe('app/apex/src/index.tsx coverage', () => {
  it('returns 404 text when ASSETS is missing in notFound', async () => {
    const res = await app.request('/nonexistent-404', {}, {});
    expect(res.status).toBe(404);
    const text = await res.text();
    expect(text).toBe('Not Found');
  });

  it('handles health check error and hits onError catch block', async () => {
    // To trigger health check error outside the try-catch block in index.tsx
    const isoSpy = vi.spyOn(Date.prototype, 'toISOString').mockImplementation(() => {
      throw new Error('ISO String error');
    });

    // Mock console.error to avoid noise in tests
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Pass an empty env object to avoid "Cannot read properties of undefined (reading 'ASSETS')"
    const res = await app.request('/health', {}, {});
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toBe('Bad Request');

    expect(consoleSpy).toHaveBeenCalledWith('Unhandled apex error', expect.any(Object));
    expect(consoleSpy).toHaveBeenCalledWith(
      'ASSETS binding is missing for 400 fallback',
      expect.any(Object),
    );

    isoSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('handles health check error and hits onError with ASSETS', async () => {
    const isoSpy = vi.spyOn(Date.prototype, 'toISOString').mockImplementation(() => {
      throw new Error('ISO String error');
    });

    const env = {
      ASSETS: {
        fetch: async (_request: Request) => {
          return new Response('Mock 400 Page', { status: 200 });
        },
      },
    };

    const res = await app.request('/health', {}, env);
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toBe('Mock 400 Page');

    isoSpy.mockRestore();
  });

  it('handles notFound when assetRes.status is not 404', async () => {
    const env = {
      ASSETS: {
        fetch: async (_request: Request) => {
          const url = new URL(_request.url);
          if (url.pathname === '/found-asset') {
            return new Response('Asset found', { status: 200 });
          }
          return new Response('Not Found', { status: 404 });
        },
      },
    };

    const res = await app.request('/found-asset', {}, env);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe('Asset found');
  });

  it('handles notFound when assetRes.status is 404 and fallback ASSETS works', async () => {
    const env = {
      ASSETS: {
        fetch: async (_request: Request) => {
          const url = new URL(_request.url);
          if (url.pathname === '/404.html') {
            return new Response('Custom 404 Page', { status: 200 });
          }
          return new Response('Not Found', { status: 404 });
        },
      },
    };

    const res = await app.request('/missing-asset', {}, env);
    expect(res.status).toBe(404);
    const text = await res.text();
    expect(text).toBe('Custom 404 Page');
  });
});

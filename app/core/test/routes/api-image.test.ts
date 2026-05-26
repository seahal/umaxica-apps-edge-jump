import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { NextRequest } from 'next/server';
import { GET } from '../../src/app/api/image/route';

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: vi
    .fn<() => { env: Record<string, unknown> }>()
    .mockReturnValue({ env: {} }),
}));

describe('app/core /api/image GET', () => {
  const fetchMock = vi.fn<typeof fetch>();
  let originalAllowedImageHosts: string | undefined;
  let originalNextPublicAppUrl: string | undefined;

  beforeEach(() => {
    originalAllowedImageHosts = process.env.ALLOWED_IMAGE_HOSTS;
    originalNextPublicAppUrl = process.env.NEXT_PUBLIC_APP_URL;
    process.env.ALLOWED_IMAGE_HOSTS = 'images.unsplash.com';
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.umaxica.app';
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    fetchMock.mockReset();
    if (originalAllowedImageHosts === undefined) {
      delete process.env.ALLOWED_IMAGE_HOSTS;
    } else {
      process.env.ALLOWED_IMAGE_HOSTS = originalAllowedImageHosts;
    }
    if (originalNextPublicAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = originalNextPublicAppUrl;
    }
    vi.unstubAllGlobals();
  });

  it('returns 200 on the happy path (fallback when IMAGES binding is absent)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
        status: 200,
        headers: {
          'content-type': 'image/png',
          'set-cookie': 'session=upstream',
          'x-upstream-header': 'not-forwarded',
        },
      }),
    );

    const request = new NextRequest(
      'https://app.umaxica.app/api/image?url=https%3A%2F%2Fimages.unsplash.com%2Fa.png&w=100&q=80',
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.has('set-cookie')).toBe(false);
    expect(response.headers.has('x-upstream-header')).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith('https://images.unsplash.com/a.png', {
      redirect: 'manual',
    });
  });

  it('does not trust the incoming request origin as an image fetch target', async () => {
    const request = new NextRequest(
      'https://127.0.0.1/api/image?url=https%3A%2F%2F127.0.0.1%2Fa.png&w=100&q=80',
    );
    const response = await GET(request);

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects invalid transform parameters before fetching the source image', async () => {
    const request = new NextRequest(
      'https://app.umaxica.app/api/image?url=https%3A%2F%2Fimages.unsplash.com%2Fa.png&w=5000&q=80',
    );
    const response = await GET(request);

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects oversized source images', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
        status: 200,
        headers: {
          'content-length': String(10 * 1024 * 1024 + 1),
          'content-type': 'image/png',
        },
      }),
    );

    const request = new NextRequest(
      'https://app.umaxica.app/api/image?url=https%3A%2F%2Fimages.unsplash.com%2Fa.png&w=100&q=80',
    );
    const response = await GET(request);

    expect(response.status).toBe(413);
  });

  it('rejects unsupported upstream content types', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('<svg><script>alert(1)</script></svg>', {
        status: 200,
        headers: { 'content-type': 'image/svg+xml' },
      }),
    );

    const request = new NextRequest(
      'https://app.umaxica.app/api/image?url=https%3A%2F%2Fimages.unsplash.com%2Fa.svg&w=100&q=80',
    );
    const response = await GET(request);

    expect(response.status).toBe(415);
  });
});

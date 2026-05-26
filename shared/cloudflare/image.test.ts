import { describe, expect, it } from 'vite-plus/test';
import {
  DEFAULT_ALLOWED_IMAGE_HOSTS,
  MAX_IMAGE_SOURCE_BYTES,
  buildProxiedImageHeaders,
  getAllowedImageContentType,
  isAllowedImageSourceSize,
  parseImageTransformOptions,
  validateImageUrl,
} from './image';

describe('shared/cloudflare/image', () => {
  it('resolves relative urls against the request url', () => {
    expect(validateImageUrl('/logo.png', 'https://example.com/app')).toBe(
      'https://example.com/logo.png',
    );
  });

  it('allows same-origin absolute urls', () => {
    expect(validateImageUrl('https://example.com/logo.png', 'https://example.com/app')).toBe(
      'https://example.com/logo.png',
    );
  });

  it('allows explicitly configured hostnames', () => {
    expect(
      validateImageUrl(
        'https://images.unsplash.com/photo-1.jpg',
        'https://example.com/app',
        'images.unsplash.com, avatars.githubusercontent.com',
      ),
    ).toBe('https://images.unsplash.com/photo-1.jpg');
  });

  it('allows default external image hostnames', () => {
    expect(
      validateImageUrl('https://avatars.githubusercontent.com/u/1', 'https://example.com/app'),
    ).toBe('https://avatars.githubusercontent.com/u/1');
    expect(DEFAULT_ALLOWED_IMAGE_HOSTS).toContain('avatars.githubusercontent.com');
  });

  it('rejects disallowed hostnames', () => {
    expect(
      validateImageUrl('https://evil.example/image.png', 'https://example.com/app'),
    ).toBeNull();
  });

  it('rejects non-http schemes', () => {
    expect(validateImageUrl('data:image/png;base64,abc', 'https://example.com/app')).toBeNull();
  });

  it('rejects embedded credentials', () => {
    expect(
      validateImageUrl('https://user:pass@example.com/logo.png', 'https://example.com/app'),
    ).toBeNull();
  });

  it('rejects private or reserved ip literals even when explicitly allowed', () => {
    expect(validateImageUrl('http://127.0.0.1/logo.png', 'https://example.com/app')).toBeNull();
    expect(
      validateImageUrl('http://192.168.1.10/logo.png', 'https://example.com/app', '192.168.1.10'),
    ).toBeNull();
    expect(validateImageUrl('http://[::1]/logo.png', 'https://example.com/app')).toBeNull();
  });

  it('parses bounded image transform options', () => {
    expect(parseImageTransformOptions('1200', '85')).toEqual({ width: 1200, quality: 85 });
    expect(parseImageTransformOptions(null, null)).toEqual({});
  });

  it('rejects invalid image transform options', () => {
    expect(parseImageTransformOptions('0', '85')).toBeNull();
    expect(parseImageTransformOptions('4097', '85')).toBeNull();
    expect(parseImageTransformOptions('1200.5', '85')).toBeNull();
    expect(parseImageTransformOptions('1200', '0')).toBeNull();
    expect(parseImageTransformOptions('1200', '101')).toBeNull();
  });

  it('allows image source sizes at or below the maximum', () => {
    expect(isAllowedImageSourceSize(null)).toBe(true);
    expect(isAllowedImageSourceSize(String(MAX_IMAGE_SOURCE_BYTES))).toBe(true);
  });

  it('rejects image source sizes above the maximum or malformed values', () => {
    expect(isAllowedImageSourceSize(String(MAX_IMAGE_SOURCE_BYTES + 1))).toBe(false);
    expect(isAllowedImageSourceSize('10.5')).toBe(false);
  });

  it('allows only safe raster image content types', () => {
    expect(getAllowedImageContentType('image/png')).toBe('image/png');
    expect(getAllowedImageContentType('image/jpeg; charset=binary')).toBe('image/jpeg');
    expect(getAllowedImageContentType('image/svg+xml')).toBeNull();
    expect(getAllowedImageContentType('text/html')).toBeNull();
    expect(getAllowedImageContentType(null)).toBeNull();
  });

  it('builds proxied image headers without upstream-controlled headers', () => {
    const headers = buildProxiedImageHeaders('image/png');

    expect(headers.get('content-type')).toBe('image/png');
    expect(headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(headers.get('x-content-type-options')).toBe('nosniff');
    expect(headers.has('set-cookie')).toBe(false);
  });
});

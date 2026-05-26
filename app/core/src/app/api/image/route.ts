import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import {
  DEFAULT_ALLOWED_IMAGE_HOSTS,
  IMAGE_RESPONSE_CACHE_CONTROL,
  buildProxiedImageHeaders,
  getAllowedImageContentType,
  isAllowedImageSourceSize,
  isAllowedImageFetchTarget,
  parseImageTransformOptions,
  validateImageUrl,
} from '../../../../../../shared/cloudflare/image';

/**
 * Image transformation API route using Cloudflare Images binding.
 * This route is used by next/image via the custom loader in src/image-loader.ts.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const width = searchParams.get('w');
  const quality = searchParams.get('q');

  if (!url) {
    return new NextResponse('Missing url parameter', { status: 400 });
  }

  const allowedHosts = process.env.ALLOWED_IMAGE_HOSTS ?? DEFAULT_ALLOWED_IMAGE_HOSTS;
  const options = parseImageTransformOptions(width, quality);
  if (!options) {
    return new NextResponse('Invalid image transform parameter', { status: 400 });
  }

  const trustedBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const validatedUrl = validateImageUrl(url, trustedBaseUrl, allowedHosts);
  if (!validatedUrl) {
    return new NextResponse('Invalid or disallowed url parameter', { status: 400 });
  }
  if (!isAllowedImageFetchTarget(validatedUrl, trustedBaseUrl, allowedHosts)) {
    return new NextResponse('Invalid or disallowed url parameter', { status: 400 });
  }

  // Fetch the source image
  const sourceImage = await fetch(validatedUrl, { redirect: 'manual' });
  if (!sourceImage.ok) {
    return new NextResponse('Failed to fetch source image', { status: sourceImage.status });
  }

  if (!sourceImage.body) {
    return new NextResponse('Source image body is empty', { status: 500 });
  }
  if (!isAllowedImageSourceSize(sourceImage.headers.get('content-length'))) {
    return new NextResponse('Source image is too large', { status: 413 });
  }
  const sourceContentType = getAllowedImageContentType(sourceImage.headers.get('content-type'));
  if (!sourceContentType) {
    return new NextResponse('Source image content type is not supported', { status: 415 });
  }

  const { env } = getCloudflareContext() as { env: CloudflareEnv };

  // If IMAGES binding is missing (e.g. local dev without binding configured),
  // fallback to returning the original image.
  if (!env.IMAGES) {
    return new NextResponse(sourceImage.body, {
      headers: buildProxiedImageHeaders(sourceContentType),
    });
  }

  try {
    // Transform using Cloudflare Images binding
    // oxlint-disable-next-line typescript-eslint/no-explicit-any
    const image = (env.IMAGES as any).input(sourceImage.body);

    image.transform(options);

    // Default to webp for optimization
    const output = await image.output({ format: 'image/webp' });

    return new NextResponse(output.body, {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': IMAGE_RESPONSE_CACHE_CONTROL,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    // oxlint-disable-next-line no-console
    console.error('Image transformation failed:', error);
    // Fallback to original image on transformation error
    return new NextResponse(sourceImage.body, {
      headers: buildProxiedImageHeaders(sourceContentType),
    });
  }
}

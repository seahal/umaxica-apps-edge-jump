'use client';

/**
 * Custom loader for Next.js Image component to utilize Cloudflare Images binding.
 * Routes image requests through our /api/image worker endpoint.
 */
export default function cloudflareLoader({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}) {
  const params = new URLSearchParams();
  params.set('url', src);
  params.set('w', width.toString());
  if (quality) {
    params.set('q', quality.toString());
  }
  return `/api/image?${params.toString()}`;
}

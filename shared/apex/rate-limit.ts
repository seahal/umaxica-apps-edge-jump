export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export async function checkRateLimit(
  request: Request,
  rateLimiter: RateLimiter | undefined,
): Promise<Response | null> {
  if (!rateLimiter) return null;
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const { success } = await rateLimiter.limit({ key: ip });
  if (!success) {
    return new Response('Too Many Requests', { status: 429 });
  }
  return null;
}

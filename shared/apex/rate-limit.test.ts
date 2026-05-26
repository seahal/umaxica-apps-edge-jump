import { vi, describe, it, expect } from 'vite-plus/test';
import { checkRateLimit } from './rate-limit';

describe(checkRateLimit, () => {
  it('returns null when rateLimiter is undefined', async () => {
    const request = new Request('http://localhost/');
    const result = await checkRateLimit(request, undefined);
    expect(result).toBeNull();
  });

  it('returns null when rate limit check succeeds', async () => {
    const request = new Request('http://localhost/', {
      headers: { 'cf-connecting-ip': '192.168.1.1' },
    });
    const mockRateLimiter = {
      limit: vi.fn().mockResolvedValue({ success: true }),
    };
    const result = await checkRateLimit(request, mockRateLimiter);
    expect(result).toBeNull();
    expect(mockRateLimiter.limit).toHaveBeenCalledWith({ key: '192.168.1.1' });
  });

  it('returns 429 response when rate limit is exceeded', async () => {
    const request = new Request('http://localhost/', {
      headers: { 'cf-connecting-ip': '192.168.1.1' },
    });
    const mockRateLimiter = {
      limit: vi.fn().mockResolvedValue({ success: false }),
    };
    const result = await checkRateLimit(request, mockRateLimiter);
    expect(result).not.toBeNull();
    expect(result?.status).toBe(429);
    expect(await result?.text()).toBe('Too Many Requests');
  });

  it('uses "unknown" as fallback IP when cf-connecting-ip is missing', async () => {
    const request = new Request('http://localhost/');
    const mockRateLimiter = {
      limit: vi.fn().mockResolvedValue({ success: true }),
    };
    await checkRateLimit(request, mockRateLimiter);
    expect(mockRateLimiter.limit).toHaveBeenCalledWith({ key: 'unknown' });
  });
});

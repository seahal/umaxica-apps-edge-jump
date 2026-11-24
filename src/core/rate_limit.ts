export type RateLimiter = {
  limit(options: { key: string }): Promise<unknown>;
};

export type RateLimiterSource = RateLimiter | null | ((env: object) => RateLimiter | null);

/** Keep IPv4 addresses intact and group IPv6 clients by their /64 prefix. */
export function clientRateLimitKey(value: string | null | undefined): string | null {
  if (!value || /[\s[\]/\\?#@%]/.test(value)) return null;
  if (!value.includes(':')) {
    const octets = value.split('.');
    return octets.length === 4 &&
      octets.every((part) => /^(0|[1-9][0-9]{0,2})$/.test(part) && Number(part) <= 255)
      ? value
      : null;
  }

  try {
    const hostname = new URL(`https://[${value}]`).hostname;
    const [leftText, rightText = ''] = hostname.slice(1, -1).split('::');
    const left = leftText ? leftText.split(':') : [];
    const right = rightText ? rightText.split(':') : [];
    const groups = [...left, ...Array(8 - left.length - right.length).fill('0'), ...right];
    const prefix = groups
      .slice(0, 4)
      .map((group) => Number.parseInt(group, 16).toString(16))
      .join(':');
    return `${prefix}::/64`;
  } catch {
    return null;
  }
}

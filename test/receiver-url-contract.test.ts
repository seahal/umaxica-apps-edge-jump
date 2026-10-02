import { describe, expect, test } from 'vitest';
import { isRtKey, normalizeUrl, validateInternalTarget } from '../src/core/normalize_url';
import contract from './fixtures/receiver-contract.json';

// Normative WHATWG fixture evaluation only; this is not a Rails receiver or E2E.
const runtime = { edge: 'cloudflare', production: true } as const;
const jump = 'https://jump.umaxica.net';
function matchesSignedUrl(requestUrl: string, signedUrl: string) {
  try {
    const request = new URL(requestUrl);
    if (request.searchParams.getAll('rt').length !== 1) return false;
    if ([...request.searchParams.keys()].some((name) => name !== 'rt' && isRtKey(name)))
      return false;
    request.searchParams.delete('rt');
    const target = validateInternalTarget(normalizeUrl(request.href, runtime, jump));
    // Output signed URLs already use URLSearchParams serialization.
    return target.href === signedUrl;
  } catch {
    return false;
  }
}

describe('normative receiver URL fixtures (no receiver acceptance claim)', () => {
  test.each(contract.url_cases)('$name', ({ request_url, signed_url, accepted }) => {
    expect(matchesSignedUrl(request_url, signed_url)).toBe(accepted);
  });
  test('service and structural TTL inventory', () => {
    expect(contract.service_version).toBe('0.3.0');
    expect(contract.schema).toBe(1);
    expect(contract.rpl).toBe('reuse');
    expect(contract.inbound_max_ttl_seconds).toBe(30);
    expect(contract.ttl_seconds).toBe(30);
    expect(contract.clock_tolerance_seconds).toBe(5);
  });
});

export type ConsentState = 'accepted' | 'denied' | 'unknown';

export function parseConsentedCookie(value: string | null): ConsentState {
  if (value === 'true' || value === '1') {
    return 'accepted';
  }

  if (value === 'false' || value === '0') {
    return 'denied';
  }

  return 'unknown';
}

export function shouldShowCookieBanner(state: ConsentState): boolean {
  return state !== 'accepted';
}

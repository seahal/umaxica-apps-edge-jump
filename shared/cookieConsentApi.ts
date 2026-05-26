type AcceptCookieConsentResponse = {
  show_banner: boolean;
};

export async function acceptCookieConsent(): Promise<AcceptCookieConsentResponse> {
  const response = await fetch('/web/v1/cookie', {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ consented: true }),
  });

  if (!response.ok) {
    throw new Error(`Cookie consent update failed with status ${response.status}`);
  }

  const payload: unknown = await response.json();
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('Cookie consent response is invalid');
  }

  const data = payload as Record<string, unknown>;
  if (typeof data.show_banner !== 'boolean') {
    throw new Error('Cookie consent response is invalid');
  }

  return { show_banner: data.show_banner };
}

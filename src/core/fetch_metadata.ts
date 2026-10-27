/**
 * Request-context check for `/?rt=`, which is only ever a top-level document
 * navigation.
 *
 * Defense in depth, not authentication or authorization. A request that sends
 * no Fetch Metadata at all (a non-browser client, or a browser without support)
 * is accepted, so absence proves nothing. Once any `Sec-Fetch-*` header is
 * present the request must be a coherent top-level navigation: `Site`, `Mode`
 * and `Dest` all present, `Mode: navigate`, `Dest: document`, a defined `Site`
 * value, and `User` absent or `?1`. Anything partial, unknown or malformed fails
 * closed. `Sec-Fetch-User` is not required: redirect- and script-initiated
 * navigations are the normal way to reach Jump.
 */

const FETCH_METADATA_HEADERS = [
  'Sec-Fetch-Site',
  'Sec-Fetch-Mode',
  'Sec-Fetch-Dest',
  'Sec-Fetch-User',
] as const;

const SITE_VALUES = new Set(['cross-site', 'same-origin', 'same-site', 'none']);

/**
 * Headers sent only with speculative loads: `Sec-Purpose` (prefetch, and
 * prerender as `prefetch;prerender`), Turbo's `X-Sec-Purpose: prefetch`, and
 * the legacy `Purpose`/`X-Purpose`/`X-Moz` prefetch markers. None of them is
 * defined for a real navigation, so any value — including an unknown or
 * malformed one — is rejected rather than interpreted.
 */
const SPECULATIVE_HEADERS = ['Sec-Purpose', 'X-Sec-Purpose', 'Purpose', 'X-Purpose', 'X-Moz'];

export function isNonNavigationRequest(headers: Headers): boolean {
  if (SPECULATIVE_HEADERS.some((name) => headers.has(name))) return true;
  if (!FETCH_METADATA_HEADERS.some((name) => headers.has(name))) return false;
  const site = headers.get('Sec-Fetch-Site');
  const user = headers.get('Sec-Fetch-User');
  return (
    site === null ||
    !SITE_VALUES.has(site) ||
    headers.get('Sec-Fetch-Mode') !== 'navigate' ||
    headers.get('Sec-Fetch-Dest') !== 'document' ||
    (user !== null && user !== '?1')
  );
}

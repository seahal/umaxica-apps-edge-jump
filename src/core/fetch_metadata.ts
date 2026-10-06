/**
 * Request-context check for `/?rt=`, which is only ever a top-level navigation.
 *
 * Defense in depth, not authentication or authorization: only browsers send
 * these headers, so absence is accepted, and per the Fetch Metadata
 * specification a value that is not currently defined is ignored rather than
 * repaired or guessed at. `Sec-Fetch-Site` and `Sec-Fetch-User` are
 * deliberately not consulted — cross-site and script- or redirect-initiated
 * navigations are the normal way to reach Jump.
 */

// Fetch Standard request modes other than `navigate`.
const NON_NAVIGATION_MODES = new Set([
  'cors',
  'no-cors',
  'same-origin',
  'websocket',
  'webtransport',
]);

// Fetch Standard request destinations other than `document`; the empty
// destination is serialized as `empty`.
const NON_DOCUMENT_DESTINATIONS = new Set([
  'empty',
  'audio',
  'audioworklet',
  'embed',
  'font',
  'frame',
  'iframe',
  'image',
  'json',
  'manifest',
  'object',
  'paintworklet',
  'report',
  'script',
  'serviceworker',
  'sharedworker',
  'style',
  'text',
  'track',
  'video',
  'webidentity',
  'worker',
  'xslt',
]);

// RFC 8941 structured field syntax, limited to what a list of tokens needs.
const TOKEN = "[A-Za-z*][A-Za-z0-9!#$%&'*+.^_`|~:/-]*";
const BARE_ITEM = `(?:${TOKEN}|-?[0-9]{1,15}(?:\\.[0-9]{1,3})?|\\?[01]|"(?:[\\x20-\\x21\\x23-\\x5b\\x5d-\\x7e]|\\\\["\\\\])*")`;
const PARAMETERS = `(?:; *[a-z*][a-z0-9_.*-]*(?:=${BARE_ITEM})?)*`;
const MEMBER = `(${TOKEN})${PARAMETERS}`;
const TOKEN_LIST = new RegExp(`^${MEMBER}(?:[ \\t]*,[ \\t]*${MEMBER})*$`);
const LIST_MEMBER = new RegExp(`(?:^|,)[ \\t]*${MEMBER}`, 'g');

/**
 * `Sec-Purpose: prefetch` marks speculative loads; prerendering sends the same
 * token with a `prerender` parameter, so the token alone covers both. Fetch
 * mode and destination cannot tell a prerender from a real navigation.
 */
function isSpeculative(purpose: string) {
  if (!TOKEN_LIST.test(purpose)) return false;
  for (const member of purpose.matchAll(LIST_MEMBER)) if (member[1] === 'prefetch') return true;
  return false;
}

export function isNonNavigationRequest(headers: Headers): boolean {
  const mode = headers.get('Sec-Fetch-Mode');
  if (mode !== null && NON_NAVIGATION_MODES.has(mode)) return true;
  const destination = headers.get('Sec-Fetch-Dest');
  if (destination !== null && NON_DOCUMENT_DESTINATIONS.has(destination)) return true;
  const purpose = headers.get('Sec-Purpose');
  return purpose !== null && isSpeculative(purpose);
}

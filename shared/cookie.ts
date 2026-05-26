export function getCookie(name: string, cookieString?: string): string | null {
  const source = cookieString ?? (typeof document === 'undefined' ? '' : document.cookie);

  if (!source) {
    return null;
  }

  const encodedName = `${encodeURIComponent(name)}=`;
  const cookies = source.split(';');

  for (const cookie of cookies) {
    const trimmed = cookie.trim();
    if (trimmed.startsWith(encodedName)) {
      return decodeURIComponent(trimmed.slice(encodedName.length));
    }
  }

  return null;
}

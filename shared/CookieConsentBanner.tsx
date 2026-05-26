const BANNER_ID = 'jit-cookie-consent-banner';
const ACCEPT_BUTTON_ID = 'jit-cookie-consent-accept';
const CANCEL_BUTTON_ID = 'jit-cookie-consent-cancel';

export const COOKIE_CONSENT_BANNER_SCRIPT_PATH = '/cookie-consent-banner.js';

export function CookieConsentBanner(): string {
  return `<aside id="${BANNER_ID}" hidden style="position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;border:1px solid #d1d5db;border-radius:8px;padding:16px;background:#ffffff;box-shadow:0 10px 20px rgba(0,0,0,0.1);font-family:ui-sans-serif,system-ui,sans-serif;">
  <p style="margin:0 0 12px 0;line-height:1.5;">This site uses cookies to improve your experience.</p>
  <div style="display:flex;gap:8px;justify-content:flex-end;">
    <button id="${CANCEL_BUTTON_ID}" type="button" style="padding:8px 12px;border:1px solid #d1d5db;border-radius:6px;background:#ffffff;cursor:pointer;">Cancel</button>
    <button id="${ACCEPT_BUTTON_ID}" type="button" style="padding:8px 12px;border:1px solid #111827;border-radius:6px;background:#111827;color:#ffffff;cursor:pointer;">Accept</button>
  </div>
</aside>`;
}

import type { Child } from 'hono/jsx';
import { raw } from 'hono/html';
import { renderToString } from 'hono/jsx/dom/server';
import { PRODUCTION_SERVICE_ORIGIN } from './types';
import { messages, type Locale } from './i18n';
import type { NormalizedUrl } from './normalize_url';
import { CUSHION_INLINE_SCRIPT, PRODUCT_PAGE_CSS, SPLASH_PAGE_CSS } from './security_headers';

type PageProps = {
  pageTitle?: string;
  locale: Locale;
  children: Child;
  now?: Date;
  product?: boolean;
  splash?: boolean;
};

export type SplashKind = 'invalid' | 'rate' | 'unavailable';

const BRAND_NAME = 'UMAXICA';

/**
 * UMAXICA title contract brand, derived from the user-facing FQDN so it cannot
 * drift from the deployment: https://jump.umaxica.net -> "UMAXICA (NET)".
 */
const BRAND = `${BRAND_NAME} (${brandTld(PRODUCTION_SERVICE_ORIGIN)})`;

/** Root: "UMAXICA (NET)". Page: "About — UMAXICA (NET)" (separator is EM DASH). */
export function brandTitle(pageTitle?: string) {
  const page = pageTitle?.trim();
  return page ? `${page} — ${BRAND}` : BRAND;
}

function brandTld(origin: string) {
  const labels = new URL(origin).hostname.split('.');
  return String(labels[labels.length - 1]).toUpperCase();
}

export function renderAboutPage(
  locale: Locale = 'ja',
  serviceOrigin: string = PRODUCTION_SERVICE_ORIGIN,
  now = new Date(),
) {
  const t = messages[locale];
  return renderDocument({
    pageTitle: t.aboutPageTitle,
    locale,
    now,
    product: true,
    children: (
      <main>
        <h1>{t.aboutTitle}</h1>
        <p>{t.aboutDescription}</p>
        <p class="origin">{serviceOrigin}</p>
      </main>
    ),
  });
}

export function renderHealthPage(
  entries: Array<[string, string | boolean | null | undefined]>,
  locale: Locale = 'ja',
  now = new Date(),
) {
  const t = messages[locale];
  return renderDocument({
    pageTitle: t.healthTitle,
    locale,
    now,
    children: (
      <main>
        <h1>{t.healthOk}</h1>
        <dl>
          {entries.map(([key, value]) => (
            <>
              <dt>{key}</dt>
              <dd>{displayValue(value)}</dd>
            </>
          ))}
        </dl>
      </main>
    ),
  });
}

export function renderErrorPage(locale: Locale = 'ja', now = new Date()) {
  return renderSplashPage('invalid', locale, now);
}

export function renderRateLimitPage(locale: Locale = 'ja', now = new Date()) {
  return renderSplashPage('rate', locale, now);
}

export function renderUnavailablePage(locale: Locale = 'ja', now = new Date()) {
  return renderSplashPage('unavailable', locale, now);
}

export function renderSplashPage(kind: SplashKind, locale: Locale = 'ja', now = new Date()) {
  const t = messages[locale];
  const copy =
    kind === 'rate'
      ? { title: t.rateLimitTitle, heading: t.rateLimitTitle, body: t.rateLimitBody }
      : kind === 'unavailable'
        ? { title: t.unavailableTitle, heading: t.unavailableHeading, body: t.unavailableBody }
        : { title: t.errorTitle, heading: t.errorHeading, body: t.errorBody };
  return renderDocument({
    pageTitle: copy.title,
    locale,
    now,
    splash: true,
    children: (
      <main>
        <p class="brand">UMAXICA</p>
        <h1>{copy.heading}</h1>
        <p>{copy.body}</p>
        <p class="actions">
          {kind === 'invalid' ? (
            <>
              <a class="primary" href="/about">
                {t.aboutCta}
              </a>
              <a class="secondary reload" href="">
                {t.reload}
              </a>
            </>
          ) : (
            <>
              <a class="primary reload" href="">
                {t.reload}
              </a>
              <a class="secondary" href="/about">
                {t.aboutCta}
              </a>
            </>
          )}
        </p>
      </main>
    ),
  });
}

export function renderCushionPage(target: NormalizedUrl, locale: Locale = 'ja', now = new Date()) {
  const t = messages[locale];
  const displayUrl = truncate(target.href, 180);
  const showPunycode = target.hasNonAsciiHostname && target.unicodeHostname !== target.hostname;
  return renderDocument({
    pageTitle: t.cushionTitle,
    locale,
    now,
    product: true,
    children: (
      <>
        <main>
          <h1>{t.cushionTitle}</h1>
          <p class="lede">{t.cushionHint}</p>
          {target.hasNonAsciiHostname ? <p role="alert">{t.nonAsciiWarning}</p> : null}
          <dl>
            <dt>{t.host}</dt>
            <dd class="host">{showPunycode ? target.unicodeHostname : target.hostname}</dd>
            {showPunycode ? (
              <>
                <dt>{t.punycode}</dt>
                <dd class="punycode">{target.hostname}</dd>
              </>
            ) : null}
            <dt>{t.url}</dt>
            <dd>{displayUrl}</dd>
          </dl>
          <p class="note">{t.cushionReloadNote}</p>
          <p class="actions">
            <a class="continue" href={target.href} rel="noopener noreferrer">
              {t.continue}
            </a>
            <a class="home" href="/about">
              {t.aboutCta}
            </a>
          </p>
        </main>
        <script>{raw(CUSHION_INLINE_SCRIPT)}</script>
      </>
    ),
  });
}

function renderDocument({
  pageTitle,
  locale,
  children,
  now = new Date(),
  product = false,
  splash = false,
}: PageProps) {
  const pageStyle = product ? PRODUCT_PAGE_CSS : splash ? SPLASH_PAGE_CSS : null;
  const bodyClass = product ? 'product' : splash ? 'splash' : undefined;
  const document = (
    <html lang={locale}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <meta name="robots" content="noindex,nofollow,noarchive" />
        <title>{brandTitle(pageTitle)}</title>
        {pageStyle ? <style>{raw(pageStyle)}</style> : null}
      </head>
      <body class={bodyClass}>
        {splash ? null : (
          <header>
            <a href="/">UMAXICA</a>
          </header>
        )}
        {children}
        {splash ? null : <footer>© {now.getUTCFullYear()} UMAXICA</footer>}
      </body>
    </html>
  );
  return `<!doctype html>${renderToString(document)}`;
}

function displayValue(value: string | boolean | null | undefined) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}

/** @jsxImportSource hono/jsx */
import { createMiddleware } from 'hono/factory';
import type { Child } from 'hono/jsx';
import { buildBrandTitle, type BrandTitleOptions } from './title';

export type OpenGraphMeta = {
  title?: string;
  description?: string;
  type?: string;
  url?: string;
  image?: string;
};

export type TwitterMeta = {
  card?: string;
  site?: string;
};

export type Meta = {
  title?: string;
  pageTitle?: string;
  description?: string;
  canonical?: string;
  robots?: string;
  og?: OpenGraphMeta;
  twitter?: TwitterMeta;
};

type MetaContext = {
  get: (key: unknown) => unknown;
  set: (key: unknown, value: unknown) => void;
};

function toNonEmptyTrimmed(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function withMeta(meta: Meta) {
  return createMiddleware(async (c, next) => {
    setMeta(c, meta);
    await next();
  });
}

export function setMeta(c: MetaContext, meta: Meta): void {
  c.set('meta', meta);
}

export function getMeta(c: MetaContext, defaultMeta?: Meta): Meta | undefined {
  const meta = c.get('meta');
  return (meta as Meta | undefined) ?? defaultMeta;
}

type SeoHeadProps = {
  c: MetaContext;
  brand: BrandTitleOptions;
  defaultMeta?: Meta;
};

export function SeoHead({ c, brand, defaultMeta }: SeoHeadProps) {
  const meta = getMeta(c, defaultMeta);
  const og = meta?.og;
  const twitter = meta?.twitter;
  const title = toNonEmptyTrimmed(meta?.title) ?? buildBrandTitle(meta?.pageTitle, brand);
  const description = toNonEmptyTrimmed(meta?.description);
  const canonical = toNonEmptyTrimmed(meta?.canonical);
  const robots = toNonEmptyTrimmed(meta?.robots);
  const twitterCard = toNonEmptyTrimmed(twitter?.card) ?? 'summary_large_image';

  return (
    <>
      <title>{title}</title>
      {description ? <meta name="description" content={description} /> : null}
      {canonical ? <link rel="canonical" href={canonical} /> : null}
      {robots ? <meta name="robots" content={robots} /> : null}

      {toNonEmptyTrimmed(og?.title) ? <meta property="og:title" content={og?.title} /> : null}
      {toNonEmptyTrimmed(og?.description) ? (
        <meta property="og:description" content={og?.description} />
      ) : null}
      {toNonEmptyTrimmed(og?.type) ? <meta property="og:type" content={og?.type} /> : null}
      {toNonEmptyTrimmed(og?.url) ? <meta property="og:url" content={og?.url} /> : null}
      {toNonEmptyTrimmed(og?.image) ? <meta property="og:image" content={og?.image} /> : null}

      <meta name="twitter:card" content={twitterCard} />
      {toNonEmptyTrimmed(twitter?.site) ? (
        <meta name="twitter:site" content={twitter?.site} />
      ) : null}
    </>
  );
}

type LayoutProps = {
  c: MetaContext;
  brand: BrandTitleOptions;
  defaultMeta?: Meta;
  children: Child;
  lang?: string;
};

export function Layout({ c, brand, defaultMeta, children, lang = 'ja' }: LayoutProps) {
  const seoHeadProps = defaultMeta ? { c, brand, defaultMeta } : { c, brand };

  return (
    <html lang={lang}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <SeoHead {...seoHeadProps} />
      </head>
      <body>{children}</body>
    </html>
  );
}

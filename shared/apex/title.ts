export const DEFAULT_BRAND_NAME = 'Umaxica';
export const DEFAULT_BRAND_SEPARATOR = ' | ';

export type BrandTitleOptions = {
  brandName: string;
  separator?: string;
  defaultPageTitle?: string;
};

type ContextWithEnv = {
  env?: Record<string, unknown>;
};

function toNonEmptyTrimmed(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveSeparator(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  return value.trim().length > 0 ? value : undefined;
}

export function brandFromEnv(c: ContextWithEnv | null | undefined): BrandTitleOptions {
  const env = c?.env ?? {};
  const defaultPageTitle = toNonEmptyTrimmed(env.BRAND_DEFAULT_TITLE);

  // Cloudflare Workers vars:
  // - BRAND_NAME
  // - BRAND_SEPARATOR
  // - BRAND_DEFAULT_TITLE (optional)
  return {
    brandName: toNonEmptyTrimmed(env.BRAND_NAME) ?? DEFAULT_BRAND_NAME,
    separator: resolveSeparator(env.BRAND_SEPARATOR) ?? DEFAULT_BRAND_SEPARATOR,
    ...(defaultPageTitle ? { defaultPageTitle } : {}),
  };
}

export function buildBrandTitle(
  pageTitle: string | null | undefined,
  opt: BrandTitleOptions,
): string {
  const brandName = toNonEmptyTrimmed(opt.brandName) ?? DEFAULT_BRAND_NAME;
  const separator = resolveSeparator(opt.separator) ?? DEFAULT_BRAND_SEPARATOR;
  const page = toNonEmptyTrimmed(pageTitle) ?? toNonEmptyTrimmed(opt.defaultPageTitle);

  return page ? `${brandName}${separator}${page}` : brandName;
}

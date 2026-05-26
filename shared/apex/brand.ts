export const DEFAULT_BRAND_NAME = 'UMAXICA';

type BrandEnv = {
  BRAND_NAME?: string;
};

export function getBrandName(env?: BrandEnv): string {
  return env?.BRAND_NAME || DEFAULT_BRAND_NAME;
}

const SITE_URL = 'umaxica.app';

const allowedUrls = {
  jp: `https://jp.${SITE_URL}/`,
  us: `https://us.${SITE_URL}/`,
} as const;

type AllowedRegion = keyof typeof allowedUrls;

const DEFAULT_REGION: AllowedRegion = 'jp';

export const resolveRedirectUrl = (regionParam: string | null | undefined) => {
  const normalizedRegion = regionParam?.toLowerCase() ?? '';
  return allowedUrls[normalizedRegion as AllowedRegion] ?? null;
};

export const getDefaultRedirectUrl = () => allowedUrls[DEFAULT_REGION] ?? null;

export const buildRegionErrorPayload = () => ({
  error: 'region_not_supported',
  message: 'Unable to determine a safe redirect target',
});

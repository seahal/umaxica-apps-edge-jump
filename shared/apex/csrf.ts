import { csrf } from 'hono/csrf';

const PRODUCTION_APEX_ORIGIN = /^https:\/\/umaxica\.(com|org|app|net)$/;
const LOCAL_APEX_ORIGIN = /^http:\/\/(com|org|app|net)\.localhost(?::\d+)?$/;
const PREVIEW_APEX_ORIGIN = /^https:\/\/[\w-]+\.[\w-]+\.workers\.dev$/;

export const isAllowedApexOrigin = (origin?: string): boolean => {
  if (!origin) {
    return false;
  }

  return (
    PRODUCTION_APEX_ORIGIN.test(origin) ||
    LOCAL_APEX_ORIGIN.test(origin) ||
    PREVIEW_APEX_ORIGIN.test(origin)
  );
};

export const apexCsrf = csrf({
  origin: (origin) => isAllowedApexOrigin(origin),
});

import { SERVICE, type RuntimeInfo } from './types';
import { type Locale } from './i18n';
import { renderHealthPage } from './page';

/**
 * The published service version, never the deployment revision: `/health*` is
 * unauthenticated, and the Cloudflare version id identifies one specific
 * deployment. The revision still keys the isolate caches in `cloudflare.ts`;
 * it is simply not something an anonymous caller needs.
 */
export function healthJson(runtime: RuntimeInfo, now = new Date()) {
  return {
    status: 'OK',
    service: SERVICE.name,
    version: SERVICE.version,
    edge: runtime.edge,
    time: now.toISOString(),
  };
}

export function wantsJson(accept: string | null) {
  return accept?.includes('application/json') || false;
}

export function renderHealthHtml(runtime: RuntimeInfo, locale: Locale = 'ja') {
  const h = healthJson(runtime);
  return renderHealthPage(Object.entries(h), locale);
}

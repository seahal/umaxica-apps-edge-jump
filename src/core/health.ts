import { SERVICE, type RuntimeInfo } from './types';
import { escapeHtml } from './escape';

export function healthJson(runtime: RuntimeInfo, now = new Date()) {
  return {
    ok: true,
    service: SERVICE.name,
    version: runtime.version === undefined ? SERVICE.version : runtime.version,
    edge: runtime.edge,
    time: now.toISOString(),
  };
}

export function wantsJson(accept: string | null) {
  return accept?.includes('application/json') || false;
}

export function renderHealthHtml(runtime: RuntimeInfo) {
  const h = healthJson(runtime);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>Jump health</title>
</head>
<body>
<main>
<h1>OK</h1>
<dl>
<dt>edge</dt><dd>${escapeHtml(h.edge)}</dd>
<dt>version</dt><dd>${escapeHtml(h.version)}</dd>
</dl>
</main>
</body>
</html>`;
}

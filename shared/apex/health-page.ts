import { getBrandName } from './brand';
import type { AssetEnv } from './security-headers';

const HEALTH_ROBOTS_HEADER = 'noindex, nofollow';

function buildHealthPageHtml(brandName: string, timestampIso: string): string {
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${brandName}</title>
    <meta name="robots" content="${HEALTH_ROBOTS_HEADER}" />
    <link href="/src/style.css" rel="stylesheet" />
  </head>
  <body class="min-h-screen flex flex-col bg-gray-50">
    <main class="flex-grow max-w-7xl w-full mx-auto px-4 py-8">
      <div class="space-y-4">
        <p><strong>Status:</strong> OK</p>
        <p><strong>Timestamp:</strong> ${timestampIso}</p>
      </div>
    </main>
  </body>
</html>`;
}

function buildHealthErrorHtml(brandName: string, timestampIso: string): string {
  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${brandName}</title>
    <meta name="robots" content="${HEALTH_ROBOTS_HEADER}" />
  </head>
  <body>
    <main>
      <p>status: error</p>
      <p>timestamp: ${timestampIso}</p>
    </main>
  </body>
</html>`;
}

export function renderHealthPage(env: AssetEnv): Response {
  const timestampIso = new Date().toISOString();
  const brandName = getBrandName(env);

  try {
    return new Response(buildHealthPageHtml(brandName, timestampIso), {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=UTF-8',
        'X-Robots-Tag': HEALTH_ROBOTS_HEADER,
      },
    });
  } catch {
    return new Response(buildHealthErrorHtml(brandName, timestampIso), {
      status: 503,
      headers: {
        'content-type': 'text/html; charset=UTF-8',
        'X-Robots-Tag': HEALTH_ROBOTS_HEADER,
      },
    });
  }
}

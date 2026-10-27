import { publicErrorResponse } from '../src/core/public_error';
import { STANDALONE_HTML_SECURITY_HEADERS } from '../src/core/security_headers';
import { serve } from '@hono/node-server';
import { createApp } from '../test/app-fixture';

const port = Number(process.env.E2E_PORT ?? 4173);

const app = createApp();
const server = serve({
  fetch: (request, ...args) => {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/__e2e/rate' || pathname === '/__e2e/unavailable') {
      const response = publicErrorResponse(
        pathname.endsWith('/rate') ? 'rate_limited' : 'signer_unavailable',
      );
      for (const [name, value] of Object.entries(STANDALONE_HTML_SECURITY_HEADERS))
        response.headers.set(name, value);
      return response;
    }
    return app.fetch(request, ...args);
  },
  hostname: '127.0.0.1',
  port,
});

function close() {
  server.close();
}

process.once('SIGINT', close);
process.once('SIGTERM', close);

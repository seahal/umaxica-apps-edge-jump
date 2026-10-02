import { serve } from '@hono/node-server';
import { createApp } from '../test/app-fixture';

const port = Number(process.env.E2E_PORT ?? 4173);

const app = createApp();
const server = serve({
  fetch: (...args) => app.fetch(...args),
  hostname: '127.0.0.1',
  port,
});

function close() {
  server.close();
}

process.once('SIGINT', close);
process.once('SIGTERM', close);

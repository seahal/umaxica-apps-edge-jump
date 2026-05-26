import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite-plus';
import ssrPlugin from 'vite-ssr-components/plugin';

import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    cloudflare({
      inspectorPort: false,
    }),
    ssrPlugin(),
    tailwindcss(),
  ],
  server: {
    host: true,
    port: 5401,
    strictPort: true,
    watch: {
      usePolling: true,
    },
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    deps: {
      interopDefault: true,
    },
    globals: true,
    include: ['test/**/*.test.{ts,tsx}'],
  },
});

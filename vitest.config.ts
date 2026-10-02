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
    coverage: {
      include: ['src/**'],
      thresholds: {
        statements: 99,
        branches: 99,
        functions: 99,
        lines: 99,
      },
    },
  },
});

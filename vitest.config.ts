import { defineConfig } from 'vite-plus';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    coverage: {
      exclude: [
        '**/+types/**',
        '**/*.d.ts',
        '**/*.test.{ts,tsx}',
        '**/node_modules/**',
        '**/build/**',
        '**/bin/**',
        '**/dist/**',
        '**/pkg/**',
        '**/__mocks__/**',
        '**/public/**',
        '**/*.css',
        '**/*.svg',
        '**/workers/**',
        '**/test-setup.ts',
        '**/locales/**',
        '**/zod.ts',
        '**/coverage/**',
        '**/src/config/**',
        '**/src/cloudflare.ts',
        '**/src/fastly.ts',
      ],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html'],
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
    deps: {
      interopDefault: true,
    },
    globals: true,
    include: ['test/**/*.test.{ts,tsx}'],
  },
});

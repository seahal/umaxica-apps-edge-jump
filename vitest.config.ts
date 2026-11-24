export default {
  test: {
    deps: {
      interopDefault: true,
    },
    globals: true,
    include: ['test/**/*.test.{ts,tsx}'],
    coverage: {
      include: ['src/**'],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
};

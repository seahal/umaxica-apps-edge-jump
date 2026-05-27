import { defineConfig } from 'vite-plus';

export default defineConfig({
  staged: {
    '*': 'vp check --fix',
  },
  fmt: {
    printWidth: 100,
    tabWidth: 2,
    useTabs: false,
    semi: true,
    singleQuote: true,
    trailingComma: 'all',
    insertFinalNewline: true,
    sortPackageJson: true,
    overrides: [
      {
        files: ['**/*.json', '**/*.jsonc'],
        options: {
          trailingComma: 'none',
        },
      },
      {
        files: ['**/*.yaml', '**/*.yml'],
        options: {
          printWidth: 100,
        },
      },
      {
        files: ['**/*.md', '**/*.mdx'],
        options: {
          printWidth: 80,
        },
      },
    ],
    ignorePatterns: [
      '**/.wrangler/**',
      '**/dist/**',
      '**/node_modules/**',
      '**/build/**',
      '**/+types/**',
      'pnpm-lock.yaml',
    ],
  },
  lint: {
    plugins: ['typescript', 'import'],
    env: {
      browser: true,
      es2024: true,
    },
    globals: {},
    settings: {},
    rules: {
      'no-unused-vars': 'error',
      'no-console': 'warn',
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'typescript/no-explicit-any': 'error',
      'typescript/no-non-null-assertion': 'warn',
      'typescript/consistent-type-imports': 'error',
    },
    ignorePatterns: [
      '**/.wrangler/**',
      '**/dist/**',
      '**/node_modules/**',
      'worker-configuration.d.ts',
      '**/+types/**',
      '**/build/**',
    ],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
});

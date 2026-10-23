import { defineConfig } from 'vitest/config';

// One test runner for the whole repository. `npm test` finds every *.test.ts under packages/*/test.
export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
  },
});

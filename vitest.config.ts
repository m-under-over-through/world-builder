import { defineConfig } from 'vitest/config';

// One test runner for the whole repository. `npm test` finds every *.test.ts under packages/*/test and tools/*/test.
export default defineConfig({
  test: {
    // Most database tests boot a fresh PGlite (a Postgres in WebAssembly) and run the migrations,
    // which takes a second on a laptop and several on a shared CI runner when test files run
    // side by side. The default 5 s timeout failed CI once on 28 October; 30 s leaves room.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: [
      'packages/*/test/**/*.test.ts',
      'apps/*/test/**/*.test.ts',
      'tools/*/test/**/*.test.ts',
    ],
  },
});

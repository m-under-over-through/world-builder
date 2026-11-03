import { defineConfig } from 'vitest/config';

// One test runner for the whole repository, in two projects: `npm test` runs both.
// - node: every *.test.ts under packages/*/test, apps/api/test and tools/*/test, in plain Node.
// - web: the client's tests, which render Svelte components in a DOM; its plugins and
//   environment are in apps/web/vite.config.ts, which Vitest reads as that project's config.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          // Most database tests boot a fresh PGlite (a Postgres in WebAssembly) and run the
          // migrations, which takes a second on a laptop and several on a shared CI runner when
          // test files run side by side. The default 5 s timeout failed CI once on 28 October;
          // 30 s leaves room.
          testTimeout: 30_000,
          hookTimeout: 30_000,
          include: [
            'packages/*/test/**/*.test.ts',
            'apps/api/test/**/*.test.ts',
            'tools/*/test/**/*.test.ts',
          ],
        },
      },
      'apps/web',
    ],
  },
});

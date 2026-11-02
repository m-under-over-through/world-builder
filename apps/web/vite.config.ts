import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';

// The client (ADR 0012). Static output in dist/, served by Netlify with the headers from public/_headers.
// In development, /api is proxied to the local API server (node apps/api/dev.ts).

// The deploy's commit, from Netlify's build environment, so the privacy panel shows the version
// that is running and it can be matched with /api/health. Absent on a laptop: the panel says "local".
const commitRef = process.env.COMMIT_REF ?? process.env.VITE_COMMIT_REF;

export default defineConfig({
  define: commitRef ? { 'import.meta.env.VITE_COMMIT_REF': JSON.stringify(commitRef) } : {},
  // svelteTesting only acts under Vitest: it makes Svelte resolve its browser build in tests and
  // unmounts rendered components after each one. It is nothing in a build.
  plugins: [svelte(), svelteTesting()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: { proxy: { '/api': 'http://localhost:8788' } },
  // The client's tests: pure logic and rendered components, both in a DOM (jsdom), with an
  // in-memory IndexedDB (test/setup.ts). The root vitest.config.ts runs this as one project.
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
  },
});

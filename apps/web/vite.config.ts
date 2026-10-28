import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// The client (ADR 0012). Static output in dist/, served by Netlify with the headers from public/_headers.
// In development, /api is proxied to the local API server (node apps/api/dev.ts).

// The deploy's commit, from Netlify's build environment, so the privacy panel shows the version
// that is running and it can be matched with /api/health. Absent on a laptop: the panel says "local".
const commitRef = process.env.COMMIT_REF ?? process.env.VITE_COMMIT_REF;

export default defineConfig({
  define: commitRef ? { 'import.meta.env.VITE_COMMIT_REF': JSON.stringify(commitRef) } : {},
  plugins: [svelte()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: { proxy: { '/api': 'http://localhost:8788' } },
});

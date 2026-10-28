import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// The client (ADR 0012). Static output in dist/, served by Netlify with the headers from public/_headers.
// In development, /api is proxied to the local API server (node apps/api/dev.ts).
export default defineConfig({
  plugins: [svelte()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: { proxy: { '/api': 'http://localhost:8788' } },
});

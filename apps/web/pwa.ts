import type { VitePWAOptions } from 'vite-plugin-pwa';

/**
 * The installable app (docs/screen-map.md, Install prompt; ADR 0012 names vite-plugin-pwa): the
 * web app manifest, the icons, and a service worker that keeps the client's own files so an
 * installed app opens offline. The API is never cached: every `/api/*` request goes to the
 * network, and a navigation to `/api/*` is never answered with the client's page. Kept apart from
 * vite.config.ts so a test can read these rules without building anything.
 *
 * One deployment serves many workshops (ADR 0004), so the manifest starts at `/`, and the client
 * sends `/` on to the workshop this device last opened (lib/state.svelte.ts, open).
 */
export const API_PATH = /^\/api\//;

export const pwaOptions: Partial<VitePWAOptions> = {
  // Registered from main.ts through the virtual module: an inline script would break the
  // Content Security Policy (script-src 'self').
  injectRegister: null,
  registerType: 'autoUpdate',
  includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png'],
  manifest: {
    name: 'World Builder',
    short_name: 'World Builder',
    description: 'A few questions about a future, one card at a time.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f6f0e5',
    theme_color: '#f6f0e5',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
    // Any address of the client is the one page; the API is not the client.
    navigateFallback: '/index.html',
    navigateFallbackDenylist: [API_PATH],
    // No runtime caching at all: what is not in the precache (the API) is fetched, never kept.
    runtimeCaching: [],
    cleanupOutdatedCaches: true,
  },
  devOptions: { enabled: false },
};

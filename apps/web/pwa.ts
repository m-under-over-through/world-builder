import type { Plugin } from 'vite';
import type { VitePWAOptions } from 'vite-plugin-pwa';
import { manifestHref } from './src/lib/install.ts';

/**
 * The installable app (docs/screen-map.md, Install prompt; ADR 0012 names vite-plugin-pwa): the
 * web app manifest, the icons, and a service worker that keeps the client's own files so an
 * installed app opens offline. The API is never cached: every `/api/*` request goes to the
 * network, and a navigation to `/api/*` is never answered with the client's page. Kept apart from
 * vite.config.ts so a test can read these rules without building anything.
 *
 * One deployment serves many workshops (ADR 0004), so there is one manifest per workshop, at
 * /<slug>/manifest.webmanifest, starting and staying in that workshop. The page points its
 * manifest link at the workshop it opened (src/main.ts). An installed app on an iPhone has its
 * own storage, apart from Safari's. It cannot remember which workshop it belongs to, so the
 * address has to say (docs/learn/10-the-installed-app.md). The root manifest, starting at `/`,
 * remains for a page without a workshop. Where storage is shared, the client sends `/` on to the
 * workshop this device last opened (lib/state.svelte.ts, open).
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

/** The manifest of one workshop: the root manifest, starting and staying at /<slug>/. */
export function workshopManifest(slug: string): Record<string, unknown> {
  const home = `/${slug}/`;
  return { ...pwaOptions.manifest, id: home, start_url: home, scope: home };
}

/**
 * Writes one manifest per workshop folder into the build, next to the root one. They are written
 * before the service worker is generated, so they are kept offline like the root manifest.
 */
export function workshopManifests(slugs: readonly string[]): Plugin {
  return {
    name: 'wb-workshop-manifests',
    apply: 'build',
    generateBundle() {
      for (const slug of slugs) {
        this.emitFile({
          type: 'asset',
          fileName: manifestHref(slug).slice(1),
          source: JSON.stringify(workshopManifest(slug), null, 2),
        });
      }
    },
  };
}

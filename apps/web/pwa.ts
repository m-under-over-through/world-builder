import type { Plugin } from 'vite';
import type { VitePWAOptions } from 'vite-plugin-pwa';
import { manifestHref } from './src/lib/install.ts';
import { API_PATH, pageHref, REMINDER_PATH, workshopPage } from './src/lib/pages.ts';
import { reminderCalendar, reminderHref, type ReminderInput } from './src/lib/reminder.ts';

/**
 * The installable app (docs/screen-map.md, Install prompt; ADR 0012 names vite-plugin-pwa): the
 * web app manifest, the icons, and a service worker that keeps the client's own files so an
 * installed app opens offline. The API is never cached: every `/api/*` request goes to the
 * network, and a navigation to `/api/*` is never answered with the client's page. Kept apart from
 * vite.config.ts so a test can read these rules without building anything.
 *
 * One deployment serves many workshops (ADR 0004), so there is one manifest per workshop, at
 * /<slug>/manifest.webmanifest, starting and staying in that workshop, and one copy of the page
 * per workshop, at /<slug>/index.html, linking that manifest (ADR 0016): an iPhone reads the
 * link when the page loads and ignores what a script changes afterwards. An installed app on an
 * iPhone has its own storage, apart from Safari's. It cannot remember which workshop it belongs
 * to, so the address has to say (docs/learn/10-the-installed-app.md). The root manifest,
 * starting at `/`, remains for a page without a workshop. Where storage is shared, the client
 * sends `/` on to the workshop this device last opened (lib/state.svelte.ts, open).
 *
 * The service worker is written by hand (src/sw.ts) so that a navigation under /<slug>/ gets
 * that workshop's page; the plugin injects the list of files to keep into it.
 */
export { API_PATH, REMINDER_PATH };

export const pwaOptions: Partial<VitePWAOptions> = {
  // Registered from main.ts through the virtual module: an inline script would break the
  // Content Security Policy (script-src 'self').
  injectRegister: null,
  registerType: 'autoUpdate',
  strategies: 'injectManifest',
  srcDir: 'src',
  filename: 'sw.ts',
  includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png'],
  manifest: {
    name: 'World Builder',
    short_name: 'World Builder',
    description: 'A few questions about a future, one card at a time.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#F4F3EF',
    theme_color: '#F4F3EF',
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
  injectManifest: {
    // The pages, the workshop manifests, the reminder files and the two typefaces (public/fonts,
    // self-hosted: the client talks to one origin) are kept with the rest, so an installed app
    // opens offline with its type and "Remind me" works. Nothing else is ever cached: the worker
    // has no runtime caching, and which page answers a navigation is in src/lib/pages.ts.
    globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest,ics}'],
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

/**
 * Writes one copy of the page per workshop folder into the build, at /<slug>/index.html, with
 * its manifest link pointed at that workshop's manifest (src/lib/pages.ts, workshopPage). It
 * runs after Vite has written the root page, and reads that page from the bundle, so the copies
 * carry the same scripts and styles. Netlify serves a copy under /<slug>/* (public/_redirects),
 * and the service worker answers a navigation there with it. The development server has no
 * copies: it serves the one page, and the manifest is not read there.
 */
export function workshopPages(slugs: readonly string[]): Plugin {
  return {
    name: 'wb-workshop-pages',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const page = bundle['index.html'];
      if (!page || page.type !== 'asset') throw new Error('the build has no index.html to copy');
      const html =
        typeof page.source === 'string' ? page.source : new TextDecoder().decode(page.source);
      for (const slug of slugs) {
        this.emitFile({
          type: 'asset',
          fileName: pageHref(slug).slice(1),
          source: workshopPage(html, slug),
        });
      }
    },
  };
}

/**
 * Writes one calendar file per workshop folder into the build, at /<slug>/reminder.ics
 * (src/lib/reminder.ts; ADR 0013), the way the manifests are written; and serves the same bytes
 * on the development server, so "Remind me" can be tried without a build. The Content-Type is
 * Netlify's, from public/_headers; the development server sets the same one here.
 */
export function workshopReminders(reminders: readonly ReminderInput[]): Plugin {
  const files = new Map(reminders.map((r) => [reminderHref(r.slug), reminderCalendar(r)]));
  return {
    name: 'wb-workshop-reminders',
    generateBundle() {
      for (const [href, source] of files) {
        this.emitFile({ type: 'asset', fileName: href.slice(1), source });
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = files.get((req.url ?? '').split('?')[0] ?? '');
        if (file === undefined) return next();
        res.setHeader('content-type', 'text/calendar; charset=utf-8');
        res.end(file);
      });
    },
  };
}

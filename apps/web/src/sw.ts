/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { API_PATH, pageFor, REMINDER_PATH, slugsOfPages } from './lib/pages.ts';

/**
 * The service worker (ADR 0012 named the generated one; ADR 0016 writes it by hand): it keeps
 * the client's own files so an installed app opens offline, and answers a navigation with the
 * page the address belongs to (lib/pages.ts): a workshop's own page under /<slug>/, the root
 * page elsewhere. Nothing else is cached, ever: every /api/* request goes to the network, and a
 * navigation to the API or to a calendar file is never answered with a page. The list of files
 * is injected by vite-plugin-pwa at build (apps/web/pwa.ts); a new deploy replaces them on the
 * next open.
 */
declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<string | { url: string; revision: string | null }>;
};

const files = self.__WB_MANIFEST;
precacheAndRoute(files);
cleanupOutdatedCaches();

const slugs = slugsOfPages(files.map((entry) => (typeof entry === 'string' ? entry : entry.url)));
registerRoute(
  new NavigationRoute(
    (options) =>
      createHandlerBoundToURL(pageFor(new URL(options.request.url).pathname, slugs))(options),
    { denylist: [API_PATH, REMINDER_PATH] },
  ),
);

// A new version takes over at once (registerType 'autoUpdate' in apps/web/pwa.ts).
self.skipWaiting();
clientsClaim();

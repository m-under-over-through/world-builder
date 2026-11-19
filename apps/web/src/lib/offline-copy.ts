/**
 * The device's copy of the client: the service worker that keeps the client's files, so an
 * installed app opens offline (apps/web/pwa.ts; learning note 10).
 *
 * The page registers the worker and does nothing else (ADR 0029). On every open the browser asks
 * the server whether the worker has changed; after a deploy it has, and the new worker installs in
 * the background, takes over at once and drops the old files. The page that is open keeps running
 * the version it was loaded with, and the new version is what the next open gets.
 *
 * So there is no listener here of any kind, and no reload. The registration code that came with
 * vite-plugin-pwa reloaded the page the moment a new worker took over: "the second jump" after
 * every deploy, which on a slow line could come many seconds in and take a half-written answer
 * with it. The one reload left in the client is public/boot.js, for a page whose app never
 * started (ADR 0028).
 */

/** Where the build writes the worker (vite-plugin-pwa's default file name), and what it covers. */
export const WORKER_URL = '/sw.js';
export const WORKER_SCOPE = '/';

/** The part of `navigator` this needs; a test hands in a stand-in. */
export interface WorkerHost {
  serviceWorker?: Pick<ServiceWorkerContainer, 'register'>;
}

/**
 * Register the worker. Nothing where the browser has none. A registration the browser refuses
 * (a private window that allows no worker, a page not served over https) is swallowed: the app
 * works without its copy, it only does not open offline, and there is nobody to tell.
 */
export function keepOfflineCopy(host: WorkerHost = navigator): void {
  const container = host.serviceWorker;
  if (!container) return;
  try {
    container.register(WORKER_URL, { scope: WORKER_SCOPE }).catch(() => {
      /* refused: no copy on this device */
    });
  } catch {
    /* refused at once: no copy on this device */
  }
}

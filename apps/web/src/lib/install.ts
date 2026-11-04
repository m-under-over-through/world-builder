/**
 * The page's manifest link. The install offer is gone (ADR 0017, reversing that part of ADR
 * 0013): nothing in the client asks a participant to add the app to a home screen. The manifest
 * and the service worker stay (apps/web/pwa.ts): they cost nothing, keep a reopened tab working
 * offline, and an app someone installs on their own still starts in its workshop.
 */

/** The address of a workshop's own manifest (apps/web/pwa.ts, workshopManifests). */
export function manifestHref(slug: string): string {
  return `/${slug}/manifest.webmanifest`;
}

/**
 * Point the page's manifest link at a workshop's manifest, so an app installed from this page
 * starts in this workshop. The build writes a link to the root manifest; a page without one (the
 * development server) gets one.
 */
export function pointManifest(doc: Document, href: string): void {
  let link = doc.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!link) {
    link = doc.createElement('link');
    link.rel = 'manifest';
    doc.head.appendChild(link);
  }
  link.href = href;
}

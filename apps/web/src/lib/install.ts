/**
 * The install offer (docs/screen-map.md, Session end; ADR 0013): at the end of the first session,
 * under the code, "add this to your home screen and you have a way back without the newsletter",
 * with the steps for this platform. Shown once, there, and never in an app that is already
 * installed or on a platform with no steps. Nothing is stored about it: the first session is the
 * one time, and the next session end does not offer it again.
 *
 * It is worth offering on an iPhone even though the home-screen app has its own storage and
 * asks for the code once (docs/learn/10-the-installed-app.md): Safari deletes everything a site
 * stored after seven days of use without a visit to the site, and a home-screen app is exempt.
 * It is the one way an iPhone keeps a participant for the three weeks of a workshop.
 */

/** The browser's own install offer, when it makes one (Chrome on Android and on a desktop). */
export interface InstallOffer extends Event {
  prompt(): Promise<unknown>;
  userChoice?: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function installDue(input: {
  /** The platform of the dictation hint: null means no steps to show. */
  platform: string | null;
  installed: boolean;
}): boolean {
  return input.platform !== null && !input.installed;
}

/** Opened from the home screen, not in a browser tab. */
export function runsInstalled(): boolean {
  if (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches)
    return true;
  return (navigator as { standalone?: boolean }).standalone === true;
}

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

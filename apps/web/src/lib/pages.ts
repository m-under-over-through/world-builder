/**
 * Which page answers an address (ADR 0016). The client is one page, but an app installed from
 * a workshop must start in that workshop, and an iPhone reads the page's manifest link when the
 * page loads, not when the app is installed. So the build writes one copy of the page per
 * workshop folder, at /<slug>/index.html, linking that workshop's manifest; Netlify serves it
 * under /<slug>/* (public/_redirects), and the service worker (src/sw.ts) answers a navigation
 * under /<slug>/ with it. Every other address gets the root page. Pure functions, so the rule is
 * tested once and used in both places.
 */

/** The API is never the client. */
export const API_PATH = /^\/api\//;
/** A calendar file is never the client either: a tap on "Remind me" must reach the file. */
export const REMINDER_PATH = /\/reminder\.ics$/;

/** The root page's link to the root manifest, as vite-plugin-pwa writes it into the build. */
const ROOT_MANIFEST_LINK = /<link rel="manifest" href="\/manifest\.webmanifest">/;

/** The address of a workshop's own page in the build. */
export function pageHref(slug: string): string {
  return `/${slug}/index.html`;
}

/** The slugs that have a page of their own, read off the list of files the service worker keeps. */
export function slugsOfPages(urls: readonly string[]): string[] {
  const slugs: string[] = [];
  for (const url of urls) {
    const match = /^\/?([^/]+)\/index\.html$/.exec(url);
    if (match) slugs.push(match[1]!);
  }
  return slugs;
}

/** The page for an address: the workshop's own when the address is under a workshop that has one, else the root page. */
export function pageFor(pathname: string, slugs: Iterable<string>): string {
  const first = pathname.split('/')[1] ?? '';
  return first !== '' && new Set(slugs).has(first) ? pageHref(first) : '/index.html';
}

/**
 * The root page with its manifest link pointed at a workshop's manifest, and nothing else
 * changed. Refuses a page without the root link, so a change in how the build writes the link
 * fails the build rather than installing every app at `/`.
 */
export function workshopPage(html: string, slug: string): string {
  if (!ROOT_MANIFEST_LINK.test(html)) throw new Error('the root page has no manifest link');
  return html.replace(
    ROOT_MANIFEST_LINK,
    `<link rel="manifest" href="/${slug}/manifest.webmanifest">`,
  );
}

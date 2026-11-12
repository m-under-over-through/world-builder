/**
 * The URL is /<slug>/ with optional /join/<wave>, /join/i/<token>, or one of the pages a
 * participant can open directly (architecture plan, 5.1; docs/screen-map.md). Nothing identifying
 * ever appears in it: the code travels in a header, never in the URL. A link's value travels
 * after the `#`, which no server sees, and is read by lib/identity.ts, not here (ADR 0018).
 *
 * /continue, the old "enter code" page, is gone with the code's visibility (ADR 0018): an old
 * address of it lands home like any other unknown page.
 *
 * /join/<wave>/invitations is the invitation page (ADR 0021): the join address with one more
 * word, so it knows the workshop and the wave without a setting. No screen links to it.
 *
 * /about is the one page about the app (ADR 0013). /panel and /trust are older addresses for
 * what is now two sections of it, kept because a newsletter may carry them: they open the same
 * page at that section.
 */
export const PAGES = ['about', 'panel', 'trust', 'terms', 'privacy'] as const;
export type Page = (typeof PAGES)[number];

export interface Route {
  slug: string;
  wave?: string;
  invite?: string;
  /** /about, /panel and /trust the one page; /terms and /privacy the two texts. */
  page?: Page;
  /** /join/<wave>/invitations: the invitation page of that wave, not the wave landing (ADR 0021). */
  invitations?: true;
}

export function parseRoute(pathname: string): Route | null {
  const parts = pathname.split('/').filter(Boolean);
  const slug = parts[0];
  if (!slug) return null;
  const route: Route = { slug };
  if (parts[1] === 'join' && parts[2] === 'i' && parts[3]) route.invite = parts[3];
  else if (parts[1] === 'join' && parts[2]) {
    route.wave = parts[2];
    if (parts[3] === 'invitations') route.invitations = true;
  } else if (parts[1] && (PAGES as readonly string[]).includes(parts[1]))
    route.page = parts[1] as Page;
  return route;
}

/** The address of a page of a workshop: pageHref('rural-manufacturing', 'about'). */
export function pageHref(slug: string, page?: Page): string {
  return page ? `/${slug}/${page}` : `/${slug}/`;
}

/**
 * How this device arrived: the wave or the invite in the first link it opened. Kept in the
 * device's store under the key `arrival`, so a later open of /<slug>/ still knows which wave to
 * join through, and so a wave open is counted once per device (build log, 29 October 2026).
 */
export interface Arrival {
  wave?: string;
  invite?: string;
}

/** The stored arrival, or none when nothing is stored or the stored text is not what we wrote. */
export function parseArrival(stored: string | undefined): Arrival {
  if (!stored) return {};
  try {
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const { wave, invite } = parsed as Record<string, unknown>;
    const arrival: Arrival = {};
    if (typeof wave === 'string' && wave) arrival.wave = wave;
    if (typeof invite === 'string' && invite) arrival.invite = invite;
    return arrival;
  } catch {
    return {};
  }
}

/**
 * Whether opening this wave link counts as an open. Once per device: it counts only when the
 * device has not stored an arrival through this wave yet, so a reload, a second visit, or a
 * returning participant following the newsletter link again does not add to the number. The
 * wave's opened count therefore means "devices that opened the link", not page loads. A device
 * that cleared its storage, or one that arrived through an invite or another wave, counts as new.
 */
export function countsAsOpen(stored: Arrival, wave: string): boolean {
  return stored.wave !== wave;
}

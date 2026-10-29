/**
 * The URL is /<slug>/ with optional /join/<wave> or /join/i/<token> (architecture plan, 5.1).
 * Nothing identifying ever appears in it: the code travels in a header, never in the URL.
 */
export interface Route {
  slug: string;
  wave?: string;
  invite?: string;
  page?: 'panel' | 'trust';
}

export function parseRoute(pathname: string): Route | null {
  const parts = pathname.split('/').filter(Boolean);
  const slug = parts[0];
  if (!slug) return null;
  const route: Route = { slug };
  if (parts[1] === 'join' && parts[2] === 'i' && parts[3]) route.invite = parts[3];
  else if (parts[1] === 'join' && parts[2]) route.wave = parts[2];
  else if (parts[1] === 'panel') route.page = 'panel';
  else if (parts[1] === 'trust') route.page = 'trust';
  return route;
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

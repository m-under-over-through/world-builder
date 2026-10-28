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

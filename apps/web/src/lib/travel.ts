import type { OpenedFrom } from './state.svelte.ts';

/**
 * Where a card travels (ADR 0027, "A motion says where the card went"). The open card itself
 * never moves: it fades in and out where it stands, because its field takes the focus and a
 * field in a moving box makes Safari scroll the page (ADR 0025). The travelling card
 * (components/TravellingCard.svelte) is drawn over it and does the moving. This file holds the
 * arithmetic only, on plain values, so a test needs no layout.
 */

/** What happens to the open card: it opens, closes without saving, or is saved. */
export type Moment = 'open' | 'close' | 'save';

/**
 * The places a card can travel between. `front` is the card in front of the stack, `tile` its
 * tile in "Your world so far", `pill` the pill "Your world so far" at the foot of a phone's
 * screen, `open` the open card.
 */
export type Place = 'front' | 'tile' | 'pill' | 'open';

/**
 * How the travelling card fades on its way. `out`: it lands on the open card, which is fading in
 * under it, so it fades as it goes. `in`: it leaves the open card, which is fading out under it,
 * and lands whole on the card or the tile that shows as it arrives. `through`: it comes up as it
 * leaves the open card and goes again as it reaches the pill, which is not a card.
 */
export type Fade = 'out' | 'in' | 'through';

export interface Route {
  from: Place;
  to: Place;
  fade: Fade;
}

/** A rectangle on the screen, in CSS pixels, as `getBoundingClientRect` gives it. */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Travel {
  from: Rect;
  to: Rect;
  fade: Fade;
}

/**
 * Which place to which, for a moment (the table of the brief, docs/briefs/card-motions.md).
 *
 * - Opening: from what was tapped, the card in front or its tile, to the open card. A new blank
 *   card has nothing to grow from.
 * - Closing without saving: back to where it came from. On a phone a tile's card goes to the
 *   pill, since its tile is in the sheet, which closed when the card opened. A new blank card
 *   has nowhere to go back to.
 * - Saving: to its place in "Your world so far": its tile from 600 pixels wide, the pill on a
 *   phone. A new blank card too: it has a tile from the moment it is saved.
 */
export function routeOf(moment: Moment, openedFrom: OpenedFrom, wide: boolean): Route | null {
  if (moment === 'save')
    return { from: 'open', to: wide ? 'tile' : 'pill', fade: wide ? 'in' : 'through' };
  if (openedFrom === 'new') return null;
  if (moment === 'open') return { from: openedFrom, to: 'open', fade: 'out' };
  if (openedFrom === 'front') return { from: 'open', to: 'front', fade: 'in' };
  return wide
    ? { from: 'open', to: 'tile', fade: 'in' }
    : { from: 'open', to: 'pill', fade: 'through' };
}

/** A rectangle that can be travelled to: it was measured, and it has a size. */
function usable(rect: Rect | null | undefined): rect is Rect {
  return (
    rect !== null &&
    rect !== undefined &&
    [rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) &&
    rect.width > 0 &&
    rect.height > 0
  );
}

/**
 * The travel itself, from the rectangles measured. Nothing travels, and the fade stands alone,
 * when motion is to be reduced, when there is no route, or when either rectangle is missing or
 * has no size (the element is not in the page, or a test DOM with no layout). That is not an
 * error.
 */
export function travelOf(
  route: Route | null,
  rects: Partial<Record<Place, Rect | null>>,
  reduced: boolean,
): Travel | null {
  if (reduced || !route) return null;
  const from = rects[route.from];
  const to = rects[route.to];
  if (!usable(from) || !usable(to)) return null;
  return { from, to, fade: route.fade };
}

/**
 * The opacity of the travelling card along the way, as keyframes from 0 to 1. The card in front
 * or the tile it left is lifted (hidden) from the same moment, so it starts whole when it opens;
 * the open card fades in 280 ms under it, so it is gone when that is done.
 */
export function opacityOf(fade: Fade): { offset: number; opacity: number }[] {
  if (fade === 'out')
    return [
      { offset: 0, opacity: 1 },
      { offset: 0.35, opacity: 1 },
      { offset: 1, opacity: 0 },
    ];
  if (fade === 'in')
    return [
      { offset: 0, opacity: 0 },
      { offset: 0.35, opacity: 1 },
      { offset: 1, opacity: 1 },
    ];
  return [
    { offset: 0, opacity: 0 },
    { offset: 0.3, opacity: 1 },
    { offset: 0.7, opacity: 1 },
    { offset: 1, opacity: 0 },
  ];
}

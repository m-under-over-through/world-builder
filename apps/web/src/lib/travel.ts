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
 * How the travelling card fades on its way. The open card over it does the rest: it comes in
 * late and goes early (the stylesheet's `open-in` and `open-out`), so that for the first part of
 * every way the travelling card is what the eye sees.
 *
 * - `out`: opening. It goes whole from what was tapped to the open card's place, and fades as
 *   the open card comes in over it at the end.
 * - `whole`: closing, or saving to a tile. The open card's words go first; the travelling card
 *   is whole all the way and lands on the card or the tile, which shows as it arrives.
 * - `through`: to the pill on a phone. Whole at first, then it fades as it reaches the pill,
 *   which is not a card.
 */
export type Fade = 'out' | 'whole' | 'through';

/**
 * How the travelling card moves: it starts gently, is fastest a third of the way in, and settles.
 * Not the fades' own easing (`--ease-sheet`), which does nine tenths of its way in the first
 * third of its time: a card that does that is not seen travelling, it is seen arriving.
 */
export const TRAVEL_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';

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
    return { from: 'open', to: wide ? 'tile' : 'pill', fade: wide ? 'whole' : 'through' };
  if (openedFrom === 'new') return null;
  if (moment === 'open') return { from: openedFrom, to: 'open', fade: 'out' };
  if (openedFrom === 'front') return { from: 'open', to: 'front', fade: 'whole' };
  return wide
    ? { from: 'open', to: 'tile', fade: 'whole' }
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

/** The part of the page that is on the screen: the window's own width and height. */
export interface Screen {
  width: number;
  height: number;
}

/** Whether any of a rectangle is on the screen. */
function onScreen(rect: Rect, screen: Screen): boolean {
  return (
    rect.left < screen.width &&
    rect.top < screen.height &&
    rect.left + rect.width > 0 &&
    rect.top + rect.height > 0
  );
}

/**
 * The travel itself, from the rectangles measured. Nothing travels, and the fade stands alone,
 * when motion is to be reduced, when there is no route, when either rectangle is missing or has
 * no size (the element is not in the page, or a test DOM with no layout), or when either is
 * wholly off the screen: a tile far down a long list is under the fold, and a card flying out of
 * the bottom of the window says nothing about where it went. That is not an error.
 */
export function travelOf(
  route: Route | null,
  rects: Partial<Record<Place, Rect | null>>,
  reduced: boolean,
  screen?: Screen,
): Travel | null {
  if (reduced || !route) return null;
  const from = rects[route.from];
  const to = rects[route.to];
  if (!usable(from) || !usable(to)) return null;
  if (screen && (!onScreen(from, screen) || !onScreen(to, screen))) return null;
  return { from, to, fade: route.fade };
}

/**
 * The opacity of the travelling card along the way, as keyframes from 0 to 1 of its time. What it
 * left is lifted (hidden) from the first moment, and the open card is clear at the start of an
 * opening and soon clear on a closing, so the travelling card is whole from its first frame.
 */
export function opacityOf(fade: Fade): { offset: number; opacity: number }[] {
  if (fade === 'whole')
    return [
      { offset: 0, opacity: 1 },
      { offset: 1, opacity: 1 },
    ];
  return [
    { offset: 0, opacity: 1 },
    { offset: fade === 'out' ? 0.6 : 0.55, opacity: 1 },
    { offset: 1, opacity: 0 },
  ];
}

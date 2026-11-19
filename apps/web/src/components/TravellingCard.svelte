<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { CLOSE_MS, type AppState, type Tint } from '../lib/state.svelte.ts';
  import { reducedMotion } from '../lib/swipe.ts';
  import {
    opacityOf,
    TRAVEL_EASING,
    routeOf,
    travelOf,
    type Moment,
    type Place,
    type Rect,
    type Route,
    type Travel,
  } from '../lib/travel.ts';
  import { WORLD_PILL } from './Stack.svelte';

  /**
   * The travelling card (ADR 0027, "A motion says where the card went"): a box with the card's
   * look and nothing inside it, drawn over the page and the scrim and under the open card, that goes from
   * one place to another while the open card fades. It grows from what was tapped as a card
   * opens, goes back there as it closes, and goes to its place in "Your world so far" as it is
   * saved. Which place to which is lib/travel.ts.
   *
   * The open card itself never moves (ADR 0027, ADR 0025): its field takes the focus at once, in
   * a box that stands still, so Safari has no reason to scroll the page and an iPhone raises the
   * keyboard in the tap. This box is not inside the open card, so a screen reader in the dialog
   * never meets it; it is `aria-hidden`, takes no touch and no focus, and is in the page only
   * while it travels.
   *
   * Nothing waits for it. It runs inside the wait the state already makes for the fade
   * (`CLOSE_MS`), so it arrives as the fade ends. The open card comes in late and goes early
   * (the stylesheet's `open-in` and `open-out`), so the travelling card is seen on its way. Under reduced motion,
   * where a browser cannot animate, or where a rectangle cannot be measured, nothing travels and
   * the fade stands alone.
   *
   * Rectangles are measured, never assumed. Where a card opens from is measured at the press,
   * before anything changes: on a phone a tile's sheet closes in the same press. Where it goes is
   * measured when the travel starts, from the element itself (on a phone the open card's box is
   * set by the visual viewport, lib/viewport.ts).
   */
  let { app }: { app: AppState } = $props();

  interface Flight extends Travel {
    /** A new number for every travel, so a travel that replaces another starts afresh. */
    n: number;
    tint: Tint | null;
    radius: [string, string];
  }
  let flight = $state<Flight | null>(null);
  let flights = 0;

  /** What was pressed last, measured then: the card in front or a tile. */
  let pressed: { from: 'front' | 'tile'; id: string | null; rect: Rect; radius: string } | null =
    null;

  /**
   * An element's rectangle where it stands. A tile is measured by the item that holds it: a tile
   * just added rises 8 pixels into place (`tile-in`), and the item does not move.
   */
  function rectOf(el: Element | null | undefined): Rect | null {
    if (!el) return null;
    const r = (el.closest('.tile-item') ?? el).getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }
  function radiusOf(el: Element | null | undefined): string {
    return (el && getComputedStyle(el).borderRadius) || 'var(--radius-card)';
  }
  /** Where a browser cannot animate (the test DOM has no `element.animate`), nothing travels. */
  function canAnimate(): boolean {
    return typeof document.body.animate === 'function';
  }

  const openCard = () => document.querySelector('.open-card');
  const front = () => document.querySelector('.stack button.card.front');
  const pill = () => document.getElementById(WORLD_PILL);
  /** A card's tile; after a save, the one among the answers, never the white one it may leave. */
  function tile(id: string | null, answered: boolean): Element | null {
    if (id === null) return null;
    const scope = answered ? '.world-section.answered [data-tile]' : '[data-tile]';
    return (
      [...document.querySelectorAll<HTMLElement>(scope)].find((el) => el.dataset['tile'] === id) ??
      null
    );
  }
  function elementOf(place: Place, id: string | null, answered: boolean): Element | null {
    if (place === 'open') return openCard();
    if (place === 'front') return front();
    if (place === 'pill') return pill();
    return tile(id, answered);
  }

  /**
   * The press, in the capture phase, before the tile's or the card's own handler opens the card
   * and before the page changes under it.
   */
  function onPress(event: MouseEvent) {
    const target = event.target instanceof Element ? event.target : null;
    const el = target?.closest<HTMLElement>('.stack button.card.front, button[data-tile]');
    const rect = rectOf(el);
    pressed =
      el && rect
        ? el.dataset['tile'] !== undefined
          ? { from: 'tile', id: el.dataset['tile'], rect, radius: radiusOf(el) }
          : { from: 'front', id: app.card?.id ?? null, rect, radius: radiusOf(el) }
        : null;
  }

  function start(
    route: Route,
    rects: Partial<Record<Place, Rect | null>>,
    radii: [string, string],
  ) {
    const travel = travelOf(route, rects, reducedMotion() || !canAnimate(), {
      width: window.innerWidth,
      height: window.innerHeight,
    });
    flight = travel ? { ...travel, n: ++flights, tint: app.writingTint, radius: radii } : null;
  }

  // A card opens: from what was pressed, to the open card once it is drawn.
  let wasWriting: string | null = null;
  $effect(() => {
    const id = app.writing;
    const before = wasWriting;
    wasWriting = id;
    if (id === null || before !== null) return;
    untrack(() => {
      const press = pressed;
      pressed = null;
      const from = app.openedFrom;
      const route = routeOf('open', from, app.wide);
      if (!route || reducedMotion() || !canAnimate()) return;
      // The press that opened this card, and no other: a tile's by its id, the card in front's
      // by the card that was in front.
      const origin = press && press.from === from && press.id === id ? press : null;
      // After `tick()`, as the field takes the focus: the root has the frame by then, so the
      // open card is in its box (App.svelte, OpenCard.svelte).
      void tick().then(() => {
        if (app.writing !== id || app.closing) return;
        const box = openCard();
        start(route, { [route.from]: origin?.rect ?? null, open: rectOf(box) }, [
          origin?.radius ?? 'var(--radius-card)',
          radiusOf(box),
        ]);
      });
    });
  });

  // A card closes or is saved: from the open card, to where it came from or to its place.
  let wasClosing = false;
  $effect(() => {
    const closing = app.closing;
    const before = wasClosing;
    wasClosing = closing;
    if (!closing || before) return;
    untrack(() => {
      const moment: Moment = app.saving ? 'save' : 'close';
      const route = routeOf(moment, app.openedFrom, app.wide);
      if (!route || reducedMotion() || !canAnimate()) {
        flight = null;
        return;
      }
      const id = moment === 'save' ? app.savedAs : app.writing;
      const from = elementOf(route.from, id, moment === 'save');
      const to = elementOf(route.to, id, moment === 'save');
      start(route, { [route.from]: rectOf(from), [route.to]: rectOf(to) }, [
        radiusOf(from),
        radiusOf(to),
      ]);
    });
  });

  /**
   * The way itself: position and size in the length of the fade, with an easing of its own
   * (`TRAVEL_EASING`) that spreads the way over that time, and the fade of lib/travel.ts.
   */
  function fly(node: HTMLElement, f: Flight) {
    const easing = TRAVEL_EASING;
    const box = (r: Rect, radius: string) => ({
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
      borderRadius: radius,
    });
    const way = node.animate([box(f.from, f.radius[0]), box(f.to, f.radius[1])], {
      duration: CLOSE_MS,
      easing,
    });
    const fade = node.animate(opacityOf(f.fade), { duration: CLOSE_MS, easing: 'linear' });
    const done = () => {
      if (flight?.n === f.n) flight = null;
    };
    way.onfinish = done;
    // A page in the background may hold its animations: the box never stays longer than twice
    // the way, whatever happens to it.
    const late = setTimeout(done, 2 * CLOSE_MS);
    return {
      destroy() {
        clearTimeout(late);
        way.cancel();
        fade.cancel();
      },
    };
  }

  const last = $derived(flight ? opacityOf(flight.fade).at(-1)!.opacity : 0);
</script>

<svelte:window onclickcapture={onPress} />

{#if flight}
  {#key flight.n}
    <!-- Drawn where it ends, so the frame after the way is the way's last one. -->
    <div
      class="travelling-card"
      class:own={flight.tint === null}
      aria-hidden="true"
      style:--tint={flight.tint === null ? undefined : `var(--tint-${flight.tint})`}
      style:left={`${flight.to.left}px`}
      style:top={`${flight.to.top}px`}
      style:width={`${flight.to.width}px`}
      style:height={`${flight.to.height}px`}
      style:border-radius={flight.radius[1]}
      style:opacity={last}
      use:fly={flight}
    ></div>
  {/key}
{/if}

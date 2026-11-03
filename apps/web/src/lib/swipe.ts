/**
 * Swipe to set a card aside (docs/screen-map.md, Core loop; the demo card says "swipe it away").
 * A Svelte action on the card: the card follows the finger sideways and, past the threshold,
 * leaves the screen and the caller records the dismissal; short of it, the card springs back.
 * Vertical movement is scrolling and is left alone; a touch that starts in the answer field or
 * on a button is typing or a tap, never a swipe. Nothing here is recorded or sent; the caller
 * decides what a dismissal means.
 *
 * With "reduce motion" on, the card does not animate: it leaves at once.
 */
export const SWIPE_MIN_PX = 80;
export const SWIPE_FRACTION = 0.35;
/** Movement under this many pixels is a tap or a wobble, not a swipe yet. */
export const SWIPE_SLOP_PX = 10;

export type SwipeOutcome = 'dismiss' | 'cancel';

/** Past max(80 px, 35% of the card's width) sideways the card is set aside; short of it, it comes back. */
export function swipeOutcome(dx: number, width: number): SwipeOutcome {
  return Math.abs(dx) >= Math.max(SWIPE_MIN_PX, SWIPE_FRACTION * width) ? 'dismiss' : 'cancel';
}

/** A touch that starts in a field or on a control is not a swipe. */
export function startsASwipe(target: EventTarget | null): boolean {
  return !(target instanceof Element && target.closest('textarea, input, button, a, select'));
}

export function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface SwipeOptions {
  onDismiss: (direction: 'left' | 'right') => void;
  /** Off while the card is saving or leaving. */
  enabled?: () => boolean;
}

export function swipe(node: HTMLElement, options: SwipeOptions) {
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let dx = 0;
  let tracking = false;
  let settled = true;

  const transformFor = (x: number) => `translateX(${x}px) rotate(${x / 24}deg)`;

  function reset() {
    pointerId = null;
    dx = 0;
    tracking = false;
    node.classList.remove('swiping');
  }

  function onDown(event: PointerEvent) {
    if (!settled || pointerId !== null) return;
    if (options.enabled && !options.enabled()) return;
    if (!startsASwipe(event.target)) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    dx = 0;
  }

  function onMove(event: PointerEvent) {
    if (event.pointerId !== pointerId) return;
    dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!tracking) {
      if (Math.abs(dy) > SWIPE_SLOP_PX && Math.abs(dy) > Math.abs(dx)) return reset();
      if (Math.abs(dx) <= SWIPE_SLOP_PX) return;
      tracking = true;
      node.classList.add('swiping');
      node.setPointerCapture?.(event.pointerId);
    }
    node.style.transition = 'none';
    node.style.transform = transformFor(dx);
  }

  function onUp(event: PointerEvent) {
    if (event.pointerId !== pointerId) return;
    const wasTracking = tracking;
    const moved = dx;
    reset();
    if (!wasTracking) return;
    const width = Math.max(node.getBoundingClientRect().width, 1);
    if (swipeOutcome(moved, width) === 'cancel') {
      node.style.transition = reducedMotion() ? 'none' : 'transform 180ms ease-out';
      node.style.transform = '';
      return;
    }
    const direction = moved < 0 ? 'left' : 'right';
    if (reducedMotion()) {
      node.style.transform = '';
      options.onDismiss(direction);
      return;
    }
    settled = false;
    node.style.transition = 'transform 220ms ease-in';
    node.style.transform = transformFor(direction === 'left' ? -width * 1.4 : width * 1.4);
    const done = () => {
      node.removeEventListener('transitionend', done);
      clearTimeout(fallback);
      node.style.transition = 'none';
      node.style.transform = '';
      settled = true;
      options.onDismiss(direction);
    };
    // A card whose transition never fires (hidden tab, a browser without transitions) still leaves.
    const fallback = setTimeout(done, 300);
    node.addEventListener('transitionend', done);
  }

  node.addEventListener('pointerdown', onDown);
  node.addEventListener('pointermove', onMove);
  node.addEventListener('pointerup', onUp);
  node.addEventListener('pointercancel', onUp);
  return {
    update(next: SwipeOptions) {
      options = next;
    },
    destroy() {
      node.removeEventListener('pointerdown', onDown);
      node.removeEventListener('pointermove', onMove);
      node.removeEventListener('pointerup', onUp);
      node.removeEventListener('pointercancel', onUp);
    },
  };
}

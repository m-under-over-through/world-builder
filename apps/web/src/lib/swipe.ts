/**
 * Swipe to set a card aside (docs/screen-map.md, Core loop; design/DESIGN.md, Swipe). A Svelte
 * action on the front card: the card follows the pointer sideways, turning as it goes, and at
 * release either leaves the screen (the caller then records the dismissal) or springs back.
 * The numbers are the design's: a drag of more than 6 pixels is a drag and not a tap, so the
 * click that would open the card for answering is swallowed; more than 100 pixels at release
 * sets the card aside; the card leaves 520 pixels sideways in 250 ms and comes back in 250 ms.
 *
 * Vertical movement is scrolling and is left alone (`touch-action: pan-y` on the card does the
 * same for the browser); a pointer that starts in a field, a link or a button inside the card
 * is typing or a tap, never a swipe. The front card is itself a button, which is why the node
 * the action sits on is never excluded. Nothing here is recorded or sent.
 *
 * With "reduce motion" on, the card does not animate: it leaves or returns at once.
 */
export const SWIPE_THRESHOLD_PX = 100;
/** Movement up to this many pixels is a tap; past it, a drag, and the tap's click is swallowed. */
export const SWIPE_SLOP_PX = 6;
export const SWIPE_EXIT_PX = 520;
export const SWIPE_MS = 250;
/** The card turns one degree for every 18 pixels it moves. */
const ROTATE_PER_PX = 1 / 18;

export type SwipeOutcome = 'dismiss' | 'cancel';
export type SwipeDirection = 'left' | 'right';

/** More than 100 pixels sideways at release sets the card aside; up to it, the card comes back. */
export function swipeOutcome(dx: number): SwipeOutcome {
  return Math.abs(dx) > SWIPE_THRESHOLD_PX ? 'dismiss' : 'cancel';
}

/** A pointer that starts in a field, a link or a control inside the card (not the card itself) is not a swipe. */
export function startsASwipe(target: EventTarget | null, node?: Element): boolean {
  if (!(target instanceof Element)) return true;
  const control = target.closest('textarea, input, select, a, button');
  return control === null || control === node;
}

/** Where the card is while it follows the pointer: moved, and turned in proportion. */
export function followTransform(dx: number): string {
  return `translateX(${dx}px) rotate(${dx * ROTATE_PER_PX}deg)`;
}

export function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface SwipeOptions {
  onDismiss: (direction: SwipeDirection) => void;
  /** Off while the card is open for answering, saving or leaving. */
  enabled?: () => boolean;
}

export function swipe(node: HTMLElement, options: SwipeOptions) {
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let dx = 0;
  let tracking = false;
  /** True from a drag past the slop until the click it would have been is swallowed. */
  let moved = false;
  let settled = true;

  function reset() {
    pointerId = null;
    dx = 0;
    tracking = false;
    node.classList.remove('swiping');
  }

  function onDown(event: PointerEvent) {
    moved = false;
    if (!settled || pointerId !== null) return;
    if (options.enabled && !options.enabled()) return;
    if (!startsASwipe(event.target, node)) return;
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
      moved = true;
      node.classList.add('swiping');
      node.setPointerCapture?.(event.pointerId);
    }
    node.style.transition = 'none';
    node.style.transform = followTransform(dx);
  }

  function onUp(event: PointerEvent) {
    if (event.pointerId !== pointerId) return;
    const wasTracking = tracking;
    const released = dx;
    reset();
    if (!wasTracking) return;
    if (event.type === 'pointercancel') moved = false;
    if (swipeOutcome(released) === 'cancel') {
      node.style.transition = reducedMotion() ? 'none' : `transform ${SWIPE_MS}ms ease`;
      node.style.transform = '';
      return;
    }
    const direction: SwipeDirection = released < 0 ? 'left' : 'right';
    if (reducedMotion()) {
      node.style.transform = '';
      options.onDismiss(direction);
      return;
    }
    settled = false;
    const sign = direction === 'left' ? -1 : 1;
    node.style.transition = `transform ${SWIPE_MS}ms ease, opacity ${SWIPE_MS}ms ease`;
    node.style.transform = followTransform(sign * SWIPE_EXIT_PX);
    node.style.opacity = '0';
    const done = () => {
      node.removeEventListener('transitionend', done);
      clearTimeout(fallback);
      node.style.transition = 'none';
      node.style.transform = '';
      node.style.opacity = '';
      settled = true;
      options.onDismiss(direction);
    };
    // A card whose transition never fires (hidden tab, a browser without transitions) still leaves.
    const fallback = setTimeout(done, SWIPE_MS + 50);
    node.addEventListener('transitionend', done);
  }

  /** The click a drag ends with would open the card; a drag past the slop is not a tap. */
  function onClick(event: MouseEvent) {
    if (!moved) return;
    moved = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  node.addEventListener('pointerdown', onDown);
  node.addEventListener('pointermove', onMove);
  node.addEventListener('pointerup', onUp);
  node.addEventListener('pointercancel', onUp);
  node.addEventListener('click', onClick, true);
  return {
    update(next: SwipeOptions) {
      options = next;
    },
    destroy() {
      node.removeEventListener('pointerdown', onDown);
      node.removeEventListener('pointermove', onMove);
      node.removeEventListener('pointerup', onUp);
      node.removeEventListener('pointercancel', onUp);
      node.removeEventListener('click', onClick, true);
    },
  };
}

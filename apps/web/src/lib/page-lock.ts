/**
 * The page held still while a card is open on a phone (ADR 0025; learning note 13).
 *
 * On an iPhone the keyboard covers the lower half of the page instead of making it shorter. The
 * page is then taller than what is visible, so Safari lets a finger drag it, even when nothing
 * on it scrolls, and `overflow: hidden` on the page does not stop that. The open card follows
 * the visible part a moment late (lib/viewport.ts), and the picture flickers.
 *
 * So while a card or the place to write is open on a phone, this guard watches every finger on
 * the page. A drag is let through only when it lands on something that scrolls up and down and
 * has more to show in the direction the finger goes: the text in the field, or the part of the
 * card around it. Every other drag is cancelled, and nothing moves. Two fingers are never
 * touched, so a pinch still zooms. This is the one place in the client that cancels a touch.
 */

/** What the guard reads of an element that scrolls; a test hands in plain numbers. */
export interface Scroller {
  readonly scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
}

/**
 * Whether an element has more to show when a finger moves by `dy` (CSS pixels, down the screen
 * is positive). A finger moving down pulls the content down and shows what is above: there is
 * more when the element is not at its top. A finger moving up shows what is below: there is more
 * when the element is more than a pixel short of its end (a browser rounds a scrolled position).
 */
export function hasMore(scroller: Scroller, dy: number): boolean {
  if (dy > 0) return scroller.scrollTop > 0;
  if (dy < 0) return scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1;
  return false;
}

/**
 * Whether a one-finger move of (`dx`, `dy`) from where the finger went down is stopped, given
 * the elements that scroll up and down under it, innermost first. A move more sideways than up
 * or down is stopped: nothing in an open card scrolls sideways. A move that has not gone
 * anywhere yet is left alone. Otherwise the move goes through only when one of those elements
 * has more to show in its direction.
 */
export function stopsMove(dx: number, dy: number, scrollers: readonly Scroller[]): boolean {
  if (dx === 0 && dy === 0) return false;
  if (Math.abs(dx) > Math.abs(dy)) return true;
  return !scrollers.some((s) => hasMore(s, dy));
}

/** Whether an element scrolls up and down: a field, or anything the stylesheet lets scroll. */
function scrollsUpAndDown(el: Element): boolean {
  if (el instanceof HTMLTextAreaElement) return true;
  const overflow = getComputedStyle(el).overflowY;
  return overflow === 'auto' || overflow === 'scroll';
}

/** The elements that scroll up and down from `target` up to `root`, `root` itself left out. */
function scrollersFrom(target: EventTarget | null, root: HTMLElement): HTMLElement[] {
  const found: HTMLElement[] = [];
  let el: Element | null = target instanceof Element ? target : null;
  if (!el && target instanceof Node) el = target.parentElement;
  while (el && el !== root) {
    if (el instanceof HTMLElement && scrollsUpAndDown(el)) found.push(el);
    el = el.parentElement;
  }
  return found;
}

export interface LockOptions {
  /**
   * How far the page is pinched in; 1 when it is not. While it is pinched in, one finger moves
   * the zoomed view around the page, and that is left to the browser. The browser's own
   * `visualViewport.scale` by default; a test hands in its own.
   */
  scale?: () => number;
}

function browserScale(): number {
  return (typeof window !== 'undefined' ? window.visualViewport?.scale : undefined) ?? 1;
}

/**
 * Hold the page: from now on a one-finger drag that would move nothing inside `root` but the
 * page is cancelled. Returns the function that lets the page go.
 *
 * The listeners are on the document, so a finger on the grey around the card is caught as well.
 * `touchmove` is listened to with `passive: false`: Safari treats a document's touch listeners
 * as passive otherwise, and ignores `preventDefault` in them.
 */
export function lockPage(root: HTMLElement, options: LockOptions = {}): () => void {
  const scale = options.scale ?? browserScale;
  let startX = 0;
  let startY = 0;
  const onStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    if (event.touches.length !== 1 || !touch) return;
    startX = touch.clientX;
    startY = touch.clientY;
  };
  const onMove = (event: TouchEvent) => {
    const touch = event.touches[0];
    // Two fingers or more: a pinch, left to the browser.
    if (event.touches.length !== 1 || !touch) return;
    // A move the browser has already started to scroll can no longer be cancelled.
    if (!event.cancelable) return;
    // Pinched in: one finger moves the zoomed view, which a person needs to read.
    if (scale() > 1.01) return;
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    if (stopsMove(dx, dy, scrollersFrom(event.target, root))) event.preventDefault();
  };
  document.addEventListener('touchstart', onStart, { passive: true });
  document.addEventListener('touchmove', onMove, { passive: false });
  return () => {
    document.removeEventListener('touchstart', onStart);
    document.removeEventListener('touchmove', onMove);
  };
}

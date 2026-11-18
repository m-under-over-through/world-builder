/**
 * The part of a phone's screen that is still visible while a card is open (ADR 0023).
 *
 * On an iPhone the keyboard does not make the page shorter. The layout viewport, and with it
 * `100dvh`, keeps its height; the keyboard covers the lower half, and Safari scrolls the page
 * to keep the field in sight. Only `window.visualViewport` says what is left: its `height` is
 * the part above the keyboard, and its `offsetTop` is how far Safari scrolled. An element with
 * `position: fixed` stays fixed to the layout viewport, so the open card's frame is moved down
 * by `offsetTop` and made as tall as `height`. On Android Chrome the page's viewport line
 * (`interactive-widget=resizes-content`) makes the layout viewport shrink for the keyboard,
 * and the visual viewport then has the same box, so the same two numbers serve both.
 *
 * This module keeps two custom properties on the app's root up to date while a card or the
 * blank card is open on a phone, and says whether the keyboard is up. Without a visual viewport
 * it does nothing, and the open card is laid out as before.
 */

/** The custom properties the stylesheet reads (app.css, "the open card above the keyboard"). */
export const VV_HEIGHT = '--vv-height';
export const VV_TOP = '--vv-top';

/**
 * How much lower than the page the visible part must be before it counts as a keyboard. A
 * phone's keyboard takes 250 pixels or more; Safari's bars growing and shrinking change the
 * visible part by less than 120 (ADR 0023).
 */
export const KEYBOARD_MIN = 150;

/** What the module reads of `window.visualViewport`; a test hands in a stand-in. */
export interface ViewportLike {
  readonly height: number;
  readonly offsetTop: number;
  addEventListener(type: 'resize' | 'scroll', listener: () => void): void;
  removeEventListener(type: 'resize' | 'scroll', listener: () => void): void;
}

/** The visible part, in CSS pixels, and whether the keyboard takes the rest. */
export interface Frame {
  height: number;
  top: number;
  keyboard: boolean;
}

/** The keyboard is up when the visible part is clearly lower than the page, not for a browser bar. */
export function keyboardUp(layoutHeight: number, visualHeight: number): boolean {
  return layoutHeight - visualHeight >= KEYBOARD_MIN;
}

/** The frame for one reading of the visual viewport. */
export function frameOf(viewport: ViewportLike, layoutHeight: number): Frame {
  const height = Math.max(0, viewport.height);
  const top = Math.max(0, viewport.offsetTop);
  return { height, top, keyboard: keyboardUp(layoutHeight, height) };
}

export interface FollowOptions {
  /** The visual viewport; the browser's own by default. */
  viewport?: ViewportLike | null;
  /** The layout viewport's height: the page's own box, which an iPhone's keyboard does not change. */
  layoutHeight?: () => number;
  /** Called with each new frame, the first one included. */
  onChange?: (frame: Frame) => void;
}

function browserViewport(): ViewportLike | null {
  return typeof window !== 'undefined' ? (window.visualViewport ?? null) : null;
}

function pageHeight(): number {
  return document.documentElement.clientHeight || window.innerHeight;
}

/**
 * Follow the visual viewport: set the two properties on `root` now and on every `resize` and
 * `scroll` of the visual viewport. Returns the function that stops and clears them, or null
 * when the browser has no visual viewport (nothing is set, and nothing needs stopping).
 */
export function followViewport(
  root: HTMLElement,
  options: FollowOptions = {},
): (() => void) | null {
  const viewport = options.viewport === undefined ? browserViewport() : options.viewport;
  if (!viewport) return null;
  const layoutHeight = options.layoutHeight ?? pageHeight;
  const update = () => {
    const frame = frameOf(viewport, layoutHeight());
    root.style.setProperty(VV_HEIGHT, `${frame.height}px`);
    root.style.setProperty(VV_TOP, `${frame.top}px`);
    options.onChange?.(frame);
  };
  update();
  viewport.addEventListener('resize', update);
  viewport.addEventListener('scroll', update);
  return () => {
    viewport.removeEventListener('resize', update);
    viewport.removeEventListener('scroll', update);
    root.style.removeProperty(VV_HEIGHT);
    root.style.removeProperty(VV_TOP);
  };
}

/** The custom property that carries the height of the text in a field (app.css reads it). */
export const FIELD_TEXT = '--field-text';

/**
 * Let a field grow with its text (ADR 0023): measure the height the text needs and hand it to
 * the stylesheet, which makes it the field's least height while a card is open on a phone. A
 * field measures its text only when it is lower than the text, so for a moment it is made as
 * low as it can be; the reading and the putting back happen before the browser paints.
 */
export function growField(field: HTMLTextAreaElement): void {
  const style = field.style;
  const before = {
    height: style.height,
    minHeight: style.minHeight,
    flexGrow: style.flexGrow,
    flexBasis: style.flexBasis,
  };
  style.height = '0px';
  style.minHeight = '0px';
  style.flexGrow = '0';
  style.flexBasis = '0px';
  // The borders are in the field's box and not in its scroll height.
  const text = field.scrollHeight + (field.offsetHeight - field.clientHeight);
  style.height = before.height;
  style.minHeight = before.minHeight;
  style.flexGrow = before.flexGrow;
  style.flexBasis = before.flexBasis;
  if (text > 0) style.setProperty(FIELD_TEXT, `${text}px`);
  else style.removeProperty(FIELD_TEXT);
}

/**
 * When the text grows past the bottom of the frame and the caret is at its end, where someone
 * typing is, scroll the frame so the last line stays in sight. Elsewhere in the text the
 * browser keeps the caret in view itself.
 */
export function keepEndInView(field: HTMLTextAreaElement, frame: HTMLElement | null): void {
  if (!frame || field.selectionEnd !== field.value.length) return;
  const below = field.getBoundingClientRect().bottom - frame.getBoundingClientRect().bottom;
  if (below > 0) frame.scrollTop += below + 8;
}

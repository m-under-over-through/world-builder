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
 * place to write is open on a phone, and says whether the keyboard is up. Without a visual
 * viewport it does nothing, and the open card is laid out as before.
 *
 * The frame is a fixed box since ADR 0025: the text scrolls inside the field, and nothing here
 * measures it. What keeps a finger from dragging the page under the frame is lib/page-lock.ts.
 * Learning note 13 tells the whole story.
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
  /** How far the page is pinched in; 1 when it is not. */
  readonly scale?: number;
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
  // A page pinched in also has a lower visible part, and no keyboard: no strip is kept for it.
  const pinched = (viewport.scale ?? 1) > 1.01;
  return { height, top, keyboard: !pinched && keyboardUp(layoutHeight, height) };
}

/**
 * The share of the page taken as free above a phone's keyboard the first time, before the
 * browser has said. A little low on purpose: a card that grows by a few pixels once the
 * keyboard has settled reads better than one whose foot is cut off and then jumps up.
 */
export const KEYBOARD_GUESS = 0.5;

/**
 * How long the keyboard is waited for before the page believes there is none (a phone with a
 * keyboard attached, a field that did not take the focus). An iPhone's keyboard is up within
 * half a second.
 */
export const KEYBOARD_WAIT_MS = 1000;

/**
 * What was left above the keyboard the last time it was up, by the page's width: a phone on
 * its side has another keyboard. Kept in memory only, until the page is closed.
 */
const remembered = new Map<number, number>();

/** Forget what earlier keyboards left free. For tests. */
export function forgetKeyboards(): void {
  remembered.clear();
}

/** The height to expect above the keyboard on a page this wide and this tall. */
export function expectedHeight(layoutWidth: number, layoutHeight: number): number {
  return remembered.get(layoutWidth) ?? Math.round(layoutHeight * KEYBOARD_GUESS);
}

export interface FollowOptions {
  /** The visual viewport; the browser's own by default. */
  viewport?: ViewportLike | null;
  /** The layout viewport's height: the page's own box, which an iPhone's keyboard does not change. */
  layoutHeight?: () => number;
  /** The layout viewport's width, to remember a keyboard by. */
  layoutWidth?: () => number;
  /**
   * The keyboard is about to rise: a touch screen, and a field about to take the focus. The
   * frame then starts at the height the keyboard is expected to leave, not at the whole page.
   * An iPhone says how much is left only once its keyboard has stopped moving; without this the
   * card opens over the whole screen, the keyboard covers its lower half, and the card jumps
   * to half its height a moment later (Marco's "weird and janky", 18 November 2026).
   */
  expectKeyboard?: boolean;
  /** Called with each new frame, the first one included. */
  onChange?: (frame: Frame) => void;
}

function browserViewport(): ViewportLike | null {
  return typeof window !== 'undefined' ? (window.visualViewport ?? null) : null;
}

/**
 * Whether the browser reports a visual viewport, so that `followViewport` will frame the card.
 * App.svelte reads it in the same render that shows the card, so the frame's class is on the
 * root from the card's first frame (ADR 0025).
 */
export function hasVisualViewport(): boolean {
  return browserViewport() !== null;
}

function pageHeight(): number {
  return document.documentElement.clientHeight || window.innerHeight;
}

function pageWidth(): number {
  return document.documentElement.clientWidth || window.innerWidth;
}

/** Whether this is a screen worked by a finger, where a field brings a keyboard up. */
export function touchScreen(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;
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
  const layoutWidth = options.layoutWidth ?? pageWidth;
  // Waiting for a keyboard that has not said where it stops yet.
  let expecting = options.expectKeyboard === true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const update = () => {
    const real = frameOf(viewport, layoutHeight());
    if (real.keyboard) {
      // The keyboard has settled: this is the box, and the next opening starts from it.
      remembered.set(layoutWidth(), real.height);
      expecting = false;
      clearTimeout(timer);
    }
    const frame: Frame =
      expecting && !real.keyboard
        ? {
            height: Math.min(real.height, expectedHeight(layoutWidth(), layoutHeight())),
            top: real.top,
            keyboard: true,
          }
        : real;
    root.style.setProperty(VV_HEIGHT, `${frame.height}px`);
    root.style.setProperty(VV_TOP, `${frame.top}px`);
    options.onChange?.(frame);
  };
  update();
  if (expecting)
    timer = setTimeout(() => {
      // No keyboard came: the whole visible part is the card's after all.
      expecting = false;
      update();
    }, KEYBOARD_WAIT_MS);
  viewport.addEventListener('resize', update);
  viewport.addEventListener('scroll', update);
  return () => {
    clearTimeout(timer);
    viewport.removeEventListener('resize', update);
    viewport.removeEventListener('scroll', update);
    root.style.removeProperty(VV_HEIGHT);
    root.style.removeProperty(VV_TOP);
  };
}

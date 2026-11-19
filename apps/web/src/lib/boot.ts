/**
 * The page's own first screen, and the app taking over from it (ADR 0028; learning note 16).
 *
 * The page as served (index.html) carries a first screen of its own inside `#app`: the app's name
 * where the header draws it, and a line that shows after eight seconds. It is there for the case
 * where the app's script never starts. A small script of the page's own (public/boot.js) looks for
 * it when the window has loaded: still there means the app did not start, and the page is loaded
 * once more, with a mark in the tab's session storage so it happens only once.
 *
 * When the app does start, `startApp` takes the page's screen away, mounts the app in its place
 * and forgets the mark, so a later failure in the same tab gets its one try too.
 */

/** The class on the outer element of the page's own first screen. boot.js and app.css name it too. */
export const BOOT_CLASS = 'boot';

/** The tab's note that the page has already been loaded once more (public/boot.js sets it). */
export const RELOAD_MARK = 'wb:reloaded';

/** Take the page's own first screen out of the target; null when the target has none. */
export function takeBootScreen(target: Element): Element | null {
  const screen = target.querySelector(`:scope > .${BOOT_CLASS}`);
  screen?.remove();
  return screen;
}

/** Forget the mark. Quietly nothing where the browser refuses session storage. */
export function forgetReload(): void {
  try {
    sessionStorage.removeItem(RELOAD_MARK);
  } catch {
    /* no session storage: boot.js could not have set the mark either */
  }
}

/**
 * Take the page's screen away, mount the app, forget the mark.
 *
 * The screen is taken out before the mount, since Svelte's `mount` adds to its target and does not
 * empty it. If the mount throws, the target is put back as the page had it: the screen alone,
 * without whatever the mount left half drawn. So the name and the late line stay on the screen,
 * boot.js still finds the screen at `load` and loads the page once more, and the mark is not
 * forgotten, so that reload happens once and not in a loop. The error is thrown on, as before.
 */
export function startApp(target: Element, mountApp: () => void): void {
  const screen = takeBootScreen(target);
  try {
    mountApp();
  } catch (error) {
    if (screen) target.replaceChildren(screen);
    throw error;
  }
  forgetReload();
}

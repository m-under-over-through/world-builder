import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOOT_CLASS, RELOAD_MARK, startApp, takeBootScreen } from '../src/lib/boot.ts';
import { Copy } from '../src/lib/copy.ts';

/**
 * The page is never empty (ADR 0028): the page's own first screen in index.html, the stylesheet
 * that shows its line late, the one reload in public/boot.js, and the app taking over in
 * src/lib/boot.ts. What a test DOM cannot do, load a real page and fail its script, is in the
 * build log's hand checks and docs/device-tests.md.
 */

// Anchored on this file; the test DOM's own URL class cannot make a file path, Node's helper can.
const web = join(fileURLToPath(import.meta.url), '../..');
const workshops = join(web, '../../workshops');
const indexHtml = readFileSync(join(web, 'index.html'), 'utf8');
const css = readFileSync(join(web, 'src/app.css'), 'utf8');
const bootJs = readFileSync(join(web, 'public/boot.js'), 'utf8');

const page = new DOMParser().parseFromString(indexHtml, 'text/html');
const words = (el: Element | null | undefined) =>
  (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('the page as served (index.html)', () => {
  it("has the app's name and the line for a script that did not start", () => {
    const screens = page.querySelectorAll(`#app > .${BOOT_CLASS}`);
    expect(screens).toHaveLength(1);
    const screen = screens[0]!;
    // The app's own classes, so the name sits where the app's header draws it while loading.
    expect(screen.classList.contains('app')).toBe(true);
    expect(page.getElementById('app')!.children).toHaveLength(1);
    const name = screen.querySelector(':scope > header.topbar > .lines > span.name');
    const line = screen.querySelector(':scope > main.text > p.muted');
    expect(words(name)).toBe('World Builder');
    // No organizer: the page does not know the workshop.
    expect(screen.querySelector('.organizer')).toBeNull();

    const slugs = readdirSync(workshops).filter((dir) => !dir.startsWith('.'));
    expect(slugs.length).toBeGreaterThan(0);
    for (const slug of slugs) {
      const copy = Copy.parse(readFileSync(join(workshops, slug, 'copy.md'), 'utf8'));
      // The two cannot drift: change the words in copy.md and index.html together.
      expect(words(line), slug).toBe(copy.error('CLIENT_NOT_STARTED'));
      expect(words(name), slug).toBe(copy.item('App labels', 'app name'));
    }
  });

  it("holds only the tags the operations repository's scan allows, inside the page's screen", () => {
    const allowed = new Set(['div', 'header', 'main', 'span', 'p']);
    const screen = page.querySelector(`#app > .${BOOT_CLASS}`)!;
    for (const el of [screen, ...screen.querySelectorAll('*')])
      expect(allowed.has(el.localName), el.localName).toBe(true);
  });

  it('loads boot.js async, before the app, and has no inline script, no style attribute and no on... attribute (the Content Security Policy is self only)', () => {
    const scripts = [...page.querySelectorAll('script')];
    for (const script of scripts) {
      expect(script.getAttribute('src'), 'every script is a file').toBeTruthy();
      expect(script.textContent?.trim()).toBe('');
    }
    const boot = scripts.find((s) => s.getAttribute('src') === '/boot.js');
    expect(boot).toBeDefined();
    expect(boot!.hasAttribute('async')).toBe(true);
    expect(boot!.getAttribute('type')).toBeNull();
    expect(scripts.indexOf(boot!)).toBeLessThan(
      scripts.findIndex((s) => s.getAttribute('type') === 'module'),
    );
    expect(page.querySelectorAll('style')).toHaveLength(0);
    for (const el of page.querySelectorAll('*')) {
      expect(el.hasAttribute('style'), el.localName).toBe(false);
      for (const attribute of el.getAttributeNames())
        expect(attribute.startsWith('on'), `${el.localName} ${attribute}`).toBe(false);
    }
  });

  it('boot.js names the same class and the same mark as src/lib/boot.ts', () => {
    expect(bootJs).toContain(`'.${BOOT_CLASS}'`);
    expect(bootJs).toContain(`'${RELOAD_MARK}'`);
    expect(RELOAD_MARK).toMatch(/^wb:/);
  });
});

/** The text of a block that opens at `start`, up to the brace that closes it. */
function block(source: string, start: number): string {
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error('unclosed block');
}

describe('the stylesheet (app.css, read as text: a check of the words, not of a rendered page)', () => {
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, '');

  it('the stylesheet keeps the line hidden for eight seconds, with reduced motion too', () => {
    const rule = block(plain, plain.indexOf(`\n.${BOOT_CLASS} .muted {`));
    expect(rule).toContain('visibility: hidden;');
    // Shown by an animation that waits 8 seconds and keeps its end: visibility, not opacity, so a
    // screen reader does not read the line before it shows.
    expect(rule).toContain('animation: boot-late 1ms linear 8s forwards;');
    const keyframes = block(plain, plain.indexOf('@keyframes boot-late {'));
    expect(keyframes.replace(/\s+/g, ' ')).toBe(
      '@keyframes boot-late { from, to { visibility: visible; } }',
    );
    // With reduced motion the delay holds: nothing in that block touches the line, its
    // keyframes or animations in general.
    const reduced = block(plain, plain.indexOf('@media (prefers-reduced-motion: reduce) {'));
    expect(reduced).not.toContain(BOOT_CLASS);
    expect(reduced).not.toContain('boot-late');
    expect(reduced).not.toMatch(/animation-(delay|duration)|animation:/);
    // And no rule for any element (a `*` selector) anywhere sets the animations of everything.
    for (const [, selector, body] of plain.matchAll(/([^{}]*)\{([^{}]*)\}/g))
      if (selector!.includes('*')) expect(body, selector).not.toContain('animation');
  });

  it('puts the name where the app draws it while loading: the room of the organizer kept on a phone, the laptop header from 600 pixels', () => {
    /** The declarations of the rule for exactly this selector, at the start of a line. */
    const body = (selector: string, from = plain) => {
      const escaped = selector.replace(/[.*]/g, (c) => `\\${c}`);
      const at = new RegExp(`\\n[ ]*${escaped} \\{`).exec(from);
      expect(at, selector).not.toBeNull();
      const rule = block(from, at!.index + 1);
      return rule
        .slice(rule.indexOf('{') + 1, -1)
        .replace(/\s+/g, ' ')
        .trim();
    };
    // On a phone the header centres its lines; the app's first frame at a workshop's address has
    // the organizer under the name, so the page keeps that line's room: the gap and one line.
    const gap = /gap: (\d+)px;/.exec(body('.topbar .lines'))![1];
    const organizer = body('.topbar .organizer');
    const size = /font-size: (\d+)px;/.exec(organizer)![1];
    const height = /line-height: ([\d.]+);/.exec(organizer)![1];
    expect(body(`.app.${BOOT_CLASS} .topbar .lines`)).toContain(
      `padding-bottom: calc(${gap}px + ${size}px * ${height});`,
    );
    // From 600 pixels the app is the laptop page before its first paint: the same header.
    const at = plain.indexOf(`.app.${BOOT_CLASS} .topbar {`);
    const media = plain.lastIndexOf('@media', at);
    expect(plain.slice(media, plain.indexOf('{', media)).trim()).toBe('@media (min-width: 600px)');
    const wide = block(plain, media);
    for (const [boot, app] of [
      [`.app.${BOOT_CLASS} .topbar`, '.app.wide .topbar'],
      [`.app.${BOOT_CLASS} .topbar .name`, '.app.wide .topbar .name'],
    ] as const)
      for (const declaration of body(boot, wide).split(';')) {
        if (!declaration.trim()) continue;
        expect(body(app), `${boot}: ${declaration}`).toContain(`${declaration.trim()};`);
      }
  });
});

/** boot.js run as a browser runs it, against a stand-in window, document, storage and address. */
function runBoot(options: {
  started: boolean;
  readyState?: DocumentReadyState;
  storage?: { getItem(key: string): string | null; setItem(key: string, value: string): void };
}) {
  const app = document.createElement('div');
  app.id = 'app';
  if (!options.started) app.innerHTML = `<div class="app ${BOOT_CLASS}"></div>`;
  const listeners: Record<string, (() => void)[]> = {};
  const win = {
    addEventListener: (type: string, fn: () => void) => (listeners[type] ??= []).push(fn),
  };
  const doc = {
    readyState: options.readyState ?? 'interactive',
    getElementById: (id: string) => (id === 'app' ? app : null),
  };
  const values = new Map<string, string>();
  const storage = options.storage ?? {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
  const location = { reload: vi.fn() };
  new Function('window', 'document', 'sessionStorage', 'location', bootJs)(
    win,
    doc,
    storage,
    location,
  );
  const load = () => (listeners['load'] ?? []).forEach((fn) => fn());
  return { location, values, load, listeners };
}

describe('boot.js: one reload when the app did not start', () => {
  it('the app started: no reload', () => {
    const run = runBoot({ started: true });
    run.load();
    expect(run.location.reload).not.toHaveBeenCalled();
    expect(run.values.size).toBe(0);
  });

  it("the page's screen still there at load: one reload, and the mark set", () => {
    const run = runBoot({ started: false });
    expect(run.location.reload).not.toHaveBeenCalled();
    run.load();
    expect(run.location.reload).toHaveBeenCalledTimes(1);
    expect([...run.values]).toEqual([[RELOAD_MARK, '1']]);
  });

  it('the mark already set: no reload', () => {
    const run = runBoot({
      started: false,
      storage: { getItem: () => '1', setItem: vi.fn() },
    });
    run.load();
    expect(run.location.reload).not.toHaveBeenCalled();
  });

  it('storage that throws on read: no reload', () => {
    const run = runBoot({
      started: false,
      storage: {
        getItem: () => {
          throw new DOMException('refused', 'SecurityError');
        },
        setItem: vi.fn(),
      },
    });
    run.load();
    expect(run.location.reload).not.toHaveBeenCalled();
  });

  it('storage that throws on write: no reload', () => {
    const run = runBoot({
      started: false,
      storage: {
        getItem: () => null,
        setItem: () => {
          throw new DOMException('full', 'QuotaExceededError');
        },
      },
    });
    run.load();
    expect(run.location.reload).not.toHaveBeenCalled();
  });

  it('the document already complete when the script runs: it checks at once, and waits for nothing', () => {
    const run = runBoot({ started: false, readyState: 'complete' });
    expect(run.location.reload).toHaveBeenCalledTimes(1);
    expect(run.listeners['load']).toBeUndefined();
    const started = runBoot({ started: true, readyState: 'complete' });
    expect(started.location.reload).not.toHaveBeenCalled();
  });
});

describe('the app taking over from the page (src/lib/boot.ts)', () => {
  let target: HTMLDivElement;
  beforeEach(() => {
    target = document.createElement('div');
    target.innerHTML = `<div class="app ${BOOT_CLASS}"><header class="topbar"></header></div>`;
    sessionStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  const mountSomething = () => {
    const app = document.createElement('div');
    app.className = 'app';
    target.append(app);
  };

  it("removes the page's own screen from the target, and the app is all that is left", () => {
    startApp(target, mountSomething);
    expect(target.querySelector(`.${BOOT_CLASS}`)).toBeNull();
    expect(target.children).toHaveLength(1);
    expect(target.firstElementChild!.className).toBe('app');
  });

  it('takes the screen out before the mount, since a mount adds to its target', () => {
    let seen = -1;
    startApp(target, () => (seen = target.querySelectorAll(`.${BOOT_CLASS}`).length));
    expect(seen).toBe(0);
  });

  it('removes the mark, so a later failure in this tab gets its one try too', () => {
    sessionStorage.setItem(RELOAD_MARK, '1');
    startApp(target, mountSomething);
    expect(sessionStorage.getItem(RELOAD_MARK)).toBeNull();
  });

  it('does not throw when storage throws', () => {
    vi.stubGlobal('sessionStorage', {
      removeItem: () => {
        throw new DOMException('refused', 'SecurityError');
      },
    });
    expect(() => startApp(target, mountSomething)).not.toThrow();
    expect(target.querySelector(`.${BOOT_CLASS}`)).toBeNull();
  });

  it('leaves a target without that screen alone', () => {
    const other = document.createElement('p');
    target.replaceChildren(other);
    expect(takeBootScreen(target)).toBeNull();
    expect([...target.children]).toEqual([other]);
    // Only the page's own screen, the target's child: nothing of that class deeper down.
    const deeper = document.createElement('div');
    deeper.innerHTML = `<div class="${BOOT_CLASS}"></div>`;
    target.replaceChildren(deeper);
    expect(takeBootScreen(target)).toBeNull();
    expect(target.firstElementChild).toBe(deeper);
  });

  it("puts the page's screen back, alone, when the mount throws, and keeps the mark so boot.js does not loop", () => {
    const screen = target.firstElementChild;
    sessionStorage.setItem(RELOAD_MARK, '1');
    expect(() =>
      startApp(target, () => {
        mountSomething();
        throw new Error('the app could not draw');
      }),
    ).toThrow('the app could not draw');
    expect([...target.children]).toEqual([screen]);
    expect(sessionStorage.getItem(RELOAD_MARK)).toBe('1');
  });
});

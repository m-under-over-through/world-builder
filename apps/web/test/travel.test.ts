import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { Session } from '@wb/contracts';
import App from '../src/App.svelte';
import { currentCardId, replaySession } from '../src/lib/session.ts';
import { AppState, CLOSE_MS } from '../src/lib/state.svelte.ts';
import { opacityOf, routeOf, travelOf, type Rect } from '../src/lib/travel.ts';
import { WorkshopStore } from '../src/lib/store.ts';
import { findWorkshop } from '../src/lib/workshops.ts';
import { answerFront, freshIndexedDb, stubRoutes } from './helpers.ts';

/**
 * The travelling card (ADR 0027, "A motion says where the card went"; lib/travel.ts and
 * components/TravellingCard.svelte). Which place to which is pure arithmetic and is tested on
 * plain values. In the page, the test DOM has no layout (every rectangle is zeros) and no
 * `element.animate`: the tests that need a travel give it both by hand (`withMotion`), and
 * say so; the others show that without them nothing travels and nothing breaks.
 */
const SLUG = 'rural-manufacturing';
const workshop = findWorkshop(SLUG)!;
const copy = workshop.copy;
const SESSION: Session = {
  id: '00000000-0000-4000-8000-000000000001',
  sessionNo: 1,
  startedDay: '2026-11-16',
  deckVersion: workshop.deck.version,
  seed: '0123456789abcdef',
};

const R = (left: number, top: number, width: number, height: number): Rect => ({
  left,
  top,
  width,
  height,
});
const FRONT = R(40, 120, 300, 400);
const TILE = R(700, 140, 240, 150);
const PILL = R(80, 600, 215, 48);
const OPEN = R(320, 100, 640, 600);
const ALL = { front: FRONT, tile: TILE, pill: PILL, open: OPEN };

describe('which place to which (lib/travel.ts)', () => {
  const table: [string, Parameters<typeof routeOf>, string | null][] = [
    // [row, [moment, opened from, wide], 'from > to' or null]
    ['opens from the card in front, laptop', ['open', 'front', true], 'front > open'],
    ['opens from the card in front, phone', ['open', 'front', false], 'front > open'],
    ['opens from a tile, laptop', ['open', 'tile', true], 'tile > open'],
    ['opens from a tile, phone', ['open', 'tile', false], 'tile > open'],
    ['a new blank card opens, laptop', ['open', 'new', true], null],
    ['a new blank card opens, phone', ['open', 'new', false], null],
    ['closes to the card in front, laptop', ['close', 'front', true], 'open > front'],
    ['closes to the card in front, phone', ['close', 'front', false], 'open > front'],
    ['closes to its tile, laptop', ['close', 'tile', true], 'open > tile'],
    [
      'closes to the pill, phone, since its tile is behind it',
      ['close', 'tile', false],
      'open > pill',
    ],
    ['a new blank card closes, laptop', ['close', 'new', true], null],
    ['a new blank card closes, phone', ['close', 'new', false], null],
    ['saved from the card in front, laptop: its tile', ['save', 'front', true], 'open > tile'],
    ['saved from the card in front, phone: the pill', ['save', 'front', false], 'open > pill'],
    ['saved from a tile, laptop: its tile', ['save', 'tile', true], 'open > tile'],
    ['saved from a tile, phone: the pill', ['save', 'tile', false], 'open > pill'],
    ['a new blank card saved, laptop: its new tile', ['save', 'new', true], 'open > tile'],
    ['a new blank card saved, phone: the pill', ['save', 'new', false], 'open > pill'],
  ];
  for (const [row, args, expected] of table)
    it(`a card that ${row} travels ${expected ?? 'nowhere: it fades'}`, () => {
      const route = routeOf(...args);
      expect(route && `${route.from} > ${route.to}`).toBe(expected);
      const travel = travelOf(route, ALL, false);
      if (expected === null) expect(travel).toBeNull();
      else
        expect(travel).toEqual({ from: ALL[route!.from], to: ALL[route!.to], fade: route!.fade });
    });

  it('with reduced motion nothing travels, whatever the moment', () => {
    for (const [, args] of table) expect(travelOf(routeOf(...args), ALL, true)).toBeNull();
  });

  it('a rectangle that could not be measured, or has no size, means nothing travels, and that is no error', () => {
    const route = routeOf('close', 'tile', true);
    expect(travelOf(route, { open: OPEN }, false)).toBeNull();
    expect(travelOf(route, { open: OPEN, tile: null }, false)).toBeNull();
    expect(travelOf(route, { open: OPEN, tile: R(700, 140, 0, 0) }, false)).toBeNull();
    expect(travelOf(route, { open: R(0, 0, 640, Number.NaN), tile: TILE }, false)).toBeNull();
    expect(travelOf(route, { open: OPEN, tile: TILE }, false)).not.toBeNull();
  });

  it('it lands on the open card as that fades in, whole on a card or a tile, and fades into the pill, which is not a card', () => {
    expect(routeOf('open', 'front', true)!.fade).toBe('out');
    expect(routeOf('close', 'front', false)!.fade).toBe('in');
    expect(routeOf('save', 'front', true)!.fade).toBe('in');
    expect(routeOf('save', 'front', false)!.fade).toBe('through');
    expect(routeOf('close', 'tile', false)!.fade).toBe('through');
    const ends = (fade: 'in' | 'out' | 'through') => {
      const frames = opacityOf(fade);
      return [frames[0]!.opacity, frames.at(-1)!.opacity, frames[0]!.offset, frames.at(-1)!.offset];
    };
    expect(ends('out')).toEqual([1, 0, 0, 1]);
    expect(ends('in')).toEqual([0, 1, 0, 1]);
    expect(ends('through')).toEqual([0, 0, 0, 1]);
  });
});

// ---------- in the page ----------

beforeEach(freshIndexedDb);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (Element.prototype as { animate?: unknown }).animate;
});

async function onACard(patch: Partial<AppState> = {}): Promise<AppState> {
  stubRoutes({});
  const app = new AppState();
  app.workshop = workshop;
  app.copy = copy;
  app.store = new WorkshopStore(SLUG);
  await app.store.set('demoSeen', '2026-11-16');
  await app.store.putSession({ ...SESSION, synced: 0 });
  app.wait = async () => {};
  app.code = '1234567890123456';
  app.history = { sessions: [SESSION], events: [] };
  app.live = replaySession(workshop.deck, workshop.config, SESSION, app.history);
  app.card = workshop.deck.cards.find((c) => c.id === currentCardId(app.live!));
  app.cardNo = 1;
  app.screen = 'card';
  Object.assign(app, patch);
  return app;
}

function renderApp(app: AppState) {
  app.open = async () => {};
  return render(App, { app });
}

interface Animation {
  node: Element;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  finish: () => void;
}

/**
 * What a browser has and the test DOM has not, given by hand: `element.animate`, which records
 * what it is asked and finishes only when the test says so, and a layout, where the card in
 * front, a tile (by the item that holds it), the pill and the open card each have a rectangle.
 * Everything else measures zeros, as before.
 */
function withMotion() {
  const animations: Animation[] = [];
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    writable: true,
    value(this: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
      const animation = {
        onfinish: null as (() => void) | null,
        cancel: () => {},
      };
      animations.push({
        node: this,
        keyframes,
        options,
        finish: () => animation.onfinish?.(),
      });
      return animation;
    },
  });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const rect = this.matches('.stack button.card.front')
      ? FRONT
      : this.matches('.tile-item')
        ? TILE
        : this.matches('#world-pill')
          ? PILL
          : this.matches('.open-card')
            ? OPEN
            : R(0, 0, 0, 0);
    return {
      ...rect,
      x: rect.left,
      y: rect.top,
      right: 0,
      bottom: 0,
      toJSON: () => rect,
    } as DOMRect;
  });
  /** The way of the last travel: its first and last place. */
  const lastWay = () => {
    const way = animations.filter((a) => a.keyframes[0] && 'left' in a.keyframes[0]).at(-1)!;
    const at = (k: Keyframe) => [k['left'], k['top'], k['width'], k['height']];
    return { from: at(way.keyframes[0]!), to: at(way.keyframes.at(-1)!), way };
  };
  return { animations, lastWay };
}
const px = (r: Rect) => [`${r.left}px`, `${r.top}px`, `${r.width}px`, `${r.height}px`];
const layer = () => document.querySelector<HTMLElement>('.travelling-card');
const frontCard = () =>
  screen.getByRole('button', {
    name: (name) => name.includes(copy.item('Card labels', 'write an answer')),
  });
/** A wait that does not end until the test says so, and counts what it was asked to wait. */
function heldWait(app: AppState) {
  const asked: number[] = [];
  let release = () => {};
  app.wait = (ms) => {
    asked.push(ms);
    return new Promise<void>((resolve) => (release = resolve));
  };
  return { asked, release: () => release() };
}

describe('the travelling card in the page (ADR 0027)', () => {
  it('where a browser cannot animate, as in the test DOM, nothing travels: open, close and save go as before and nothing throws', async () => {
    const app = await onACard({ wide: true });
    const user = userEvent.setup();
    renderApp(app);
    await user.click(frontCard());
    const dialog = await screen.findByRole('dialog', { name: app.card!.text });
    expect(layer()).toBeNull();
    await user.type(within(dialog).getByRole('textbox'), 'Words');
    await user.click(within(dialog).getByRole('button', { name: copy.item('Buttons', 'save') }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(layer()).toBeNull();
  });

  it('a card opened from the card in front grows from it to the open card: the box is in the page only while it travels, hidden from a screen reader, never inside the dialog, and the field has the focus meanwhile', async () => {
    const { lastWay } = withMotion();
    const app = await onACard({ wide: true });
    const user = userEvent.setup();
    renderApp(app);
    await user.click(frontCard());
    const dialog = await screen.findByRole('dialog', { name: app.card!.text });
    await waitFor(() => expect(layer()).not.toBeNull());
    const box = layer()!;
    expect(box.getAttribute('aria-hidden')).toBe('true');
    expect(box.tabIndex).toBe(-1);
    expect(box.childElementCount).toBe(0);
    expect(dialog.contains(box)).toBe(false);
    expect(box.closest('main, [inert]')).toBeNull();
    // At the scrim's height in the stylesheet, after it in the page: over it.
    const scrim = document.querySelector('.scrim')!;
    expect(scrim.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // On the card's tint, the tint the open card has.
    expect(box.style.getPropertyValue('--tint')).toBe('var(--tint-sun)');
    const { from, to, way } = lastWay();
    expect(from).toEqual(px(FRONT));
    expect(to).toEqual(px(OPEN));
    // In the length of the fade, with the fade's easing.
    expect(way.options.duration).toBe(CLOSE_MS);
    // The field took the focus as it does without the box, and keeps it while the box travels.
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole('textbox')));
    way.finish();
    await waitFor(() => expect(layer()).toBeNull());
    expect(document.activeElement).toBe(within(dialog).getByRole('textbox'));
  });

  it('a card closed goes back to the card in front, in the one wait of the fade: nothing waits for the box', async () => {
    const { lastWay } = withMotion();
    const app = await onACard({ wide: true });
    const user = userEvent.setup();
    renderApp(app);
    await user.click(frontCard());
    await screen.findByRole('dialog', { name: app.card!.text });
    const { asked, release } = heldWait(app);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(app.closing).toBe(true));
    await waitFor(() => expect(lastWay().to).toEqual(px(FRONT)));
    expect(lastWay().from).toEqual(px(OPEN));
    // The card in front stays lifted until the open card has gone: one card, one place.
    expect(frontCard().classList.contains('lifted')).toBe(true);
    expect(asked).toEqual([CLOSE_MS]);
    // The box has not finished its way, and the card goes anyway when the fade's wait ends.
    release();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(app.writing).toBeNull();
    expect(asked).toEqual([CLOSE_MS]);
  });

  it('a card saved from 600 pixels goes to its tile, which is lifted until the open card has gone; the save waits once, for the fade', async () => {
    const { lastWay } = withMotion();
    const app = await onACard({ wide: true });
    const user = userEvent.setup();
    renderApp(app);
    const answered = app.card!.id;
    await user.click(frontCard());
    const dialog = await screen.findByRole('dialog', { name: app.card!.text });
    await user.type(within(dialog).getByRole('textbox'), 'Neighbours');
    const { asked, release } = heldWait(app);
    await user.click(within(dialog).getByRole('button', { name: copy.item('Buttons', 'save') }));
    await waitFor(() => expect(app.closing).toBe(true));
    const tile = document.querySelector<HTMLElement>(`[data-tile="${answered}"]`)!;
    expect(tile.classList.contains('lifted')).toBe(true);
    await waitFor(() => expect(lastWay().to).toEqual(px(TILE)));
    expect(lastWay().from).toEqual(px(OPEN));
    expect(asked).toEqual([CLOSE_MS]);
    release();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(tile.classList.contains('lifted')).toBe(false);
  });

  it('a new blank card opens and closes with no travel; saved, it goes to its new tile, white with its line, and that tile is lifted until the open card has gone', async () => {
    const { animations, lastWay } = withMotion();
    const app = await onACard({ wide: true });
    const user = userEvent.setup();
    renderApp(app);
    const opener = screen.getByRole('button', { name: copy.text('Own card: button') });
    await user.click(opener);
    let dialog = await screen.findByRole('dialog', { name: copy.text('Own card: title') });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(animations).toHaveLength(0);
    expect(layer()).toBeNull();
    await user.click(opener);
    dialog = await screen.findByRole('dialog', { name: copy.text('Own card: title') });
    await user.type(within(dialog).getByRole('textbox'), 'My story');
    const { release } = heldWait(app);
    await user.click(within(dialog).getByRole('button', { name: copy.item('Buttons', 'save') }));
    await waitFor(() => expect(app.closing).toBe(true));
    const tile = document.querySelector<HTMLElement>('[data-tile^="own-"]')!;
    expect(tile.dataset['tile']).toBe(app.savedAs);
    expect(tile.classList.contains('lifted')).toBe(true);
    await waitFor(() => expect(lastWay().to).toEqual(px(TILE)));
    expect(layer()!.classList.contains('own')).toBe(true);
    expect(layer()!.style.getPropertyValue('--tint')).toBe('');
    release();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(tile.classList.contains('lifted')).toBe(false);
    expect(app.savedAs).toBeNull();
  });

  it('on a phone a tile is measured at the press, before its sheet closes: its card grows from there, and closes to the pill', async () => {
    const { lastWay } = withMotion();
    const app = await onACard({ wide: false });
    await answerFront(app, 'First words');
    const user = userEvent.setup();
    renderApp(app);
    await user.click(screen.getByRole('button', { name: /Your world so far/ }));
    const sheet = await screen.findByRole('dialog');
    await user.click(within(sheet).getByRole('button', { name: (n) => n.includes('First words') }));
    // The sheet has gone in the same press; the tile with it.
    await screen.findByRole('dialog', { name: (n) => n !== copy.item('Your world', 'title') });
    expect(document.querySelector('[data-tile]')).toBeNull();
    await waitFor(() => expect(lastWay().from).toEqual(px(TILE)));
    expect(lastWay().to).toEqual(px(OPEN));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(lastWay().to).toEqual(px(PILL)));
    expect(lastWay().from).toEqual(px(OPEN));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('on a phone a card saved goes to the pill', async () => {
    const { lastWay } = withMotion();
    const app = await onACard({ wide: false });
    const user = userEvent.setup();
    renderApp(app);
    await user.click(frontCard());
    const dialog = await screen.findByRole('dialog', { name: app.card!.text });
    await user.type(within(dialog).getByRole('textbox'), 'Neighbours');
    await user.click(within(dialog).getByRole('button', { name: copy.item('Buttons', 'save') }));
    await waitFor(() => expect(lastWay().to).toEqual(px(PILL)));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('with reduced motion asked for, nothing travels, and the card still opens, closes and is saved', async () => {
    const { animations } = withMotion();
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const app = await onACard({ wide: false });
    const user = userEvent.setup();
    renderApp(app);
    await user.click(frontCard());
    const dialog = await screen.findByRole('dialog', { name: app.card!.text });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(frontCard());
    await user.type(
      within(await screen.findByRole('dialog', { name: app.card!.text })).getByRole('textbox'),
      'Words',
    );
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: copy.item('Buttons', 'save'),
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(dialog.isConnected).toBe(false);
    expect(animations).toHaveLength(0);
    expect(layer()).toBeNull();
  });
});

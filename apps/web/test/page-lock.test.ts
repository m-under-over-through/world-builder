import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { tick } from 'svelte';
import type { Session } from '@wb/contracts';
import App from '../src/App.svelte';
import { hasMore, lockPage, stopsMove } from '../src/lib/page-lock.ts';
import { currentCardId, replaySession } from '../src/lib/session.ts';
import { AppState } from '../src/lib/state.svelte.ts';
import { WorkshopStore } from '../src/lib/store.ts';
import { findWorkshop } from '../src/lib/workshops.ts';
import { freshIndexedDb, stubRoutes } from './helpers.ts';

/**
 * The page held still while a card is open on a phone (ADR 0025; lib/page-lock.ts). No test DOM
 * has a finger or a layout, so a touch here is a plain event with the touches a browser would
 * give it, and the elements that scroll are given their scroll numbers by hand. What only a
 * phone can show, whether Safari really keeps the page still, is in docs/device-tests.md.
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

beforeEach(freshIndexedDb);
afterEach(() => vi.unstubAllGlobals());

type Point = { x: number; y: number };

/** A touch event as a browser sends it: one entry in `touches` per finger on the screen. */
function touch(type: string, fingers: Point[], cancelable = true): Event {
  const event = new Event(type, { bubbles: true, cancelable });
  const touches = fingers.map((p) => ({ clientX: p.x, clientY: p.y }));
  Object.defineProperty(event, 'touches', { value: touches });
  return event;
}

/**
 * A finger put down on `target` at `from` and moved to `to`. Says whether the move was cancelled:
 * whether the guard called `preventDefault`, which is what keeps Safari from moving anything.
 */
function drag(
  target: Element,
  from: Point,
  to: Point,
  { fingers = 1, cancelable = true }: { fingers?: number; cancelable?: boolean } = {},
): boolean {
  const second = (p: Point) => ({ x: p.x + 60, y: p.y });
  const at = (p: Point) => (fingers === 1 ? [p] : [p, second(p)]);
  target.dispatchEvent(touch('touchstart', at(from)));
  const move = touch('touchmove', at(to), cancelable);
  const prevent = vi.spyOn(move, 'preventDefault');
  target.dispatchEvent(move);
  return prevent.mock.calls.length > 0;
}

const UP = { from: { x: 100, y: 300 }, to: { x: 104, y: 220 } };
const DOWN = { from: { x: 100, y: 220 }, to: { x: 96, y: 300 } };

/** Give an element the scroll numbers a browser would compute for it. */
function scrolled(el: Element, scrollTop: number, scrollHeight: number, clientHeight: number) {
  Object.defineProperty(el, 'scrollTop', { configurable: true, value: scrollTop });
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: scrollHeight });
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: clientHeight });
}

/** An open card as the guard sees it: a head, the part that scrolls with the field, the row with Save. */
function anOpenCard() {
  const page = document.createElement('div');
  page.className = 'app';
  page.innerHTML = `
    <p class="behind">The page behind</p>
    <div class="card open" style="overflow: hidden">
      <div class="head"><button class="close">×</button></div>
      <div class="scrolls" style="overflow-y: auto">
        <label>The question</label>
        <textarea></textarea>
      </div>
      <div class="actions"><button class="save">Save</button></div>
    </div>`;
  document.body.append(page);
  const get = (selector: string) => page.querySelector(selector)!;
  const parts = {
    page,
    behind: get('.behind'),
    close: get('.close'),
    question: get('label'),
    scrolls: get('.scrolls'),
    field: get('textarea'),
    save: get('.save'),
  };
  // Everything in sight unless a test says otherwise.
  scrolled(parts.scrolls, 0, 200, 200);
  scrolled(parts.field, 0, 100, 100);
  return parts;
}

let unlock: (() => void) | undefined;
afterEach(() => {
  unlock?.();
  unlock = undefined;
  document.body.innerHTML = '';
});

describe('the guard', () => {
  it("a finger dragged on the open card's head, its buttons or the page behind moves nothing", () => {
    const card = anOpenCard();
    unlock = lockPage(card.page);
    for (const target of [card.close, card.save, card.behind, card.page, document.body])
      for (const { from, to } of [UP, DOWN]) expect(drag(target, from, to)).toBe(true);
  });

  it('a finger dragged on a field whose text is all in sight moves nothing', () => {
    const card = anOpenCard();
    unlock = lockPage(card.page);
    expect(drag(card.field, UP.from, UP.to)).toBe(true);
    expect(drag(card.field, DOWN.from, DOWN.to)).toBe(true);
    expect(drag(card.question, UP.from, UP.to)).toBe(true);
  });

  it('a finger dragged up on a field with more text below scrolls the field; at the end of the text it moves nothing', () => {
    const card = anOpenCard();
    unlock = lockPage(card.page);
    scrolled(card.field, 0, 400, 100);
    expect(drag(card.field, UP.from, UP.to)).toBe(false);
    // At the top of its text, a finger moving down has nothing to show in the field.
    expect(drag(card.field, DOWN.from, DOWN.to)).toBe(true);
    // At the end of its text, half a pixel short as a browser rounds it.
    scrolled(card.field, 299.5, 400, 100);
    expect(drag(card.field, UP.from, UP.to)).toBe(true);
    expect(drag(card.field, DOWN.from, DOWN.to)).toBe(false);
  });

  it('a finger dragged down on a field at the top of its text hands the drag to the part around it when that has more to show above', () => {
    const card = anOpenCard();
    unlock = lockPage(card.page);
    scrolled(card.field, 0, 400, 100);
    scrolled(card.scrolls, 60, 300, 200);
    expect(drag(card.field, DOWN.from, DOWN.to)).toBe(false);
    // The part around the field at its top as well: nothing has more to show above.
    scrolled(card.scrolls, 0, 300, 200);
    expect(drag(card.field, DOWN.from, DOWN.to)).toBe(true);
    // The question is in that part: a finger on it moves the part, not the page.
    expect(drag(card.question, UP.from, UP.to)).toBe(false);
  });

  it('a drag more sideways than up or down moves nothing', () => {
    const card = anOpenCard();
    unlock = lockPage(card.page);
    scrolled(card.field, 100, 400, 100);
    expect(drag(card.field, { x: 100, y: 200 }, { x: 160, y: 230 })).toBe(true);
    expect(drag(card.field, { x: 100, y: 200 }, { x: 40, y: 170 })).toBe(true);
    // The same field, the same distance up and down: it scrolls.
    expect(drag(card.field, { x: 100, y: 200 }, { x: 130, y: 260 })).toBe(false);
  });

  it('two fingers are left alone', () => {
    const card = anOpenCard();
    unlock = lockPage(card.page);
    for (const target of [card.close, card.behind, card.field])
      expect(drag(target, UP.from, UP.to, { fingers: 2 })).toBe(false);
  });

  it('a touch that cannot be cancelled is left alone', () => {
    const card = anOpenCard();
    unlock = lockPage(card.page);
    expect(drag(card.close, UP.from, UP.to, { cancelable: false })).toBe(false);
  });

  it('a page pinched in keeps one finger for moving around it', () => {
    const card = anOpenCard();
    let scale = 2;
    unlock = lockPage(card.page, { scale: () => scale });
    expect(drag(card.behind, UP.from, UP.to)).toBe(false);
    scale = 1;
    expect(drag(card.behind, UP.from, UP.to)).toBe(true);
  });

  it('once let go, the page moves again', () => {
    const card = anOpenCard();
    lockPage(card.page)();
    expect(drag(card.behind, UP.from, UP.to)).toBe(false);
  });

  it('the arithmetic: more to show by the direction of the finger, a pixel of rounding allowed', () => {
    const at = (scrollTop: number) => ({ scrollTop, scrollHeight: 500, clientHeight: 200 });
    // A finger moving down shows what is above.
    expect(hasMore(at(0), 10)).toBe(false);
    expect(hasMore(at(1), 10)).toBe(true);
    // A finger moving up shows what is below.
    expect(hasMore(at(298), -10)).toBe(true);
    expect(hasMore(at(299), -10)).toBe(false);
    expect(hasMore(at(300), -10)).toBe(false);
    // No movement shows nothing.
    expect(hasMore(at(100), 0)).toBe(false);
    // The first element that can go that way lets the move through.
    expect(stopsMove(0, -10, [at(300), at(100)])).toBe(false);
    expect(stopsMove(0, -10, [at(300), at(300)])).toBe(true);
    expect(stopsMove(0, -10, [])).toBe(true);
    expect(stopsMove(11, 10, [at(100)])).toBe(true);
    expect(stopsMove(0, 0, [])).toBe(false);
  });
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

/** A finger dragged up on the header, the stack's place and the page: is any of it held? */
function held(): boolean[] {
  const targets = [document.querySelector('header')!, document.querySelector('main')!];
  return targets.map((t) => drag(t, UP.from, UP.to));
}

describe('the app holds the page', () => {
  it('the page is held while a card is open on a phone and let go when it closes', async () => {
    // No visual viewport in a test DOM: the guard does not depend on one.
    const app = await onACard();
    renderApp(app);
    expect(held()).toEqual([false, false]);
    app.openCard();
    await tick();
    expect(held()).toEqual([true, true]);
    app.closeCard();
    await tick();
    expect(held()).toEqual([false, false]);
  });

  it('the page is held while the place to write is open on a phone and let go when it closes', async () => {
    const app = await onACard();
    const user = userEvent.setup();
    renderApp(app);
    await user.click(screen.getByRole('button', { name: copy.text('Own card: button') }));
    await screen.findByRole('dialog');
    expect(held()).toEqual([true, true]);
    expect(drag(document.querySelector('.scrim')!, UP.from, UP.to)).toBe(true);
    await user.keyboard('{Escape}');
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(held()).toEqual([false, false]);
  });

  it('on a laptop the page is never held', async () => {
    const app = await onACard({ wide: true });
    renderApp(app);
    app.openCard();
    await tick();
    expect(held()).toEqual([false, false]);
    app.closeCard();
    app.openOwnCard();
    await screen.findByRole('dialog');
    expect(held()).toEqual([false, false]);
  });
});

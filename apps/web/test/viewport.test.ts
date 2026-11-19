import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { tick } from 'svelte';
import type { Session } from '@wb/contracts';
import App from '../src/App.svelte';
import { currentCardId, replaySession } from '../src/lib/session.ts';
import { AppState } from '../src/lib/state.svelte.ts';
import { WorkshopStore } from '../src/lib/store.ts';
import {
  expectedHeight,
  followViewport,
  forgetKeyboards,
  frameOf,
  KEYBOARD_GUESS,
  KEYBOARD_MIN,
  KEYBOARD_WAIT_MS,
  keyboardUp,
  LOW_FRAME,
  VV_HEIGHT,
  VV_TOP,
} from '../src/lib/viewport.ts';
import { findWorkshop } from '../src/lib/workshops.ts';
import { freshIndexedDb, stubRoutes } from './helpers.ts';

/**
 * The open card above the keyboard (ADR 0023). No test DOM has a keyboard or a visual viewport,
 * so a stand-in plays the browser's `window.visualViewport`: it has a height and a top, and it
 * fires `resize` and `scroll` when a test changes them. What the stand-in cannot show, how an
 * iPhone and an Android phone really move, is in docs/device-tests.md.
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

/** A visual viewport a test can move: the page's 768 pixels until the keyboard comes up. */
class StandIn extends EventTarget {
  height = 768;
  offsetTop = 0;
  resize(height: number): void {
    this.height = height;
    this.dispatchEvent(new Event('resize'));
  }
  scroll(top: number): void {
    this.offsetTop = top;
    this.dispatchEvent(new Event('scroll'));
  }
}

beforeEach(freshIndexedDb);
beforeEach(forgetKeyboards);
afterEach(() => vi.unstubAllGlobals());

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

const root = () => document.querySelector<HTMLElement>('.app')!;
const property = (name: string) => root().style.getPropertyValue(name);
const inert = (el: Element | null) => (el as (HTMLElement & { inert?: boolean }) | null)?.inert;

describe('the visual viewport, read', () => {
  it("the visual viewport's height and top reach the app's root as custom properties, and follow its resize and scroll events", () => {
    const viewport = new StandIn();
    const el = document.createElement('div');
    const frames: boolean[] = [];
    const stop = followViewport(el, {
      viewport,
      layoutHeight: () => 844,
      onChange: (frame) => frames.push(frame.keyboard),
    })!;
    viewport.resize(844);
    expect(el.style.getPropertyValue(VV_HEIGHT)).toBe('844px');
    expect(el.style.getPropertyValue(VV_TOP)).toBe('0px');
    // An iPhone's keyboard rises: the visible part is 410 tall, and Safari scrolls the page 300.
    viewport.resize(410);
    viewport.scroll(300);
    expect(el.style.getPropertyValue(VV_HEIGHT)).toBe('410px');
    expect(el.style.getPropertyValue(VV_TOP)).toBe('300px');
    expect(frames.at(-1)).toBe(true);
    stop();
    expect(el.style.getPropertyValue(VV_HEIGHT)).toBe('');
    expect(el.style.getPropertyValue(VV_TOP)).toBe('');
    // Stopped is stopped: a later event sets nothing.
    viewport.resize(500);
    expect(el.style.getPropertyValue(VV_HEIGHT)).toBe('');
  });

  it('the keyboard counts as up when the visual viewport is clearly lower than the page, and not for a few pixels of browser bar', () => {
    // An iPhone 15 in Safari: 844 of page, 410 above the keyboard.
    expect(keyboardUp(844, 410)).toBe(true);
    // Safari's bars growing or shrinking: tens of pixels, never a keyboard.
    expect(keyboardUp(844, 790)).toBe(false);
    expect(keyboardUp(760, 844)).toBe(false);
    expect(keyboardUp(844, 844 - KEYBOARD_MIN + 1)).toBe(false);
    expect(keyboardUp(844, 844 - KEYBOARD_MIN)).toBe(true);
    // Android Chrome with resizes-content: the page shrinks with the visible part, so the
    // comparison says no keyboard, and no strip is kept for a bar that is not there.
    expect(frameOf({ height: 400, offsetTop: 0 } as never, 400).keyboard).toBe(false);
  });

  it('on a touch screen the frame starts at the height the keyboard is expected to leave, takes the real one once the keyboard has settled, and starts from that the next time', () => {
    // An iPhone says what is left only when its keyboard has stopped moving. Until then the
    // card would be as tall as the whole page, its foot under the keyboard, and then jump.
    const viewport = new StandIn();
    const el = document.createElement('div');
    const frames: { height: number; keyboard: boolean }[] = [];
    const options = {
      viewport,
      layoutHeight: () => 768,
      layoutWidth: () => 393,
      expectKeyboard: true,
      onChange: (frame: { height: number; keyboard: boolean }) => frames.push(frame),
    };
    const stop = followViewport(el, options)!;
    const guess = Math.round(768 * KEYBOARD_GUESS);
    expect(el.style.getPropertyValue(VV_HEIGHT)).toBe(`${guess}px`);
    // The strip under Save is kept from the start, so nothing moves when the keyboard lands.
    expect(frames.at(-1)).toEqual({ height: guess, top: 0, keyboard: true });
    // Safari's bars moving while the keyboard rises change nothing yet.
    viewport.resize(740);
    expect(el.style.getPropertyValue(VV_HEIGHT)).toBe(`${guess}px`);
    viewport.resize(410);
    expect(el.style.getPropertyValue(VV_HEIGHT)).toBe('410px');
    expect(frames.at(-1)?.keyboard).toBe(true);
    stop();
    // The next card opens at the height this keyboard left, on a page this wide.
    expect(expectedHeight(393, 768)).toBe(410);
    expect(expectedHeight(852, 393)).toBe(Math.round(393 * KEYBOARD_GUESS));
    viewport.resize(768);
    const again = followViewport(el, options)!;
    expect(el.style.getPropertyValue(VV_HEIGHT)).toBe('410px');
    again();
  });

  it('if no keyboard comes, the card takes the whole visible part after a moment', () => {
    vi.useFakeTimers();
    try {
      const viewport = new StandIn();
      const el = document.createElement('div');
      const frames: boolean[] = [];
      const stop = followViewport(el, {
        viewport,
        layoutHeight: () => 768,
        layoutWidth: () => 393,
        expectKeyboard: true,
        onChange: (frame) => frames.push(frame.keyboard),
      })!;
      expect(el.style.getPropertyValue(VV_HEIGHT)).toBe(`${Math.round(768 * KEYBOARD_GUESS)}px`);
      vi.advanceTimersByTime(KEYBOARD_WAIT_MS);
      expect(el.style.getPropertyValue(VV_HEIGHT)).toBe('768px');
      expect(frames.at(-1)).toBe(false);
      stop();
      // Stopped before the wait is over: the timer is gone with it, and nothing is set later.
      const early = followViewport(el, {
        viewport,
        layoutHeight: () => 768,
        expectKeyboard: true,
      })!;
      early();
      vi.advanceTimersByTime(KEYBOARD_WAIT_MS * 2);
      expect(el.style.getPropertyValue(VV_HEIGHT)).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('without a touch screen nothing is expected: the frame is the visible part from the start', () => {
    const viewport = new StandIn();
    const el = document.createElement('div');
    const stop = followViewport(el, { viewport, layoutHeight: () => 768 })!;
    expect(el.style.getPropertyValue(VV_HEIGHT)).toBe('768px');
    stop();
  });

  it('without a visual viewport nothing is set and there is nothing to stop', () => {
    const el = document.createElement('div');
    expect(followViewport(el, { viewport: null })).toBeNull();
    expect(el.getAttribute('style')).toBeNull();
  });

  it('a page pinched in is not a keyboard: no strip is kept for it', () => {
    expect(frameOf({ height: 410, offsetTop: 0, scale: 2 } as never, 844).keyboard).toBe(false);
    expect(frameOf({ height: 410, offsetTop: 0, scale: 1 } as never, 844).keyboard).toBe(true);
    expect(frameOf({ height: 410, offsetTop: 0 } as never, 844).keyboard).toBe(true);
  });
});

describe('the open card on a phone', () => {
  it('opening a card on a phone starts following the visual viewport, and closing it stops and clears the properties', async () => {
    const viewport = new StandIn();
    vi.stubGlobal('visualViewport', viewport);
    const app = await onACard();
    renderApp(app);
    expect(property(VV_HEIGHT)).toBe('');
    expect(root().classList.contains('framed')).toBe(false);
    app.openCard();
    await tick();
    expect(property(VV_HEIGHT)).toBe('768px');
    expect(property(VV_TOP)).toBe('0px');
    expect(root().classList.contains('framed')).toBe(true);
    expect(root().classList.contains('keyboard-up')).toBe(false);
    // The card in front opens in the same framed box as every other card (ADR 0027).
    const dialog = screen.getByRole('dialog', { name: app.card!.text });
    expect(dialog.classList.contains('open-card')).toBe(true);
    expect(dialog.classList.contains('sheet')).toBe(true);
    expect(document.querySelector('.stack textarea')).toBeNull();
    // The frame covers the header and the foot, so neither takes a tap or a Tab meanwhile.
    expect(inert(document.querySelector('header'))).toBe(true);
    expect(inert(document.querySelector('footer'))).toBe(true);
    viewport.resize(410);
    viewport.scroll(250);
    await tick();
    expect(property(VV_HEIGHT)).toBe('410px');
    expect(property(VV_TOP)).toBe('250px');
    expect(root().classList.contains('keyboard-up')).toBe(true);
    await app.closeCard();
    await tick();
    expect(property(VV_HEIGHT)).toBe('');
    expect(property(VV_TOP)).toBe('');
    expect(root().classList.contains('framed')).toBe(false);
    expect(root().classList.contains('keyboard-up')).toBe(false);
    expect(inert(document.querySelector('header'))).toBe(false);
  });

  it('opening the blank card on a phone starts following the visual viewport, and closing it stops and clears the properties', async () => {
    const viewport = new StandIn();
    vi.stubGlobal('visualViewport', viewport);
    const app = await onACard();
    const user = userEvent.setup();
    renderApp(app);
    await user.click(screen.getByRole('button', { name: copy.text('Own card: button') }));
    await screen.findByRole('dialog', { name: copy.text('Own card: title') });
    expect(property(VV_HEIGHT)).toBe('768px');
    expect(root().classList.contains('framed')).toBe(true);
    viewport.resize(400);
    await tick();
    expect(root().classList.contains('keyboard-up')).toBe(true);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(property(VV_HEIGHT)).toBe('');
    expect(root().classList.contains('framed')).toBe(false);
    expect(root().classList.contains('keyboard-up')).toBe(false);
  });

  it('a frame too low for a head and a foot that stay is marked, and unmarked when it is tall again or the card closes', async () => {
    // A phone on its side with the keyboard up: the whole card scrolls there (ADR 0025).
    const viewport = new StandIn();
    vi.stubGlobal('visualViewport', viewport);
    const app = await onACard();
    renderApp(app);
    app.openCard();
    await tick();
    expect(root().classList.contains('low')).toBe(false);
    viewport.resize(LOW_FRAME - 1);
    await tick();
    expect(root().classList.contains('low')).toBe(true);
    viewport.resize(LOW_FRAME);
    await tick();
    expect(root().classList.contains('low')).toBe(false);
    viewport.resize(200);
    await tick();
    expect(root().classList.contains('low')).toBe(true);
    await app.closeCard();
    await tick();
    expect(root().classList.contains('low')).toBe(false);
  });

  it('the first guess on a small phone is not a low frame: a card does not open one way and settle the other', () => {
    // A page 553 pixels tall (a phone of 667 with Safari's bars) leaves about 290 above its
    // keyboard. The guess before the keyboard has settled must be on the same side of the line.
    expect(expectedHeight(375, 553)).toBeGreaterThanOrEqual(LOW_FRAME);
    expect(290).toBeGreaterThanOrEqual(LOW_FRAME);
    // A phone on its side with the keyboard up leaves under 200.
    expect(200).toBeLessThan(LOW_FRAME);
  });

  it('without visualViewport the open card is laid out as before', async () => {
    vi.stubGlobal('visualViewport', undefined);
    const app = await onACard();
    renderApp(app);
    app.openCard();
    await tick();
    expect(screen.getByRole('textbox')).toBeTruthy();
    expect(root().classList.contains('framed')).toBe(false);
    expect(property(VV_HEIGHT)).toBe('');
    // The open card is a dialog all the same: the page behind it is not reachable (ADR 0027).
    expect(screen.getByRole('dialog', { name: app.card!.text })).toBeTruthy();
    expect(inert(document.querySelector('header'))).toBe(true);
  });

  it('on a laptop nothing of this applies, with a visual viewport or without', async () => {
    vi.stubGlobal('visualViewport', new StandIn());
    const app = await onACard({ wide: true });
    renderApp(app);
    app.openCard();
    await tick();
    expect(root().classList.contains('framed')).toBe(false);
    expect(property(VV_HEIGHT)).toBe('');
    await app.closeCard();
    app.openOwnCard();
    await screen.findByRole('dialog');
    expect(root().classList.contains('framed')).toBe(false);
  });

  /** What was on the root at the moment a field took the focus. */
  function rootWhenFocused(): { framed: boolean; height: string; top: string }[] {
    const seen: { framed: boolean; height: string; top: string }[] = [];
    const record = (event: FocusEvent) => {
      if (!(event.target instanceof HTMLTextAreaElement)) return;
      seen.push({
        framed: root().classList.contains('framed'),
        height: property(VV_HEIGHT),
        top: property(VV_TOP),
      });
    };
    document.addEventListener('focusin', record);
    onTestFinished(() => document.removeEventListener('focusin', record));
    return seen;
  }

  it("when the open card's field takes the focus on a phone, the root already carries the frame's class and both properties", async () => {
    // A field that takes the focus before its box is in place sits at the bottom of the screen,
    // and Safari scrolls the page to show it (ADR 0025).
    vi.stubGlobal('visualViewport', new StandIn());
    const app = await onACard();
    renderApp(app);
    const seen = rootWhenFocused();
    app.openCard();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox')));
    expect(seen).toEqual([{ framed: true, height: '768px', top: '0px' }]);
  });

  it("when the field of a blank card takes the focus on a phone, the root already carries the frame's class and both properties", async () => {
    vi.stubGlobal('visualViewport', new StandIn());
    const app = await onACard();
    renderApp(app);
    const seen = rootWhenFocused();
    app.openOwnCard();
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    expect(seen).toEqual([{ framed: true, height: '768px', top: '0px' }]);
  });
});

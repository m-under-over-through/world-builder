import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { tick } from 'svelte';
import type { Session } from '@wb/contracts';
import App from '../src/App.svelte';
import { currentCardId, replaySession } from '../src/lib/session.ts';
import { AppState } from '../src/lib/state.svelte.ts';
import { WorkshopStore } from '../src/lib/store.ts';
import {
  FIELD_TEXT,
  followViewport,
  frameOf,
  growField,
  KEYBOARD_MIN,
  keyboardUp,
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

  it('without a visual viewport nothing is set and there is nothing to stop', () => {
    const el = document.createElement('div');
    expect(followViewport(el, { viewport: null })).toBeNull();
    expect(el.getAttribute('style')).toBeNull();
  });

  it('a field measures the height of its text and hands it on, and is left as it was', () => {
    const field = document.createElement('textarea');
    Object.defineProperty(field, 'scrollHeight', { get: () => 130 });
    field.style.height = '';
    growField(field);
    expect(field.style.getPropertyValue(FIELD_TEXT)).toBe('130px');
    expect(field.style.height).toBe('');
    expect(field.style.minHeight).toBe('');
    expect(field.style.flexGrow).toBe('');
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
    // The frame covers the header and the foot, so neither takes a tap or a Tab meanwhile.
    expect(inert(document.querySelector('header'))).toBe(true);
    expect(inert(document.querySelector('footer'))).toBe(true);
    viewport.resize(410);
    viewport.scroll(250);
    await tick();
    expect(property(VV_HEIGHT)).toBe('410px');
    expect(property(VV_TOP)).toBe('250px');
    expect(root().classList.contains('keyboard-up')).toBe(true);
    app.closeCard();
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

  it('without visualViewport the open card is laid out as before', async () => {
    vi.stubGlobal('visualViewport', undefined);
    const app = await onACard();
    renderApp(app);
    app.openCard();
    await tick();
    expect(screen.getByRole('textbox')).toBeTruthy();
    expect(root().classList.contains('framed')).toBe(false);
    expect(property(VV_HEIGHT)).toBe('');
    expect(inert(document.querySelector('header'))).toBe(false);
  });

  it('on a laptop nothing of this applies, with a visual viewport or without', async () => {
    vi.stubGlobal('visualViewport', new StandIn());
    const app = await onACard({ wide: true });
    renderApp(app);
    app.openCard();
    await tick();
    expect(root().classList.contains('framed')).toBe(false);
    expect(property(VV_HEIGHT)).toBe('');
    app.closeCard();
    app.openOwnCard();
    await screen.findByRole('dialog');
    expect(root().classList.contains('framed')).toBe(false);
  });

  it('the field is never lower than three lines, and grows with the text', async () => {
    // The stylesheet: three lines at least, or the text's own height when it is taller.
    const web = join(fileURLToPath(import.meta.url), '../..');
    const css = readFileSync(join(web, 'src/app.css'), 'utf8');
    const body = (selector: string) => {
      const at = css.indexOf(`\n${selector} {`);
      expect(at, selector).toBeGreaterThan(0);
      return css.slice(at, css.indexOf('}', at));
    };
    expect(body('.app.framed .card.open textarea')).toMatch(
      /min-height: max\(3lh, var\(--field-text, 0px\)\)/,
    );
    expect(body('.app.framed .card.open textarea')).toMatch(/flex: 1 0 auto/);
    // The blank card's field has 12 + 12 of padding and 1.5 + 1.5 of border inside its box.
    expect(body('.own-card textarea')).toMatch(/padding: 12px 14px/);
    expect(body('.own-card textarea')).toMatch(/border: 1.5px solid/);
    expect(body('.app.framed .own-card.sheet textarea')).toMatch(
      /min-height: max\(calc\(3lh \+ 27px\), var\(--field-text, 0px\)\)/,
    );
    // The app: as the text grows, the field hands its height on.
    vi.stubGlobal('visualViewport', new StandIn());
    const app = await onACard();
    renderApp(app);
    app.openCard();
    await tick();
    const field = screen.getByRole('textbox') as HTMLTextAreaElement;
    let lines = 1;
    Object.defineProperty(field, 'scrollHeight', { get: () => Math.round(lines * 26.1) });
    lines = 6;
    await userEvent.setup().type(field, 'Six lines of words');
    expect(field.style.getPropertyValue(FIELD_TEXT)).toBe('157px');
  });
});

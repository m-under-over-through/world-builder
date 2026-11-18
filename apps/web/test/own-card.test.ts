import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import {
  eventSchema,
  isOwnCardId,
  MAX_ANSWER_CHARS,
  OWN_CARD_PREFIX,
  type Event,
  type Session,
} from '@wb/contracts';
import App from '../src/App.svelte';
import { fill } from '../src/lib/copy.ts';
import { VALUE_ALPHABET } from '../src/lib/invitations.ts';
import { newOwnCardId, OWN_CARD_TAIL } from '../src/lib/own-card.ts';
import { currentCardId, replaySession } from '../src/lib/session.ts';
import { AppState } from '../src/lib/state.svelte.ts';
import { answerKey, WorkshopStore } from '../src/lib/store.ts';
import { codePoints } from '../src/lib/text.ts';
import { findWorkshop } from '../src/lib/workshops.ts';
import { freshIndexedDb, stubRoutes, SYNCED } from './helpers.ts';

/**
 * The blank card (ADR 0022): a card with no question, which the participant writes. Its id, the
 * place to write it, what saving it records and what it leaves alone, and its tile in "Your world
 * so far". Every test that renders the app or saves stubs the routes first, so no request leaves.
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
const db = (app: AppState) => app.store as WorkshopStore;

beforeEach(freshIndexedDb);
afterEach(() => vi.unstubAllGlobals());

/** A state on the first card of a first session, the onboarding card seen, with a code and a store. */
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

const opener = () => screen.getByRole('button', { name: copy.text('Own card: button') });
const field = () =>
  screen.getByRole('textbox', { name: copy.text('Own card: field') }) as HTMLTextAreaElement;
const save = () =>
  screen.getByRole('button', { name: copy.item('Own card: buttons', 'save') }) as HTMLButtonElement;

describe('the id', () => {
  it("a blank card's id is own- and eight characters of the alphabet, and is never an id of the deck", () => {
    const fixed = newOwnCardId((bytes) => bytes.map((_, i) => i));
    expect(fixed).toBe(OWN_CARD_PREFIX + VALUE_ALPHABET.slice(0, OWN_CARD_TAIL));
    const ids = new Set(Array.from({ length: 200 }, () => newOwnCardId()));
    expect(ids.size).toBe(200);
    const deck = new Set(workshop.deck.cards.map((c) => c.id));
    for (const id of ids) {
      expect(id).toMatch(new RegExp(`^own-[${VALUE_ALPHABET}]{8}$`));
      expect(isOwnCardId(id)).toBe(true);
      expect(deck.has(id)).toBe(false);
    }
    // The event contract takes it as a card id, so the server stores it as any other.
    const event: Event = {
      id: '10000000-0000-4000-8000-000000000001',
      sessionId: SESSION.id,
      cardId: [...ids][0]!,
      seq: 0,
      kind: 'answered',
      body: 'v1.' + 'Q'.repeat(80),
      createdDay: '2026-11-16',
      deckVersion: workshop.deck.version,
    };
    expect(eventSchema.safeParse(event).success).toBe(true);
    for (const card of workshop.deck.cards) expect(isOwnCardId(card.id)).toBe(false);
  });
});

describe('the place to write', () => {
  it('Write your own card opens a place to write with no question; Not now closes it, the front card is unchanged, and the words are there the next time', async () => {
    const app = await onACard();
    const user = userEvent.setup();
    renderApp(app);
    const front = app.card!;
    await user.click(opener());
    const dialog = await screen.findByRole('dialog', { name: copy.text('Own card: title') });
    expect(dialog.textContent).toContain(copy.text('Own card: hint'));
    expect(dialog.textContent).toContain(copy.text('Own card: names'));
    expect(dialog.textContent).not.toContain(front.text);
    expect(save().disabled).toBe(true);
    await user.type(field(), 'A story from before');
    expect(save().disabled).toBe(false);
    await user.click(
      within(dialog).getByRole('button', { name: copy.item('Own card: buttons', 'not now') }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(app.ownCardOpen).toBe(false);
    expect(app.card).toBe(front);
    expect(app.cardState).toBe('fresh');
    expect(await db(app).events.count()).toBe(0);
    expect(await db(app).settings.get('ownDraft')).toBeUndefined();
    await user.click(opener());
    await screen.findByRole('dialog');
    expect(field().value).toBe('A story from before');
  });

  it('an empty text, or spaces only, is not saved', async () => {
    const app = await onACard();
    renderApp(app);
    app.openOwnCard();
    await screen.findByRole('dialog');
    for (const text of ['', '   \n\t ']) {
      app.ownDraft = text;
      await waitFor(() => expect(save().disabled).toBe(true));
      expect(await app.saveOwnCard()).toBe(false);
    }
    expect(await db(app).events.count()).toBe(0);
    expect(await db(app).answers()).toEqual([]);
    expect(app.ownCardOpen).toBe(true);
  });

  it('the blank card is not offered on the welcome or while the onboarding card is in front', async () => {
    stubRoutes({});
    const welcome = new AppState();
    welcome.workshop = workshop;
    welcome.copy = copy;
    welcome.arrival = { wave: 'wave-1' };
    welcome.screen = 'welcome';
    const first = renderApp(welcome);
    expect(screen.queryByRole('button', { name: copy.text('Own card: button') })).toBeNull();
    expect(welcome.ownCardOffered).toBe(false);
    welcome.openOwnCard();
    expect(welcome.ownCardOpen).toBe(false);
    first.unmount();

    const demo = await onACard({ demoFront: true });
    renderApp(demo);
    expect(screen.queryByRole('button', { name: copy.text('Own card: button') })).toBeNull();
    demo.openOwnCard();
    expect(demo.ownCardOpen).toBe(false);
    expect(await demo.saveOwnCard('Too early')).toBe(false);
    await demo.dismissDemo();
    await waitFor(() => expect(opener()).toBeTruthy());
  });
});

describe('saving a blank card', () => {
  it('Save records one answered event with a sealed body and a card id that starts with own-; the text sent is not the text written; the readable copy stays on this device', async () => {
    const app = await onACard();
    const calls = stubRoutes({ [`/api/${SLUG}/sync`]: [SYNCED] });
    const user = userEvent.setup();
    renderApp(app);
    await user.click(opener());
    await screen.findByRole('dialog');
    await user.type(field(), 'Owning a story of my own');
    await user.click(save());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const events = await db(app).events.toArray();
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event!.kind).toBe('answered');
    expect(event!.sessionId).toBe(SESSION.id);
    expect(isOwnCardId(event!.cardId)).toBe(true);
    expect(event!.body!.startsWith('v1.')).toBe(true);
    expect(JSON.stringify(events)).not.toContain('Owning');
    // The sync runs in the background once the dialog has closed.
    await waitFor(() => expect(calls.some((c) => c.path.endsWith('/sync'))).toBe(true));
    const syncs = calls.filter((c) => c.path.endsWith('/sync'));
    expect(JSON.stringify(syncs[0]!.body)).toContain(event!.cardId);
    expect(JSON.stringify(calls)).not.toContain('Owning');
    expect((await db(app).answers()).map((a) => [a.key, a.text])).toEqual([
      [answerKey(SESSION.id, event!.cardId), 'Owning a story of my own'],
    ]);
    expect(app.ownDraft).toBe('');
    // The screen reader hears the same word as for a card.
    expect(app.announcement.text).toBe(copy.item('Announcements', 'saved'));
  });

  it('saving a blank card leaves the round as it was: the same front card, the same draft, the same queue', async () => {
    const app = await onACard({ draft: 'Half an answer' });
    stubRoutes({ [`/api/${SLUG}/sync`]: [SYNCED] });
    const front = app.card!;
    const queue = [...app.live!.plan.queue];
    const backs = app.backCards.map((b) => b.card.id);
    app.openOwnCard();
    expect(await app.saveOwnCard('My own words')).toBe(true);
    expect(app.card).toBe(front);
    expect(app.cardNo).toBe(1);
    expect(app.draft).toBe('Half an answer');
    expect(app.cardState).toBe('fresh');
    expect(app.live!.plan.queue).toEqual(queue);
    expect(app.backCards.map((b) => b.card.id)).toEqual(backs);
    expect(app.position).toEqual({ n: 1, total: queue.length });
    const kinds = (await db(app).events.toArray()).map((e) => e.kind);
    expect(kinds).toEqual(['answered']);
    // A reload replays the round from its events and lands on the same card.
    await app.enterSession();
    expect(app.card!.id).toBe(front.id);
    expect(app.sessionNo).toBe(1);
  });

  it("a second blank card gets another id, and both are tiles in Your world so far, after the round's cards, in the order written", async () => {
    const app = await onACard();
    stubRoutes({});
    app.draft = 'A card answered';
    expect(await app.save()).toBe(true);
    expect(await app.saveOwnCard('First of my own')).toBe(true);
    app.draft = 'Another card answered';
    expect(await app.save()).toBe(true);
    expect(await app.saveOwnCard('Second of my own')).toBe(true);
    const own = (await db(app).events.toArray()).filter((e) => isOwnCardId(e.cardId));
    expect(own).toHaveLength(2);
    expect(own[0]!.cardId).not.toBe(own[1]!.cardId);
    const tiles = app.world.tiles;
    expect(tiles.map((t) => t.own ?? false)).toEqual([false, false, true, true]);
    expect(tiles.map((t) => t.answer)).toEqual([
      'A card answered',
      'Another card answered',
      'First of my own',
      'Second of my own',
    ]);
    app.worldOpen = true;
    renderApp(app);
    const dialog = await screen.findByRole('dialog');
    const items = [...dialog.querySelectorAll('.world-section.answered .tile')];
    expect(items).toHaveLength(4);
    for (const item of items.slice(2)) {
      expect(item.classList.contains('own')).toBe(true);
      expect(item.querySelector('.label')!.textContent).toBe(copy.text('Own card: tile'));
      expect(item.querySelector('.q')).toBeNull();
      expect(item.getAttribute('style') ?? '').not.toContain('--tint');
    }
    expect(items[3]!.querySelector('.a')!.textContent).toBe('Second of my own');
  });

  it('a text longer than the limit is cut at 4,000 characters by code points, never through a pair', async () => {
    const app = await onACard();
    stubRoutes({});
    // Saved: a text past the limit is cut to the limit, not refused.
    expect(await app.saveOwnCard('a'.repeat(MAX_ANSWER_CHARS + 500))).toBe(true);
    const [copyOnDevice] = await db(app).answers();
    expect(copyOnDevice!.text).toBe('a'.repeat(MAX_ANSWER_CHARS));
    expect(app.error).toBe('');
    // Typed or pasted: the field refuses what passes the limit and keeps an emoji whole, so the
    // 4,000th character is the whole emoji and no half of the next one is left behind.
    renderApp(app);
    app.openOwnCard();
    await screen.findByRole('dialog');
    const el = field();
    el.value = 'a'.repeat(MAX_ANSWER_CHARS - 1) + '😀😀😀';
    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    expect(codePoints(app.ownDraft)).toBe(MAX_ANSWER_CHARS);
    expect(app.ownDraft.endsWith('a😀')).toBe(true);
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(app.ownDraft)).toBe(false);
    await waitFor(() =>
      expect(
        screen.getByText(fill(copy.item('Card labels', 'counter'), { n: '4,000', max: '4,000' })),
      ).toBeTruthy(),
    );
  });

  it('when sealing fails nothing is stored and the page says CLIENT_SEAL_FAILED', async () => {
    const app = await onACard();
    renderApp(app);
    app.openOwnCard();
    app.ownDraft = 'a lone surrogate \uD83D cannot be encoded';
    await screen.findByRole('dialog');
    await userEvent.setup().click(save());
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(copy.error('CLIENT_SEAL_FAILED'));
    expect(app.error).toBe('CLIENT_SEAL_FAILED');
    expect(await db(app).events.count()).toBe(0);
    expect(await db(app).answers()).toEqual([]);
    expect(app.ownCardOpen).toBe(true);
    expect(app.ownDraft).toBe('a lone surrogate \uD83D cannot be encoded');
  });

  it('with the deck done, the blank card is still offered, and saving it does not bring a card back', async () => {
    stubRoutes({});
    const warmup = workshop.deck.cards.find((c) => c.set === 'warmup')!;
    const checkpoint = workshop.deck.cards.find((c) => c.set === 'checkpoint')!;
    const app = new AppState();
    app.workshop = {
      ...workshop,
      deck: { ...workshop.deck, cards: [warmup, checkpoint] },
      config: { ...workshop.config, warmupsPerSession: 1, checkpointsPerSession: 1 },
    };
    app.copy = copy;
    app.store = new WorkshopStore(SLUG);
    await app.store.set('demoSeen', '2026-11-16');
    app.code = '1234567890123456';
    app.wait = async () => {};
    await app.enterSession();
    for (const words of ['Warm-up', 'Checkpoint']) {
      app.draft = words;
      await app.save();
    }
    expect(app.card).toBeUndefined();
    expect(app.live!.deckDone).toBe(true);
    renderApp(app);
    expect(screen.getByRole('note').textContent).toContain(copy.text('Thank you card'));
    await userEvent.setup().click(opener());
    await screen.findByRole('dialog');
    expect(await app.saveOwnCard('Still something to say')).toBe(true);
    expect(app.card).toBeUndefined();
    expect(app.sessionNo).toBe(2);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('note')).toBeTruthy();
    expect(opener()).toBeTruthy();
    // A reload does not start a round either: the blank card counts for no card of the deck.
    await app.enterSession();
    expect(app.card).toBeUndefined();
    expect(app.sessionNo).toBe(2);
    expect(app.world.tiles.at(-1)!.answer).toBe('Still something to say');
  });
});

describe('on another device', () => {
  it('on a device that did not write it, the tile shows without its words', async () => {
    const app = await onACard();
    const elsewhere: Event = {
      id: '10000000-0000-4000-8000-000000000009',
      sessionId: SESSION.id,
      cardId: newOwnCardId(),
      seq: 1,
      kind: 'answered',
      body: 'v1.' + 'Q'.repeat(80),
      createdDay: '2026-11-16',
      deckVersion: workshop.deck.version,
    };
    app.history = { sessions: [SESSION], events: [elsewhere] };
    app.live = replaySession(workshop.deck, workshop.config, SESSION, app.history);
    expect(app.world.tiles).toEqual([
      expect.objectContaining({ cardId: elsewhere.cardId, own: true, answer: null }),
    ]);
    app.worldOpen = true;
    renderApp(app);
    const dialog = await screen.findByRole('dialog');
    const tile = dialog.querySelector('.tile.own')!;
    expect(tile.querySelector('.label')!.textContent).toBe(copy.text('Own card: tile'));
    expect(tile.textContent).toContain(copy.item('Your world', 'written elsewhere'));
    expect(tile.textContent).not.toContain('QQQQ');
  });
});

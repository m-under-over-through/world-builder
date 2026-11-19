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
import { answerFront, freshIndexedDb, saveOwnCard, stubRoutes, SYNCED } from './helpers.ts';

/**
 * The blank card (ADR 0022): a card with no question, which the participant writes. Its id, the
 * open card it is written in (ADR 0027), what saving it records and what it leaves alone, and its
 * tile in "Your world so far". Every test that renders the app or saves stubs the routes first, so no request leaves.
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
  screen.getByRole('button', { name: copy.item('Buttons', 'save') }) as HTMLButtonElement;

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

describe('the open card of a blank card', () => {
  it('Write your own story opens the open card with no question and the × alone in its head; × closes it, the front card is unchanged, and the words are there the next time', async () => {
    const app = await onACard();
    const user = userEvent.setup();
    renderApp(app);
    const front = app.card!;
    await user.click(opener());
    const dialog = await screen.findByRole('dialog', { name: copy.text('Own card: title') });
    expect(dialog.textContent).toContain(copy.text('Own card: hint'));
    expect(dialog.textContent).not.toContain(front.text);
    const head = dialog.querySelector('.head')!;
    expect(head.querySelector('.label')).toBeNull();
    expect([...head.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))).toEqual([
      copy.item('Card labels', 'close without saving'),
    ]);
    // A blank card lifts nothing: the card in front stays drawn behind it.
    expect(document.querySelector('.card.front')!.classList.contains('lifted')).toBe(false);
    expect(save().disabled).toBe(true);
    await user.type(field(), 'A story from before');
    expect(save().disabled).toBe(false);
    await user.click(
      within(dialog).getByRole('button', {
        name: copy.item('Card labels', 'close without saving'),
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(app.cardOpen).toBe(false);
    expect(app.card).toBe(front);
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
      app.openDraft = text;
      await waitFor(() => expect(save().disabled).toBe(true));
      expect(await app.save()).toBe(false);
    }
    expect(await db(app).events.count()).toBe(0);
    expect(await db(app).answers()).toEqual([]);
    expect(app.cardOpen).toBe(true);
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
    expect(welcome.cardOpen).toBe(false);
    first.unmount();

    const demo = await onACard({ demoFront: true });
    renderApp(demo);
    expect(screen.queryByRole('button', { name: copy.text('Own card: button') })).toBeNull();
    demo.openOwnCard();
    expect(demo.cardOpen).toBe(false);
    expect(await saveOwnCard(demo, 'Too early')).toBe(false);
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
    expect(app.openDraft).toBe('');
    // The screen reader hears the same word as for a card.
    expect(app.announcement.text).toBe(copy.item('Announcements', 'saved'));
  });

  it('saving a blank card leaves the round as it was: the same front card, the same draft, the same queue', async () => {
    const app = await onACard({ draft: 'Half an answer' });
    stubRoutes({ [`/api/${SLUG}/sync`]: [SYNCED] });
    const front = app.card!;
    const queue = [...app.live!.plan.queue];
    const backs = app.backCards.map((b) => b.card.id);
    expect(await saveOwnCard(app, 'My own words')).toBe(true);
    expect(app.card).toBe(front);
    expect(app.cardNo).toBe(1);
    expect(app.draft).toBe('Half an answer');
    expect(app.cardOpen).toBe(false);
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
    expect(await answerFront(app, 'A card answered')).toBe(true);
    expect(await saveOwnCard(app, 'First of my own')).toBe(true);
    expect(await answerFront(app, 'Another card answered')).toBe(true);
    expect(await saveOwnCard(app, 'Second of my own')).toBe(true);
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
    // Saved: a text past the limit is cut to the limit, not refused, and an emoji at the cut is
    // kept whole. Sealing counts characters as the client does (pull request 63).
    const long = 'a'.repeat(MAX_ANSWER_CHARS - 1) + '😀😀😀';
    expect(await saveOwnCard(app, long)).toBe(true);
    expect(app.error).toBe('');
    const [copyOnDevice] = await db(app).answers();
    expect(copyOnDevice!.text).toBe('a'.repeat(MAX_ANSWER_CHARS - 1) + '😀');
    expect(codePoints(copyOnDevice!.text)).toBe(MAX_ANSWER_CHARS);
    expect((await db(app).events.toArray())[0]!.body!.startsWith('v1.')).toBe(true);
    // Typed or pasted: the field refuses what passes the limit and keeps an emoji whole, so the
    // 4,000th character is the whole emoji and no half of the next one is left behind.
    renderApp(app);
    app.openOwnCard();
    await screen.findByRole('dialog');
    const el = field();
    el.value = 'a'.repeat(MAX_ANSWER_CHARS - 1) + '😀😀😀';
    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    expect(codePoints(app.openDraft)).toBe(MAX_ANSWER_CHARS);
    expect(app.openDraft.endsWith('a😀')).toBe(true);
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(app.openDraft)).toBe(false);
    await waitFor(() =>
      expect(
        screen.getByText(fill(copy.item('Card labels', 'counter'), { n: '4,000', max: '4,000' })),
      ).toBeTruthy(),
    );
    // A full-length text that holds an emoji saves from the field as well.
    expect(await app.save()).toBe(true);
    expect(app.error).toBe('');
    expect((await db(app).answers()).map((a) => codePoints(a.text))).toEqual([
      MAX_ANSWER_CHARS,
      MAX_ANSWER_CHARS,
    ]);
  });

  it('the seq goes on across cards and blank cards: card, blank, card, blank are in order and no number comes twice; two saves started together store one event', async () => {
    const app = await onACard();
    stubRoutes({});
    expect(await answerFront(app, 'First card')).toBe(true);
    expect(await saveOwnCard(app, 'First blank')).toBe(true);
    expect(await answerFront(app, 'Second card')).toBe(true);
    expect(await saveOwnCard(app, 'Second blank')).toBe(true);
    const events = (await db(app).events.toArray()).sort((a, b) => a.seq - b.seq);
    const seqs = events.map((e) => e.seq);
    expect(new Set(seqs).size).toBe(seqs.length);
    expect(seqs).toEqual([...seqs.keys()].map((i) => seqs[0]! + i));
    const answered = events.filter((e) => e.kind === 'answered');
    expect(answered.map((e) => isOwnCardId(e.cardId))).toEqual([false, true, false, true]);
    expect(app.live!.nextSeq).toBe(seqs.at(-1)! + 1);
    // Two presses at once: the second finds the first saving and does nothing.
    app.openOwnCard();
    app.openDraft = 'Pressed twice';
    const [first, second] = await Promise.all([app.save(), app.save()]);
    expect([first, second]).toEqual([true, false]);
    const after = await db(app).events.toArray();
    expect(after).toHaveLength(events.length + 1);
    expect(new Set(after.map((e) => e.seq)).size).toBe(after.length);
    expect((await db(app).answers()).filter((a) => a.text === 'Pressed twice')).toHaveLength(1);
  });

  it('a blank card is not a touch of the round: the first card keeps its dictation hint, now and after a reload', async () => {
    const app = await onACard({ platform: 'Android' });
    stubRoutes({});
    await app.enterSession();
    // The hint does not open by itself on the blank card (ADR 0027)...
    app.openOwnCard();
    expect(app.hintOpen).toBe(false);
    app.openDraft = 'Before any card';
    expect(await app.save()).toBe(true);
    expect(app.live!.untouched).toBe(true);
    // ...and the first card, opened afterwards, still has it.
    app.openCard();
    expect(app.hintOpen).toBe(true);
    await app.closeCard();
    await app.enterSession();
    expect(app.live!.untouched).toBe(true);
    app.openCard();
    expect(app.hintOpen).toBe(true);
    expect(app.world.tiles.map((t) => t.answer)).toEqual(['Before any card']);
  });

  it('the blank card closes when it stops being offered: the workshop closed under it, it is not open on the way back', async () => {
    const app = await onACard();
    renderApp(app);
    app.openOwnCard();
    app.openDraft = 'Half a story';
    await screen.findByRole('dialog');
    app.screen = 'closed';
    expect(app.cardOpen).toBe(false);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    app.screen = 'card';
    expect(app.cardOpen).toBe(false);
    app.openOwnCard();
    expect(app.openDraft).toBe('Half a story');
  });

  it('a tap on the scrim closes the blank card and keeps the words', async () => {
    const app = await onACard();
    const user = userEvent.setup();
    renderApp(app);
    await user.click(opener());
    await screen.findByRole('dialog');
    await user.type(field(), 'Words to keep');
    await user.click(document.querySelector('.scrim')!);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(app.cardOpen).toBe(false);
    expect(await db(app).events.count()).toBe(0);
    await user.click(opener());
    await screen.findByRole('dialog');
    expect(field().value).toBe('Words to keep');
  });

  it('"Delete everything" removes a blank card\'s readable copy with the rest', async () => {
    const app = await onACard();
    stubRoutes({ [`/api/${SLUG}/sync`]: [SYNCED], [`/api/${SLUG}/me`]: [] });
    expect(await saveOwnCard(app, 'Gone soon')).toBe(true);
    expect(app.copies.size).toBe(1);
    app.go = () => {};
    app.askDelete();
    await app.deleteMe();
    expect(app.copies.size).toBe(0);
    expect(app.world.tiles).toEqual([]);
    expect(await new WorkshopStore(SLUG).answers()).toEqual([]);
    expect(await new WorkshopStore(SLUG).events.count()).toBe(0);
  });

  it('when sealing fails nothing is stored and the page says CLIENT_SEAL_FAILED', async () => {
    const app = await onACard();
    renderApp(app);
    app.openOwnCard();
    app.openDraft = 'a lone surrogate \uD83D cannot be encoded';
    await screen.findByRole('dialog');
    await userEvent.setup().click(save());
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(copy.error('CLIENT_SEAL_FAILED'));
    expect(app.error).toBe('CLIENT_SEAL_FAILED');
    expect(await db(app).events.count()).toBe(0);
    expect(await db(app).answers()).toEqual([]);
    expect(app.cardOpen).toBe(true);
    expect(app.openDraft).toBe('a lone surrogate \uD83D cannot be encoded');
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
    for (const words of ['Warm-up', 'Checkpoint']) await answerFront(app, words);
    expect(app.card).toBeUndefined();
    expect(app.live!.deckDone).toBe(true);
    renderApp(app);
    expect(screen.getByRole('note').textContent).toContain(copy.text('Thank you card'));
    await userEvent.setup().click(opener());
    await screen.findByRole('dialog');
    app.openDraft = 'Still something to say';
    expect(await app.save()).toBe(true);
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

  it("a second device that replays the server's rows shows the blank card's tile and plans the same round", async () => {
    // The first device: a card answered, then a blank card, both synced.
    const first = await onACard();
    stubRoutes({});
    expect(await answerFront(first, 'A card answered')).toBe(true);
    expect(await saveOwnCard(first, 'A story of my own')).toBe(true);
    const rows = await db(first).history();
    const front = first.card!.id;
    const queue = [...first.live!.plan.queue];

    // The second device: nothing stored, the same code; GET /me hands it the server's rows.
    freshIndexedDb();
    stubRoutes({});
    const second = new AppState();
    second.workshop = workshop;
    second.copy = copy;
    second.store = new WorkshopStore(SLUG);
    await second.store.set('demoSeen', '2026-11-16');
    second.wait = async () => {};
    second.code = first.code;
    second.me = {
      workshop: { slug: SLUG, name: 'x', closesDay: '2026-12-06', deleteDay: '2027-02-05' },
      participant: { createdDay: '2026-11-16', invitesLeft: 3, wave: 'wave-1', sessionsCount: 1 },
      sessions: rows.sessions,
      events: rows.events,
    } as AppState['me'];
    await second.enterSession();
    expect(second.sessionNo).toBe(1);
    expect(second.card!.id).toBe(front);
    expect(second.live!.plan.queue).toEqual(queue);
    expect(second.live!.nextSeq).toBe(first.live!.nextSeq);
    const tiles = second.world.tiles;
    expect(tiles.map((t) => t.own ?? false)).toEqual([false, true]);
    expect(tiles.map((t) => t.answer)).toEqual([null, null]);
  });
});

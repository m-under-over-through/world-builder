import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { isOwnCardId, type Event, type Session } from '@wb/contracts';
import App from '../src/App.svelte';
import { fill } from '../src/lib/copy.ts';
import { replaySession } from '../src/lib/session.ts';
import { AppState } from '../src/lib/state.svelte.ts';
import { answerKey, WorkshopStore } from '../src/lib/store.ts';
import { findWorkshop } from '../src/lib/workshops.ts';
import { freshIndexedDb, stubRoutes } from './helpers.ts';

/**
 * Tiles open (ADR 0024): a tap on a tile in "Your world so far" opens the place to write for that
 * card. A card set aside can be answered there, an answer changed, a blank card too. Nothing
 * stored is changed: a change is one more `answered` event for the same card id, and the latest
 * one is the answer. Every test stubs the routes before anything can sync, so no request leaves.
 */
const SLUG = 'rural-manufacturing';
const workshop = findWorkshop(SLUG)!;
const copy = workshop.copy;
const CODE = '1234567890123456';
const db = (app: AppState) => app.store as WorkshopStore;
const question = (id: string) => workshop.deck.cards.find((c) => c.id === id)!.text;

beforeEach(freshIndexedDb);
afterEach(() => vi.unstubAllGlobals());

/** A device with a code, the onboarding card seen, and a round started on its first card. */
async function started(): Promise<AppState> {
  stubRoutes({});
  return reopened();
}

/** The same device opened again: a new state on the same store, as after a reload. */
async function reopened(me: AppState['me'] = null): Promise<AppState> {
  const app = new AppState();
  app.workshop = workshop;
  app.copy = copy;
  app.store = new WorkshopStore(SLUG);
  await app.store.set('demoSeen', '2026-11-16');
  app.code = CODE;
  app.wait = async () => {};
  app.me = me;
  await app.enterSession();
  return app;
}

function renderApp(app: AppState) {
  app.open = async () => {};
  return render(App, { app });
}

/** Answer the front card in the stack; returns its id. */
async function answerFront(app: AppState, words: string): Promise<string> {
  const id = app.card!.id;
  app.draft = words;
  expect(await app.save()).toBe(true);
  return id;
}

/**
 * Set the front card aside, then answer cards until it comes round again in the next round
 * (ADR 0020: never first, so after one fresh card). Returns its id, with it in front again.
 */
async function setAsideUntilBack(app: AppState): Promise<string> {
  const id = app.card!.id;
  await app.setAside();
  for (let i = 0; i < 12 && app.card?.id !== id; i++) await answerFront(app, `Answer ${i}`);
  expect(app.card!.id).toBe(id);
  return id;
}

const answersFor = async (app: AppState, cardId: string) =>
  (await db(app).events.toArray()).filter((e) => e.kind === 'answered' && e.cardId === cardId);

/** The button of the tile showing this text: its name is what it shows, then its pen's words. */
const tileButton = (text: string, within_: HTMLElement = document.body) =>
  within(within_).getByRole('button', { name: (name) => name.includes(text) });
const placeToWrite = (name: string) => screen.findByRole('dialog', { name });

describe('a card set aside', () => {
  it('a card set aside opens empty from its tile; Save records one answered event for that card, sealed, and its white tile becomes a tile with the words', async () => {
    const app = await started();
    const aside = app.card!.id;
    await app.setAside();
    const front = app.card!.id;
    const user = userEvent.setup();
    renderApp(app);
    await user.click(
      screen.getByRole('button', { name: (n) => n.startsWith(copy.item('Your world', 'title')) }),
    );
    const sheet = await screen.findByRole('dialog');
    const tile = tileButton(question(aside), sheet);
    expect(tile.textContent).toContain(copy.item('Your world', 'open aside'));
    await user.click(tile);
    const dialog = await placeToWrite(question(aside));
    // The sheet has closed under it; the field is named by the question and empty.
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    const field = within(dialog).getByRole('textbox', { name: question(aside) });
    expect((field as HTMLTextAreaElement).value).toBe('');
    expect(document.activeElement).toBe(field);
    expect(dialog.textContent).not.toContain(copy.text('Own card: hint'));
    await user.type(field, 'Answered from its tile');
    await user.click(
      within(dialog).getByRole('button', { name: copy.item('Own card: buttons', 'save') }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    const answered = await answersFor(app, aside);
    expect(answered).toHaveLength(1);
    expect(answered[0]!.sessionId).toBe(app.live!.session.id);
    expect(answered[0]!.body!.startsWith('v1.')).toBe(true);
    expect(JSON.stringify(await db(app).events.toArray())).not.toContain('Answered from');
    expect((await db(app).answers()).find((a) => a.cardId === aside)!.text).toBe(
      'Answered from its tile',
    );
    expect(app.world.aside).toEqual([]);
    expect(app.world.tiles.find((t) => t.cardId === aside)).toMatchObject({
      answer: 'Answered from its tile',
      opens: true,
    });
    // The front card did not move; the focus is back on the world pill.
    expect(app.card!.id).toBe(front);
    await waitFor(() => expect(document.activeElement?.id).toBe('world-pill'));
  });

  it('Not now on a card set aside records nothing, and the words are there the next time', async () => {
    const app = await started();
    const aside = app.card!.id;
    await app.setAside();
    const before = await db(app).events.count();
    const user = userEvent.setup();
    renderApp(app);
    app.openTile(aside);
    const dialog = await placeToWrite(question(aside));
    await user.type(within(dialog).getByRole('textbox'), 'Not yet');
    await user.click(
      within(dialog).getByRole('button', { name: copy.item('Own card: buttons', 'not now') }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await db(app).events.count()).toBe(before);
    expect(app.world.aside.map((t) => t.cardId)).toEqual([aside]);
    app.openTile(aside);
    const again = await placeToWrite(question(aside));
    expect((within(again).getByRole('textbox') as HTMLTextAreaElement).value).toBe('Not yet');
    // Esc closes it too, and keeps the words.
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await db(app).events.count()).toBe(before);
  });

  it('a card set aside twice opens and can be answered, and never comes round again', async () => {
    const app = await started();
    const id = await setAsideUntilBack(app);
    await app.setAside();
    const kinds = (await db(app).events.toArray())
      .filter((e) => e.cardId === id)
      .map((e) => e.kind);
    expect(kinds).toContain('deferred');
    expect(app.world.aside.map((t) => t.cardId)).toContain(id);
    app.openTile(id);
    expect(app.writing).toBe(id);
    expect(app.ownDraft).toBe('');
    expect(await app.saveOwnCard('At last')).toBe(true);
    expect(await answersFor(app, id)).toHaveLength(1);
    expect(app.world.aside.map((t) => t.cardId)).not.toContain(id);
    for (let i = 0; i < 16; i++) {
      expect(app.card?.id).not.toBe(id);
      await answerFront(app, `Later ${i}`);
    }
  });

  it('answering the front card from its own set-aside tile brings the next card forward', async () => {
    const app = await started();
    const id = await setAsideUntilBack(app);
    const next = app.backCards[0]!.card.id;
    expect(app.world.aside.map((t) => t.cardId)).toEqual([id]);
    app.draft = 'Begun in the stack';
    app.openTile(id);
    // One draft per card: the front card's is the stack's own.
    expect(app.ownDraft).toBe('Begun in the stack');
    expect(await app.saveOwnCard('Finished from the tile')).toBe(true);
    expect(app.card!.id).toBe(next);
    expect(app.draft).toBe('');
    expect(app.live!.shown.has(next)).toBe(true);
    expect(app.world.tiles.find((t) => t.cardId === id)!.answer).toBe('Finished from the tile');
    // A reload lands on the same card.
    const again = await reopened();
    expect(again.card!.id).toBe(next);
  });

  it('the set-aside tiles are those of every round, oldest first, and a card answered since is not among them', async () => {
    const app = await started();
    const a = app.card!.id;
    await app.setAside();
    const b = app.card!.id;
    await app.setAside();
    while (app.sessionNo === 1) await answerFront(app, 'Round one');
    // The first card of a round is never one coming back (ADR 0020).
    const c = app.card!.id;
    expect([a, b]).not.toContain(c);
    await app.setAside();
    expect(app.world.aside.map((t) => t.cardId)).toEqual([a, b, c]);
    app.openTile(a);
    expect(await app.saveOwnCard('Answered since')).toBe(true);
    expect(app.world.aside.map((t) => t.cardId)).toEqual([b, c]);
    const again = await reopened();
    expect(again.world.aside.map((t) => t.cardId)).toEqual([b, c]);
  });
});

describe('an answer', () => {
  it('an answer opens with its words; Save records a second answered event for the same card and the tile shows the new words in the same place', async () => {
    const app = await started();
    const first = await answerFront(app, 'First words');
    const second = await answerFront(app, 'Second words');
    const keys = app.world.tiles.map((t) => t.key);
    app.wide = true;
    const user = userEvent.setup();
    renderApp(app);
    const tile = tileButton('First words');
    expect(tile.textContent).toContain(copy.item('Your world', 'open answer'));
    await user.click(tile);
    const dialog = await placeToWrite(question(first));
    const field = within(dialog).getByRole('textbox') as HTMLTextAreaElement;
    expect(field.value).toBe('First words');
    await user.clear(field);
    await user.type(field, 'Better words');
    await user.click(
      within(dialog).getByRole('button', { name: copy.item('Own card: buttons', 'save') }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await answersFor(app, first)).toHaveLength(2);
    expect(app.world.tiles.map((t) => t.cardId)).toEqual([first, second]);
    expect(app.world.tiles.map((t) => t.key)).toEqual(keys);
    expect(app.world.tiles.map((t) => t.answer)).toEqual(['Better words', 'Second words']);
    // On a laptop the focus goes back to the tile.
    await waitFor(() =>
      expect((document.activeElement as HTMLElement).dataset['tile']).toBe(first),
    );
  });

  it('changing an answer leaves the round as it was: the same front card, the same draft, the same queue', async () => {
    const app = await started();
    const answered = await answerFront(app, 'Kept for now');
    app.draft = 'Half an answer';
    const front = app.card!.id;
    const queue = [...app.live!.plan.queue];
    const backs = app.backCards.map((b) => b.card.id);
    const position = app.position;
    app.openTile(answered);
    expect(await app.saveOwnCard('Changed my mind')).toBe(true);
    expect(app.card!.id).toBe(front);
    expect(app.draft).toBe('Half an answer');
    expect(app.cardState).toBe('fresh');
    expect(app.live!.plan.queue).toEqual(queue);
    expect(app.backCards.map((b) => b.card.id)).toEqual(backs);
    expect(app.position).toEqual(position);
    const kinds = (await db(app).events.toArray()).sort((x, y) => x.seq - y.seq).map((e) => e.kind);
    expect(kinds.at(-1)).toBe('answered');
    expect(kinds.filter((k) => k === 'shown')).toHaveLength(2);
    // The same live round before and after a reload.
    const live = app.live!;
    const again = await reopened();
    expect(again.card!.id).toBe(front);
    expect(again.live!.plan.queue).toEqual(live.plan.queue);
    expect(again.live!.nextSeq).toBe(live.nextSeq);
    expect([...again.live!.answered].sort()).toEqual([...live.answered].sort());
    expect(again.live!.untouched).toBe(live.untouched);
    expect(again.live!.deckDone).toBe(live.deckDone);
    expect(again.world.tiles.map((t) => t.answer)).toEqual(['Changed my mind']);
  });

  it('an answer from an earlier round changed now: the tile stays in its round, the words come from this round', async () => {
    const app = await started();
    const first = await answerFront(app, 'Round one words');
    while (app.sessionNo === 1) await answerFront(app, 'Round one');
    app.openTile(first);
    expect(app.ownDraft).toBe('Round one words');
    expect(await app.saveOwnCard('Round two words')).toBe(true);
    const tile = app.world.tiles.find((t) => t.cardId === first)!;
    expect(tile.sessionNo).toBe(1);
    expect(app.world.tiles[0]!.cardId).toBe(first);
    expect(tile.answer).toBe('Round two words');
    const versions = await answersFor(app, first);
    expect(versions.map((e) => e.sessionId).sort()).toEqual(
      [app.history.sessions.find((s) => s.sessionNo === 1)!.id, app.live!.session.id].sort(),
    );
  });

  it('a blank card opens with its words and keeps its id when changed', async () => {
    const app = await started();
    expect(await app.saveOwnCard('My story')).toBe(true);
    const own = app.world.tiles.find((t) => t.own)!;
    expect(own.opens).toBe(true);
    app.openTile(own.cardId);
    expect(app.writing).toBe(own.cardId);
    expect(app.writingCard).toBeNull();
    expect(app.ownDraft).toBe('My story');
    renderApp(app);
    const dialog = await placeToWrite(copy.text('Own card: title'));
    expect(dialog.textContent).toContain(copy.text('Own card: hint'));
    expect(await app.saveOwnCard('My story, told better')).toBe(true);
    const events = (await db(app).events.toArray()).filter((e) => isOwnCardId(e.cardId));
    expect(events.map((e) => e.cardId)).toEqual([own.cardId, own.cardId]);
    expect(app.world.tiles.filter((t) => t.own).map((t) => t.answer)).toEqual([
      'My story, told better',
    ]);
    // "Write your own story" still starts a new one, empty.
    app.openOwnCard();
    expect(app.ownDraft).toBe('');
  });

  it('an empty text cannot be saved over an answer', async () => {
    const app = await started();
    const answered = await answerFront(app, 'Something');
    renderApp(app);
    app.openTile(answered);
    const dialog = await placeToWrite(question(answered));
    const save = within(dialog).getByRole('button', {
      name: copy.item('Own card: buttons', 'save'),
    }) as HTMLButtonElement;
    for (const text of ['', '  \n ']) {
      app.ownDraft = text;
      await waitFor(() => expect(save.disabled).toBe(true));
      expect(await app.saveOwnCard()).toBe(false);
    }
    expect(await answersFor(app, answered)).toHaveLength(1);
    expect(app.world.tiles[0]!.answer).toBe('Something');
    expect(app.ownCardOpen).toBe(true);
  });
});

describe('one tile per card', () => {
  it("one tile per card, also after a reload and after the server's rows come back", async () => {
    const app = await started();
    const first = await answerFront(app, 'One');
    await answerFront(app, 'Two');
    app.openTile(first);
    expect(await app.saveOwnCard('One, again')).toBe(true);
    app.openTile(first);
    expect(await app.saveOwnCard('One, a third time')).toBe(true);
    expect(await answersFor(app, first)).toHaveLength(3);
    const unique = (a: AppState) => {
      const tiles = a.world.tiles;
      expect(new Set(tiles.map((t) => t.key)).size).toBe(tiles.length);
      expect(new Set(tiles.map((t) => t.cardId)).size).toBe(tiles.length);
      return tiles;
    };
    expect(unique(app).map((t) => t.answer)).toEqual(['One, a third time', 'Two']);

    // A reload, then the server handing back the same rows: merged, counted once.
    const rows = await db(app).history();
    const me = {
      workshop: { slug: SLUG, name: 'x', closesDay: '2026-12-06', deleteDay: '2027-02-05' },
      participant: { createdDay: '2026-11-16', invitesLeft: 3, wave: 'wave-1', sessionsCount: 1 },
      sessions: rows.sessions,
      events: rows.events,
    } as AppState['me'];
    expect(unique(await reopened()).map((t) => t.answer)).toEqual(['One, a third time', 'Two']);
    const synced = await reopened(me);
    expect(unique(synced).map((t) => t.answer)).toEqual(['One, a third time', 'Two']);

    // A second device: the same rows, no words, and no tile is a button.
    freshIndexedDb();
    stubRoutes({});
    const second = await reopened(me);
    const tiles = unique(second);
    expect(tiles.map((t) => [t.answer, t.opens])).toEqual([
      [null, false],
      [null, false],
    ]);
    expect(second.card!.id).toBe(app.card!.id);
  });

  it('the counts follow the tiles: a changed answer does not count twice', async () => {
    const app = await started();
    const first = await answerFront(app, 'One');
    await answerFront(app, 'Two');
    const aside = app.card!.id;
    await app.setAside();
    app.openTile(first);
    expect(await app.saveOwnCard('One, changed')).toBe(true);
    renderApp(app);
    const pill = screen.getByRole('button', {
      name: fill(copy.item('Your world', 'pill label'), { n: 2 }),
    });
    await userEvent.setup().click(pill);
    const sheet = await screen.findByRole('dialog');
    expect(sheet.textContent).toContain(
      fill(copy.item('Your world', 'summary'), { answered: 2, aside: 1 }),
    );
    expect(app.world.aside.map((t) => t.cardId)).toEqual([aside]);
  });
});

describe('on another device', () => {
  const answered = (session: Session, cardId: string, seq: number): Event => ({
    id: crypto.randomUUID(),
    sessionId: session.id,
    cardId,
    seq,
    kind: 'answered',
    body: 'v1.' + 'Q'.repeat(80),
    createdDay: '2026-11-17',
    deckVersion: workshop.deck.version,
  });

  it('an answer written on another device is a tile without words and not a button', async () => {
    const app = await started();
    const session = app.live!.session;
    const cardId = app.live!.plan.queue[1]!;
    app.history = { ...app.history, events: [...app.history.events, answered(session, cardId, 9)] };
    app.live = replaySession(workshop.deck, workshop.config, session, app.history);
    expect(app.world.tiles).toEqual([
      expect.objectContaining({ cardId, answer: null, opens: false }),
    ]);
    app.openTile(cardId);
    expect(app.ownCardOpen).toBe(false);
    expect(await app.saveOwnCard('Over words I cannot see')).toBe(true);
    // Saved as a new blank card, never over the answer written elsewhere.
    expect(await answersFor(app, cardId)).toHaveLength(0);
    app.worldOpen = true;
    renderApp(app);
    const sheet = await screen.findByRole('dialog');
    const tile = [...sheet.querySelectorAll('.world-section.answered .tile')].find((t) =>
      t.textContent!.includes(question(cardId)),
    )!;
    expect(tile.tagName).toBe('LI');
    expect(tile.textContent).toContain(copy.item('Your world', 'written elsewhere'));
  });

  it('an answer changed on another device shows no words here, even where an earlier version was written here', async () => {
    const app = await started();
    const first = await answerFront(app, 'Written here first');
    while (app.sessionNo === 1) await answerFront(app, 'Round one');
    const roundTwo = app.live!.session;
    app.history = {
      ...app.history,
      events: [...app.history.events, answered(roundTwo, first, app.live!.nextSeq + 5)],
    };
    const tile = app.world.tiles.find((t) => t.cardId === first)!;
    expect(tile.answer).toBeNull();
    expect(tile.opens).toBe(false);
    expect(app.copies.get(answerKey(app.history.sessions[0]!.id, first))).toBe(
      'Written here first',
    );
  });
});

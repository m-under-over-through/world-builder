import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { isOwnCardId, type Event, type Session } from '@wb/contracts';
import App from '../src/App.svelte';
import { fill } from '../src/lib/copy.ts';
import { replaySession } from '../src/lib/session.ts';
import { AppState, tintOf } from '../src/lib/state.svelte.ts';
import { answerKey, WorkshopStore } from '../src/lib/store.ts';
import { findWorkshop } from '../src/lib/workshops.ts';
import { freshIndexedDb, saveOwnCard, stubRoutes } from './helpers.ts';

/**
 * Tiles open (ADR 0024): a tap on a tile in "Your world so far" opens that card in the open card
 * (ADR 0027). A card set aside can be answered there, an answer changed, a blank card too. Nothing
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

/** Answer the front card through the open card; returns its id. */
async function answerFront(app: AppState, words: string): Promise<string> {
  const id = app.card!.id;
  app.openCard();
  app.openDraft = words;
  expect(await app.save()).toBe(true);
  return id;
}

/** Write these words in the open card and Save. */
async function saveOpen(app: AppState, words: string): Promise<boolean> {
  app.openDraft = words;
  return app.save();
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
const openCard = (name: string) => screen.findByRole('dialog', { name });

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
    const dialog = await openCard(question(aside));
    // The sheet has closed under it; the field is named by the question and empty.
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    const field = within(dialog).getByRole('textbox', { name: question(aside) });
    expect((field as HTMLTextAreaElement).value).toBe('');
    // The field takes the focus after `tick()`, once its box is in place (ADR 0025).
    await waitFor(() => expect(document.activeElement).toBe(field));
    expect(dialog.textContent).not.toContain(copy.text('Own card: hint'));
    await user.type(field, 'Answered from its tile');
    await user.click(within(dialog).getByRole('button', { name: copy.item('Buttons', 'save') }));
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

  it('× on a card set aside records nothing, and the words are there the next time', async () => {
    const app = await started();
    const aside = app.card!.id;
    await app.setAside();
    const before = await db(app).events.count();
    const user = userEvent.setup();
    renderApp(app);
    app.openTile(aside);
    const dialog = await openCard(question(aside));
    await user.type(within(dialog).getByRole('textbox'), 'Not yet');
    await user.click(
      within(dialog).getByRole('button', {
        name: copy.item('Card labels', 'close without saving'),
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await db(app).events.count()).toBe(before);
    expect(app.world.aside.map((t) => t.cardId)).toEqual([aside]);
    app.openTile(aside);
    const again = await openCard(question(aside));
    expect((within(again).getByRole('textbox') as HTMLTextAreaElement).value).toBe('Not yet');
    // Esc closes it too, and keeps the words.
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await db(app).events.count()).toBe(before);
  });

  it('a card set aside twice opens and can be answered, and never comes round again', async () => {
    const app = await started();
    const id = await setAsideUntilBack(app);
    const inTheStack = tintOf(app.cardNo);
    await app.setAside();
    const kinds = (await db(app).events.toArray())
      .filter((e) => e.cardId === id)
      .map((e) => e.kind);
    expect(kinds).toContain('deferred');
    expect(app.world.aside.map((t) => t.cardId)).toContain(id);
    app.openTile(id);
    expect(app.writing).toBe(id);
    expect(app.openDraft).toBe('');
    // Set aside for the second time in this round: it opens on the tint it had in the stack of
    // this round, and its tile takes the same one when it is answered.
    const tint = app.writingTint;
    expect(tint).toBe(inTheStack);
    expect(await saveOpen(app, 'At last')).toBe(true);
    expect(await answersFor(app, id)).toHaveLength(1);
    expect(app.world.aside.map((t) => t.cardId)).not.toContain(id);
    expect(tintOf(app.world.tiles.find((t) => t.cardId === id)!.n)).toBe(tint);
    for (let i = 0; i < 16; i++) {
      expect(app.card?.id).not.toBe(id);
      await answerFront(app, `Later ${i}`);
    }
  });

  it('a card set aside in an earlier round that this round does not plan opens on the tint of number 0, and its tile takes the same', async () => {
    const app = await started();
    const id = await setAsideUntilBack(app);
    // Set aside a second time, it is out of the rounds for good (ADR 0020).
    await app.setAside();
    for (let i = 0; i < 40 && app.live!.queueAsPlanned.includes(id); i++)
      await answerFront(app, `Later ${i}`);
    // A later round, which does not plan it: its tile is still there, and it has no number here.
    expect(app.live!.queueAsPlanned).not.toContain(id);
    expect(app.world.aside.map((t) => t.cardId)).toContain(id);
    app.openTile(id);
    expect(app.writingTint).toBe(tintOf(0));
    expect(await saveOpen(app, 'At last')).toBe(true);
    expect(tintOf(app.world.tiles.find((t) => t.cardId === id)!.n)).toBe(tintOf(0));
  });

  it('a card set aside that has come round is lifted in both places while it is open from its tile: its tile, and the card in front', async () => {
    const app = await started();
    const id = await setAsideUntilBack(app);
    app.wide = true;
    const user = userEvent.setup();
    renderApp(app);
    // The card in front and its white tile both carry the question: the tile is found by its id.
    const tile = document.querySelector<HTMLElement>(`[data-tile="${id}"]`)!;
    await user.click(tile);
    await screen.findByRole('dialog', { name: question(id) });
    // One card, one place (ADR 0027): it is in the open card, and nowhere else on the page.
    expect(tile.classList.contains('lifted')).toBe(true);
    expect(document.querySelector('.card.front')!.classList.contains('lifted')).toBe(true);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.querySelector('.lifted')).toBeNull();
  });

  it('answering the front card from its own set-aside tile brings the next card forward', async () => {
    const app = await started();
    const id = await setAsideUntilBack(app);
    const next = app.backCards[0]!.card.id;
    expect(app.world.aside.map((t) => t.cardId)).toEqual([id]);
    app.draft = 'Begun in the stack';
    app.openTile(id);
    // One draft per card: the front card's is the stack's own.
    expect(app.openDraft).toBe('Begun in the stack');
    expect(await saveOpen(app, 'Finished from the tile')).toBe(true);
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
    expect(await saveOpen(app, 'Answered since')).toBe(true);
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
    const dialog = await openCard(question(first));
    // The tile it was opened from is lifted; its place in the list stays (ADR 0027).
    expect(tile.classList.contains('lifted')).toBe(true);
    expect(tile.isConnected).toBe(true);
    expect(document.querySelector('.card.front')!.classList.contains('lifted')).toBe(false);
    const field = within(dialog).getByRole('textbox') as HTMLTextAreaElement;
    expect(field.value).toBe('First words');
    await user.clear(field);
    await user.type(field, 'Better words');
    await user.click(within(dialog).getByRole('button', { name: copy.item('Buttons', 'save') }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await answersFor(app, first)).toHaveLength(2);
    expect(app.world.tiles.map((t) => t.cardId)).toEqual([first, second]);
    expect(app.world.tiles.map((t) => t.key)).toEqual(keys);
    expect(app.world.tiles.map((t) => t.answer)).toEqual(['Better words', 'Second words']);
    expect(tileButton('Better words').classList.contains('lifted')).toBe(false);
    // On a laptop the focus goes back to the tile.
    await waitFor(() =>
      expect((document.activeElement as HTMLElement).dataset['tile']).toBe(first),
    );
  });

  it('an answer opens on the tint of its tile, a card set aside in this round on the tint it had in the stack, and a blank card white', async () => {
    const app = await started();
    const first = await answerFront(app, 'First words');
    const second = await answerFront(app, 'Second words');
    const aside = app.card!.id;
    // The tint of the card in front of the stack, before it is set aside.
    const inTheStack = `var(--tint-${tintOf(app.cardNo)})`;
    await app.setAside();
    expect(await saveOwnCard(app, 'My story')).toBe(true);
    app.wide = true;
    const user = userEvent.setup();
    renderApp(app);
    const tints: string[] = [];
    for (const [id, words] of [
      [first, 'First words'],
      [second, 'Second words'],
    ] as const) {
      const tile = tileButton(words);
      await user.click(tile);
      const dialog = await openCard(question(id));
      const tint = dialog.style.getPropertyValue('--tint');
      expect(tint).toMatch(/^var\(--tint-(sun|mint|sky|lilac)\)$/);
      expect(tint).toBe(tile.style.getPropertyValue('--tint'));
      expect(dialog.classList.contains('tinted')).toBe(true);
      // No box around the field on a tint: a rule under the question.
      expect(dialog.querySelector('.rule')).not.toBeNull();
      tints.push(tint);
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    }
    // A card set aside in this round: its tile is white, and it opens on the tint it had in the stack.
    const whiteTile = tileButton(question(aside));
    expect(whiteTile.style.getPropertyValue('--tint')).toBe('');
    await user.click(whiteTile);
    const setAside = await openCard(question(aside));
    expect(setAside.classList.contains('tinted')).toBe(true);
    expect(setAside.style.getPropertyValue('--tint')).toBe(inTheStack);
    expect(setAside.querySelector('.rule')).not.toBeNull();
    tints.push(inTheStack);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // Three cards one after the other in a round: three tints.
    expect(new Set(tints).size).toBe(3);
    // A blank card, written or new, is white: it is in no deck and has no number.
    await user.click(tileButton(copy.text('Own card: tile')));
    const written = await openCard(copy.text('Own card: title'));
    expect(written.classList.contains('tinted')).toBe(false);
    expect(written.style.getPropertyValue('--tint')).toBe('');
    expect(written.querySelector('.rule')).toBeNull();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    app.openOwnCard();
    const blank = await openCard(copy.text('Own card: title'));
    expect(blank.classList.contains('tinted')).toBe(false);
  });

  it('a card set aside keeps its tint while its answer is saved, and its tile then has the same tint', async () => {
    const app = await started();
    await answerFront(app, 'First words');
    const aside = app.card!.id;
    const inTheStack = `var(--tint-${tintOf(app.cardNo)})`;
    await app.setAside();
    app.wide = true;
    const user = userEvent.setup();
    renderApp(app);
    await user.click(tileButton(question(aside)));
    const dialog = await openCard(question(aside));
    const tint = dialog.style.getPropertyValue('--tint');
    expect(tint).toBe(inTheStack);
    await user.type(within(dialog).getByRole('textbox'), 'Answered from its tile');
    // Hold the write of the readable copy, the step after the event is recorded.
    const store = db(app);
    const putAnswer = store.putAnswer.bind(store);
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    store.putAnswer = async (row) => {
      await held;
      return putAnswer(row);
    };
    await user.click(within(dialog).getByRole('button', { name: copy.item('Buttons', 'save') }));
    await waitFor(() => expect(app.world.tiles.some((t) => t.cardId === aside)).toBe(true));
    // The card is a tile already and the open card still stands on it: the same tint.
    expect(app.writing).toBe(aside);
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(dialog.style.getPropertyValue('--tint')).toBe(tint);
    release();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(tileButton('Answered from its tile').style.getPropertyValue('--tint')).toBe(tint);
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
    expect(await saveOpen(app, 'Changed my mind')).toBe(true);
    expect(app.card!.id).toBe(front);
    expect(app.draft).toBe('Half an answer');
    expect(app.cardOpen).toBe(false);
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
    expect(app.openDraft).toBe('Round one words');
    expect(await saveOpen(app, 'Round two words')).toBe(true);
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
    expect(await saveOwnCard(app, 'My story')).toBe(true);
    const own = app.world.tiles.find((t) => t.own)!;
    expect(own.opens).toBe(true);
    app.openTile(own.cardId);
    expect(app.writing).toBe(own.cardId);
    expect(app.writingCard).toBeNull();
    expect(app.openDraft).toBe('My story');
    renderApp(app);
    const dialog = await openCard(copy.text('Own card: title'));
    expect(dialog.textContent).toContain(copy.text('Own card: hint'));
    expect(await saveOpen(app, 'My story, told better')).toBe(true);
    const events = (await db(app).events.toArray()).filter((e) => isOwnCardId(e.cardId));
    expect(events.map((e) => e.cardId)).toEqual([own.cardId, own.cardId]);
    expect(app.world.tiles.filter((t) => t.own).map((t) => t.answer)).toEqual([
      'My story, told better',
    ]);
    // "Write your own story" still starts a new one, empty.
    app.openOwnCard();
    expect(app.openDraft).toBe('');
  });

  it('an empty text cannot be saved over an answer', async () => {
    const app = await started();
    const answered = await answerFront(app, 'Something');
    renderApp(app);
    app.openTile(answered);
    const dialog = await openCard(question(answered));
    const save = within(dialog).getByRole('button', {
      name: copy.item('Buttons', 'save'),
    }) as HTMLButtonElement;
    for (const text of ['', '  \n ']) {
      app.openDraft = text;
      await waitFor(() => expect(save.disabled).toBe(true));
      expect(await app.save()).toBe(false);
    }
    expect(await answersFor(app, answered)).toHaveLength(1);
    expect(app.world.tiles[0]!.answer).toBe('Something');
    expect(app.cardOpen).toBe(true);
  });
});

describe('one tile per card', () => {
  it("one tile per card, also after a reload and after the server's rows come back", async () => {
    const app = await started();
    const first = await answerFront(app, 'One');
    await answerFront(app, 'Two');
    app.openTile(first);
    expect(await saveOpen(app, 'One, again')).toBe(true);
    app.openTile(first);
    expect(await saveOpen(app, 'One, a third time')).toBe(true);
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
    expect(await saveOpen(app, 'One, changed')).toBe(true);
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
    expect(app.cardOpen).toBe(false);
    // With nothing open, Save saves nothing: never over the answer written elsewhere.
    expect(await saveOpen(app, 'Over words I cannot see')).toBe(false);
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

  it('an answer changed on another device in the same round shows no words here and is not a button, though this device holds a copy under the same key', async () => {
    // Two phones on one link share the round. The copy is kept by round and card, so this
    // phone's earlier words sit under the very key the later answer has. Shown as the latest,
    // a Save here would replace words this phone has never seen (the review of pull request 67).
    const app = await started();
    const cardId = await answerFront(app, 'Written here first');
    const round = app.live!.session;
    const key = answerKey(round.id, cardId);
    expect(app.world.tiles.find((t) => t.cardId === cardId)).toEqual(
      expect.objectContaining({ answer: 'Written here first', opens: true }),
    );
    // The other phone changes the answer in the same round; its event comes back with a sync.
    const theirs = answered(round, cardId, app.live!.nextSeq + 5);
    app.history = { ...app.history, events: [...app.history.events, theirs] };
    expect(app.copies.get(key)).toBe('Written here first');
    const tile = app.world.tiles.find((t) => t.cardId === cardId)!;
    expect(tile.answer).toBeNull();
    expect(tile.opens).toBe(false);
    app.openTile(cardId);
    expect(app.cardOpen).toBe(false);
    // Still so after a reload: the stored copy names the answer it is the words of.
    const stored = (await app.store!.answers()).find((a) => a.key === key)!;
    expect(stored.eventId).toBeDefined();
    expect(stored.eventId).not.toBe(theirs.id);
  });

  it('a copy from before copies named their answer counts only when the round holds one answer to the card', async () => {
    const app = await started();
    const cardId = await answerFront(app, 'Written before the change');
    const round = app.live!.session;
    const key = answerKey(round.id, cardId);
    // As an older version of the app left it: the words, and no event named.
    app.copyEvents = new Map();
    expect(app.world.tiles.find((t) => t.cardId === cardId)!.answer).toBe(
      'Written before the change',
    );
    app.history = {
      ...app.history,
      events: [...app.history.events, answered(round, cardId, app.live!.nextSeq + 5)],
    };
    expect(app.copies.get(key)).toBe('Written before the change');
    expect(app.world.tiles.find((t) => t.cardId === cardId)!.answer).toBeNull();
  });
});

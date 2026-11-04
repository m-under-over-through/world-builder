import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { MAX_ANSWER_CHARS, type Event, type Session } from '@wb/contracts';
import App from '../src/App.svelte';
import Card from '../src/screens/Card.svelte';
import { fill } from '../src/lib/copy.ts';
import { currentCardId, replaySession } from '../src/lib/session.ts';
import { AppState, tintOf, TOAST_MS } from '../src/lib/state.svelte.ts';
import { answerKey, WorkshopStore } from '../src/lib/store.ts';
import { codePoints } from '../src/lib/text.ts';
import { findWorkshop } from '../src/lib/workshops.ts';
import { freshIndexedDb, stubRoutes, SYNCED } from './helpers.ts';

/**
 * The card screen of the design (design/DESIGN.md; ADR 0015), rendered from a state a test
 * sets up by hand: the stack and its states, the label and the tint, the counter, the swipe,
 * the toast, "Your world so far" as a sheet and as a column, and the laptop page.
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
let ids = 0;
const answeredEvent = (cardId: string, seq: number, sessionId = SESSION.id): Event => ({
  id: `10000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`,
  sessionId,
  cardId,
  seq,
  kind: 'answered',
  body: 'v1.' + 'Q'.repeat(80),
  createdDay: '2026-11-16',
  deckVersion: workshop.deck.version,
});

beforeEach(freshIndexedDb);
afterEach(() => vi.unstubAllGlobals());

/**
 * A state on the first card of a first session: a store with the session row, instant waits, a
 * code, and an API stub that takes every sync, so the retry loop never spins on instant waits.
 */
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

/** The whole shell around a prepared state; the address is not read. */
function renderApp(app: AppState) {
  app.open = async () => {};
  return render(App, { app });
}

/** A wait that holds only the toast's timer, so a test can read the toast; every other wait is instant. */
function holdToast(app: AppState): { endHolds: () => void } {
  const holds: (() => void)[] = [];
  app.wait = (ms) =>
    ms === TOAST_MS ? new Promise<void>((r) => holds.push(r)) : Promise.resolve();
  return { endHolds: () => holds.splice(0).forEach((r) => r()) };
}

const frontCard = () =>
  screen.getByRole('button', {
    name: (name) => name.includes(copy.item('Card labels', 'tap to answer')),
  });
const tintOfSlot = (selector: string) =>
  (document.querySelector(selector) as HTMLElement).style.getPropertyValue('--tint');

describe('the label and the tint', () => {
  it('the tint follows the card number, four in turn', () => {
    expect([1, 2, 3, 4, 5, 8, 9].map(tintOf)).toEqual([
      'sun',
      'mint',
      'sky',
      'lilac',
      'sun',
      'lilac',
      'sun',
    ]);
  });

  it('the front card is "01 of 4 · Area" in the sun tint; the two behind carry the next tints', async () => {
    const app = await onACard();
    render(Card, { app });
    expect(frontCard().textContent).toContain(`01 of 4 · ${app.card!.area}`);
    expect(tintOfSlot('.slot-0')).toBe('var(--tint-sun)');
    expect(tintOfSlot('.slot-1')).toBe('var(--tint-mint)');
    expect(tintOfSlot('.slot-2')).toBe('var(--tint-sky)');
    expect(app.backCards.map((b) => b.card.id)).toEqual(app.live!.plan.queue.slice(1, 3));
  });

  it('a card without an area is "01 of 4"', async () => {
    const app = await onACard();
    const { id, set, text } = app.card!;
    app.card = { id, set, text };
    render(Card, { app });
    expect(frontCard().textContent).toContain(
      fill(copy.item('Card labels', 'position'), { n: '01', total: 4 }),
    );
    expect(frontCard().textContent).not.toContain('·');
  });

  it('a card set aside keeps its number and its tint when it comes round', async () => {
    const app = await onACard();
    const first = app.card!;
    await app.setAside();
    expect(app.cardNo).toBe(2);
    for (let i = 0; i < 2; i++) await app.setAside();
    expect(app.cardNo).toBe(4);
    await app.setAside();
    expect(app.card!.id).toBe(first.id);
    expect(app.cardNo).toBe(1);
    expect(app.queueLength).toBe(4);
  });
});

describe('the states of the card', () => {
  it('a click opens the card with the field focused; × closes it, keeps the draft, and the card has focus again', async () => {
    const app = await onACard();
    const user = userEvent.setup();
    render(Card, { app });
    await user.click(frontCard());
    const field = (await screen.findByRole('textbox')) as HTMLTextAreaElement;
    expect(app.cardState).toBe('answering');
    await waitFor(() => expect(document.activeElement).toBe(field));
    await user.type(field, 'Half an answer');
    await user.click(
      screen.getByRole('button', { name: copy.item('Card labels', 'close without saving') }),
    );
    expect(app.cardState).toBe('fresh');
    expect(app.draft).toBe('Half an answer');
    expect(screen.queryByRole('textbox')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(frontCard()));
    await user.click(frontCard());
    expect(((await screen.findByRole('textbox')) as HTMLTextAreaElement).value).toBe(
      'Half an answer',
    );
  });

  it('Enter on the focused card opens it', async () => {
    const app = await onACard();
    const user = userEvent.setup();
    render(Card, { app });
    frontCard().focus();
    await user.keyboard('{Enter}');
    expect(app.cardState).toBe('answering');
  });

  it('Save is off while the trimmed draft is empty', async () => {
    const app = await onACard({ cardState: 'answering', draft: '   \n ' });
    render(Card, { app });
    const save = screen.getByRole('button', {
      name: copy.item('Buttons', 'save'),
    }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });

  it('the answered card is drawn on its way out, with its words, as decoration', async () => {
    const app = await onACard();
    app.exiting = { card: app.card!, n: 1, answer: 'The words' };
    render(Card, { app });
    const exit = document.querySelector('.slot.exit')!;
    expect(exit.getAttribute('aria-hidden')).toBe('true');
    expect(exit.textContent).toContain('The words');
    expect(exit.textContent).toContain(app.card!.text);
  });

  /** A sync that answers only when the test says, and a wait that holds only the toast's timer. */
  function heldSync(app: AppState) {
    let answerSync = () => {};
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          answerSync = () =>
            resolve(
              new Response(JSON.stringify(SYNCED().body), {
                status: 200,
                headers: { 'content-type': 'application/json' },
              }),
            );
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const holds: (() => void)[] = [];
    app.wait = (ms) =>
      ms === TOAST_MS ? new Promise<void>((r) => holds.push(r)) : Promise.resolve();
    return {
      answerSync: async (nth: number) => {
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(nth));
        answerSync();
      },
      endHolds: () => holds.splice(0).forEach((r) => r()),
    };
  }

  it('Save: the toast says "Saved on this device" while the next card is the front, then "Synced" when the server takes it; silent once the toast is gone', async () => {
    const app = await onACard({ cardState: 'answering', draft: 'An answer' });
    const sync = heldSync(app);
    const first = app.card!;
    const saved = app.save();
    await waitFor(() => expect(app.toast).toBe('saved'));
    expect(app.card!.id).not.toBe(first.id);
    expect(app.cardState).toBe('fresh');
    expect(app.draft).toBe('');
    await sync.answerSync(1);
    expect(await saved).toBe(true);
    expect(app.toast).toBe('synced');
    // The toast goes before the next answer's sync comes back: nothing more is said.
    app.cardState = 'answering';
    app.draft = 'Another';
    const again = app.save();
    await waitFor(() => expect(app.toast).toBe('saved'));
    sync.endHolds();
    await waitFor(() => expect(app.toast).toBe(''));
    await sync.answerSync(2);
    expect(await again).toBe(true);
    expect(app.toast).toBe('');
  });

  it('the toast is a polite status that goes after its hold', async () => {
    const app = await onACard({ cardState: 'answering', draft: 'An answer' });
    const sync = heldSync(app);
    renderApp(app);
    void app.save();
    await waitFor(() => expect(app.toast).toBe('saved'));
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toContain(copy.item('Card states', 'saved'));
    sync.endHolds();
    await waitFor(() => expect(app.toast).toBe(''));
    expect(status.textContent?.trim()).toBe('');
  });
});

describe('the counter', () => {
  const draft = (n: number) => 'a'.repeat(n);

  it('shows nothing below 3,000 code points, the count from 3,000, in bold from 3,900', async () => {
    const app = await onACard({ cardState: 'answering', draft: draft(2999) });
    const { unmount } = render(Card, { app });
    expect(document.getElementById('answer-count')!.textContent).toBe('');
    unmount();
    const atThree = await onACard({ cardState: 'answering', draft: draft(3000) });
    const second = render(Card, { app: atThree });
    const count = document.getElementById('answer-count')!;
    expect(count.textContent).toBe(
      fill(copy.item('Card labels', 'counter'), { n: '3,000', max: '4,000' }),
    );
    expect(count.classList.contains('near')).toBe(false);
    second.unmount();
    const near = await onACard({ cardState: 'answering', draft: draft(3900) });
    render(Card, { app: near });
    expect(document.getElementById('answer-count')!.classList.contains('near')).toBe(true);
  });

  it('counts code points and refuses input past 4,000 without cutting an emoji', async () => {
    const app = await onACard({ cardState: 'answering', draft: draft(3998) });
    render(Card, { app });
    const field = screen.getByRole('textbox') as HTMLTextAreaElement;
    field.value = draft(3998) + '😀😀😀';
    await fireEvent.input(field);
    expect(codePoints(app.draft)).toBe(MAX_ANSWER_CHARS);
    expect(app.draft.endsWith('😀😀')).toBe(true);
    expect(app.draft.length).toBe(3998 + 4);
    expect(document.getElementById('answer-count')!.textContent).toBe(
      fill(copy.item('Card labels', 'counter'), { n: '4,000', max: '4,000' }),
    );
  });
});

describe('set aside', () => {
  it('the button: the toast says "Set aside"; the second time "Set aside for another day", and the card leaves the session', async () => {
    const app = await onACard();
    holdToast(app);
    const user = userEvent.setup();
    render(Card, { app });
    const first = app.card!;
    await user.click(screen.getByRole('button', { name: copy.item('Buttons', 'set aside') }));
    await waitFor(() => expect(app.card!.id).not.toBe(first.id));
    expect(app.toast).toBe('dismissed');
    expect(app.world.chips.map((c) => c.cardId)).toEqual([first.id]);
    while (app.card!.id !== first.id) await app.setAside();
    await user.click(screen.getByRole('button', { name: copy.item('Buttons', 'set aside') }));
    await waitFor(() => expect(app.toast).toBe('deferred'));
    expect(app.live!.deferred.has(first.id)).toBe(true);
    expect(app.live!.plan.queue).not.toContain(first.id);
  });

  it('a swipe of more than 100 pixels sets the card aside; one of 100 brings it back; a drag of 7 pixels does not open the card', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduced-motion'),
    }));
    const app = await onACard();
    render(Card, { app });
    const first = app.card!;
    const drag = (node: Element, from: number, to: number) => {
      for (const [type, x] of [
        ['pointerdown', from],
        ['pointermove', (from + to) / 2],
        ['pointermove', to],
        ['pointerup', to],
      ] as const)
        node.dispatchEvent(
          new PointerEvent(type, { clientX: x, clientY: 100, pointerId: 1, bubbles: true }),
        );
    };
    drag(frontCard(), 200, 100);
    expect(app.card!.id).toBe(first.id);
    drag(frontCard(), 200, 207);
    frontCard().click();
    expect(app.cardState).toBe('fresh');
    drag(frontCard(), 200, 99);
    await waitFor(() => expect(app.card!.id).not.toBe(first.id));
    expect(app.live!.dismissed.has(first.id)).toBe(true);
  });

  it('a half-written answer waits for the card to come round', async () => {
    const app = await onACard({ draft: 'Half' });
    const first = app.card!;
    await app.setAside();
    expect(app.draft).toBe('');
    while (app.card!.id !== first.id) {
      app.draft = 'Done';
      await app.save();
    }
    expect(app.draft).toBe('Half');
  });
});

describe('your world so far', () => {
  it('the pill carries the count and opens the sheet: a modal dialog named by its title, focus on ×, kept inside, closed by Esc with focus back on the pill', async () => {
    const app = await onACard();
    const user = userEvent.setup();
    renderApp(app);
    const pill = screen.getByRole('button', {
      name: fill(copy.item('Your world', 'pill label'), { n: 0 }),
    });
    expect(pill.textContent).toContain(copy.item('Your world', 'title'));
    await user.click(pill);
    const dialog = await screen.findByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByRole('dialog', { name: copy.item('Your world', 'title') })).toBeTruthy();
    const close = screen.getByRole('button', { name: copy.item('Your world', 'close') });
    await waitFor(() => expect(document.activeElement).toBe(close));
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(screen.getByText(copy.item('Your world', 'empty'))).toBeTruthy();
    expect(
      screen.getByText(
        fill(copy.item('Your world', 'summary'), { answered: 0, aside: 0, left: 4 }),
      ),
    ).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(app.worldOpen).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(pill));
  });

  it('× and the scrim close the sheet too', async () => {
    const app = await onACard();
    const user = userEvent.setup();
    renderApp(app);
    app.openWorld();
    await user.click(await screen.findByRole('button', { name: copy.item('Your world', 'close') }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    app.openWorld();
    await screen.findByRole('dialog');
    await user.click(document.querySelector('.scrim')!);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('the sheet shows the words of an answer written here, the question with a quiet line for one written elsewhere, and the set-aside chips', async () => {
    const app = await onACard();
    const [a, b, c] = app.live!.plan.queue;
    const written = answeredEvent(a!, 1);
    const elsewhere = answeredEvent(b!, 2);
    app.history = { sessions: [SESSION], events: [written, elsewhere] };
    app.copies = new Map([[answerKey(SESSION.id, a!), 'Two lines\nof words']]);
    app.live = replaySession(workshop.deck, workshop.config, SESSION, app.history);
    app.card = workshop.deck.cards.find((x) => x.id === c);
    app.cardNo = 3;
    await app.setAside();
    app.worldOpen = true;
    renderApp(app);
    const dialog = await screen.findByRole('dialog');
    const tiles = [...dialog.querySelectorAll('.tile')];
    expect(tiles).toHaveLength(2);
    const card = (id: string) => workshop.deck.cards.find((x) => x.id === id)!;
    expect(tiles[0]!.textContent).toContain(`01 · ${card(a!).area}`);
    expect(tiles[0]!.textContent).toContain(card(a!).text);
    expect(tiles[0]!.querySelector('.a')!.textContent).toBe('Two lines\nof words');
    expect(tiles[1]!.textContent).toContain(card(b!).text);
    expect(tiles[1]!.textContent).toContain(copy.item('Your world', 'written elsewhere'));
    expect(tiles[1]!.textContent).not.toContain('QQQQ');
    expect(tintOfSlot('.tile')).toBe('var(--tint-sun)');
    expect(dialog.querySelector('.chip')!.textContent).toBe(card(c!).text);
    expect(dialog.querySelectorAll('.chip button')).toHaveLength(0);
    expect(
      screen.getByText(
        fill(copy.item('Your world', 'summary'), { answered: 2, aside: 1, left: 2 }),
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: fill(copy.item('Your world', 'pill label'), { n: 2 }) }),
    ).toBeTruthy();
  });
});

describe('the laptop page', () => {
  it('from 600 pixels: the stack in the left column, the world in the right with the tiles and the set-aside row, no pill and no sheet, the progress strip and "n of M answered" in the top bar', async () => {
    const app = await onACard({ wide: true });
    // A laptop: a wide window and a mouse.
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('pointer: fine') || query.includes('min-width'),
    }));
    await app.setAside();
    renderApp(app);
    const page = document.querySelector('.page')!;
    expect(page.querySelector('.col-stack .card.front')).toBeTruthy();
    expect(page.querySelector('.col-stack')!.textContent).toContain(
      copy.item('Card labels', 'click to answer'),
    );
    const world = screen.getByRole('region', { name: copy.item('Your world', 'title') });
    expect(world.classList.contains('col-world')).toBe(true);
    expect(world.textContent).toContain(copy.item('Your world', 'empty laptop'));
    expect(world.querySelector('.chips .chip')).toBeTruthy();
    expect(screen.queryByText(copy.item('Card labels', 'swipe hint'))).toBeTruthy();
    expect(document.querySelector('.pill.world')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    const header = document.querySelector('header')!;
    expect(header.querySelectorAll('.progress .seg')).toHaveLength(4);
    expect(header.querySelector('.progress')!.getAttribute('aria-hidden')).toBe('true');
    expect(header.querySelectorAll('.progress .seg.aside')).toHaveLength(1);
    expect(header.textContent).toContain(
      fill(copy.item('Your world', 'progress'), { n: 0, total: 4 }),
    );
    expect(document.querySelector('.app')!.classList.contains('wide')).toBe(true);
  });

  it('the session end shows inline in place of the stack, with the world beside it', async () => {
    const app = await onACard({ wide: true, screen: 'session-end', card: undefined });
    renderApp(app);
    const page = document.querySelector('.page')!;
    expect(page.querySelector('.col-stack h1')!.textContent).toBe(
      copy.item('Titles', 'session end'),
    );
    expect(page.querySelector('.col-stack .card')).toBeNull();
    expect(screen.getByRole('region', { name: copy.item('Your world', 'title') })).toBeTruthy();
  });
});

describe('the readable copy stays on the device (ADR 0014)', () => {
  it('a saved answer is sealed in the outbox and in the sync request; the words are only in the copies table', async () => {
    const app = await onACard({ cardState: 'answering', draft: 'Owning something from before' });
    const calls = stubRoutes({ [`/api/${SLUG}/sync`]: [SYNCED] });
    const first = app.card!;
    expect(await app.save()).toBe(true);
    const store = app.store as WorkshopStore;
    const events = await store.events.toArray();
    const answered = events.find((e) => e.kind === 'answered')!;
    expect(answered.body!.startsWith('v1.')).toBe(true);
    expect(JSON.stringify(events)).not.toContain('Owning');
    expect(JSON.stringify(await store.history())).not.toContain('Owning');
    const syncs = calls.filter((c) => c.path.endsWith('/sync'));
    expect(syncs.length).toBeGreaterThan(0);
    for (const sync of syncs) expect(JSON.stringify(sync.body)).not.toContain('Owning');
    expect(JSON.stringify(calls)).not.toContain('Owning');
    expect((await store.answers()).map((a) => [a.cardId, a.text])).toEqual([
      [first.id, 'Owning something from before'],
    ]);
    expect(app.world.tiles.map((t) => t.answer)).toEqual(['Owning something from before']);
  });

  it('"delete everything I sent" wipes the copies with everything else', async () => {
    const app = await onACard({ cardState: 'answering', draft: 'Gone soon' });
    stubRoutes({ [`/api/${SLUG}/sync`]: [SYNCED], [`/api/${SLUG}/me`]: [] });
    await app.save();
    expect(app.copies.size).toBe(1);
    app.go = () => {};
    app.askDelete();
    await app.deleteMe();
    expect(app.copies.size).toBe(0);
    expect(app.world.tiles).toEqual([]);
    expect(await new WorkshopStore(SLUG).answers()).toEqual([]);
  });
});

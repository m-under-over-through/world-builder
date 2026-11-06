import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { MAX_ANSWER_CHARS, type Event, type Session } from '@wb/contracts';
import App from '../src/App.svelte';
import Card from '../src/screens/Card.svelte';
import { fill } from '../src/lib/copy.ts';
import { currentCardId, replaySession } from '../src/lib/session.ts';
import { AppState, tintOf } from '../src/lib/state.svelte.ts';
import { answerKey, WorkshopStore } from '../src/lib/store.ts';
import { codePoints } from '../src/lib/text.ts';
import { findWorkshop } from '../src/lib/workshops.ts';
import { freshIndexedDb, stubRoutes, SYNCED } from './helpers.ts';

/**
 * The card screen of the design (design/DESIGN.md; ADR 0015), rendered from a state a test
 * sets up by hand: the stack and its states, the label and the tint, the counter, the swipe,
 * the onboarding card, "Your world so far" as a sheet and as a column, and the laptop page.
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

const frontCard = () =>
  screen.getByRole('button', {
    name: (name) => name.includes(copy.item('Card labels', 'write an answer')),
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

  it('the front card is labelled with its area alone, no number, in the sun tint; the two behind carry the next tints', async () => {
    const app = await onACard();
    render(Card, { app });
    expect(frontCard().querySelector('.label')!.textContent).toBe(app.card!.area);
    expect(frontCard().textContent).not.toMatch(/\d+ of \d+|\b0\d\b/);
    expect(tintOfSlot('.slot-0')).toBe('var(--tint-sun)');
    expect(tintOfSlot('.slot-1')).toBe('var(--tint-mint)');
    expect(tintOfSlot('.slot-2')).toBe('var(--tint-sky)');
    expect(app.backCards.map((b) => b.card.id)).toEqual(app.live!.plan.queue.slice(1, 3));
  });

  it('a card without an area shows no label at all', async () => {
    const app = await onACard();
    const { id, set, text } = app.card!;
    app.card = { id, set, text };
    render(Card, { app });
    expect(frontCard().querySelector('.label')!.textContent).toBe('');
    expect(frontCard().textContent).not.toContain('·');
  });

  it('the affordance is the pen and "Write an answer", on a phone and with a mouse alike', async () => {
    for (const fine of [false, true]) {
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: fine && query.includes('pointer: fine'),
      }));
      const app = await onACard();
      const { unmount } = render(Card, { app });
      const affordance = frontCard().querySelector('.affordance')!;
      expect(affordance.textContent!.trim()).toBe(copy.item('Card labels', 'write an answer'));
      const pen = affordance.querySelector('svg')!;
      expect(pen.getAttribute('width')).toBe('18');
      expect(pen.getAttribute('stroke-width')).toBe('1.75');
      unmount();
    }
  });

  it('a card set aside leaves the round; the cards after it keep their numbers and tints', async () => {
    const app = await onACard();
    const first = app.card!;
    await app.setAside();
    expect(app.cardNo).toBe(2);
    for (let i = 0; i < 2; i++) await app.setAside();
    expect(app.cardNo).toBe(4);
    expect(app.live!.plan.queue).not.toContain(first.id);
    expect(app.live!.queueAsPlanned).toHaveLength(4);
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

  it('Save: no toast and no status line; the next card is the front at once and the answer syncs in the background', async () => {
    const app = await onACard({ cardState: 'answering', draft: 'An answer' });
    const calls = stubRoutes({ [`/api/${SLUG}/sync`]: [SYNCED] });
    renderApp(app);
    const first = app.card!;
    expect(await app.save()).toBe(true);
    expect(app.card!.id).not.toBe(first.id);
    expect(app.cardState).toBe('fresh');
    expect(app.draft).toBe('');
    expect(calls.some((c) => c.path.endsWith('/sync'))).toBe(true);
    expect(app).not.toHaveProperty('toast');
    expect(document.querySelector('[role="status"], .toast, .toast-slot')).toBeNull();
  });
});

describe('what a screen reader hears', () => {
  it('a hidden line announces the save and the set-aside; the same words say again the next time', async () => {
    const app = await onACard({ cardState: 'answering', draft: 'An answer' });
    stubRoutes({ [`/api/${SLUG}/sync`]: [SYNCED] });
    renderApp(app);
    const live = () => document.querySelector('[aria-live="polite"]')!;
    expect(live().textContent).toBe('');
    expect(await app.save()).toBe(true);
    await waitFor(() => expect(live().textContent).toBe(copy.item('Announcements', 'saved')));
    const first = app.announcement.n;
    await app.setAside();
    await waitFor(() => expect(live().textContent).toBe(copy.item('Announcements', 'set aside')));
    expect(app.announcement.n).toBe(first + 1);
    expect(document.querySelector('[role="status"], .toast')).toBeNull();
  });
});

describe('the end of the deck', () => {
  it('shows the thank-you card, and nothing to tap, once every card is answered or out', async () => {
    const app = await onACard();
    app.card = undefined;
    app.live = { ...app.live!, deckDone: true };
    render(Card, { app });
    expect(screen.getByText(copy.text('Thank you card'))).toBeTruthy();
    expect(document.querySelector('.card.thanks')).toBeTruthy();
    expect(screen.queryByRole('button', { name: copy.item('Buttons', 'set aside') })).toBeNull();
  });

  it('shows no thank-you card while the deck is not done', async () => {
    const app = await onACard();
    app.card = undefined;
    app.live = { ...app.live!, deckDone: false };
    render(Card, { app });
    expect(screen.queryByText(copy.text('Thank you card'))).toBeNull();
  });
});

describe('the onboarding card', () => {
  it('is the front of the stack on the first open; "Got it" sends it away and the first card comes forward, recorded shown only then', async () => {
    const app = await onACard({ demoFront: true });
    await app.store!.unset('demoSeen');
    const user = userEvent.setup();
    renderApp(app);
    const first = app.card!;
    expect(document.querySelector('.slot-0 .card.demo')).toBeTruthy();
    expect(screen.queryByRole('button', { name: (n) => n.includes(first.text) })).toBeNull();
    await user.click(screen.getByRole('button', { name: copy.item('Buttons', 'got it') }));
    await waitFor(() => expect(app.demoFront).toBe(false));
    expect(document.querySelector('.card.demo')).toBeNull();
    expect(frontCard().textContent).toContain(first.text);
    await waitFor(() => expect(document.activeElement).toBe(frontCard()));
    await waitFor(() => expect(app.live!.shown.has(first.id)).toBe(true));
    expect(document.querySelector('[role="status"]')).toBeNull();
  });

  it('a swipe sends it away as "Got it" does', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduced-motion'),
    }));
    const app = await onACard({ demoFront: true });
    render(Card, { app });
    const demo = document.querySelector('.card.demo')!;
    for (const [type, x] of [
      ['pointerdown', 200],
      ['pointermove', 150],
      ['pointermove', 60],
      ['pointerup', 60],
    ] as const)
      demo.dispatchEvent(
        new PointerEvent(type, { clientX: x, clientY: 100, pointerId: 1, bubbles: true }),
      );
    await waitFor(() => expect(app.demoFront).toBe(false));
    expect(app.live!.dismissed.size).toBe(0);
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
  it('the button: no toast and no status line; the card is set aside and listed under "Set aside", even once it is out of the queue', async () => {
    const app = await onACard();
    const user = userEvent.setup();
    renderApp(app);
    const first = app.card!;
    await user.click(screen.getByRole('button', { name: copy.item('Buttons', 'set aside') }));
    await waitFor(() => expect(app.card!.id).not.toBe(first.id));
    expect(app.live!.dismissed.has(first.id)).toBe(true);
    expect(app.world.aside.map((c) => c.cardId)).toEqual([first.id]);
    expect(document.querySelector('[role="status"]')).toBeNull();
    // The list is the round's record of what was set aside, not a reading of the queue: a card
    // the engine takes out of the queue stays listed (fix 19 moves a card set aside to a later round).
    app.live = {
      ...app.live!,
      plan: { ...app.live!.plan, queue: app.live!.plan.queue.filter((id) => id !== first.id) },
    };
    expect(app.world.aside.map((c) => c.cardId)).toEqual([first.id]);
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
      screen.getByText(fill(copy.item('Your world', 'summary'), { answered: 0, aside: 0 })),
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

  it('the sheet shows the words of an answer written here, the question with a quiet line for one written elsewhere, and the card set aside as a white tile after them', async () => {
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
    const tiles = [...dialog.querySelectorAll('.world-section.answered .tile')];
    expect(tiles).toHaveLength(2);
    const card = (id: string) => workshop.deck.cards.find((x) => x.id === id)!;
    expect(tiles[0]!.querySelector('.label')!.textContent).toBe(card(a!).area);
    expect(tiles[0]!.textContent).toContain(card(a!).text);
    expect(tiles[0]!.querySelector('.a')!.textContent).toBe('Two lines\nof words');
    expect(tiles[1]!.textContent).toContain(card(b!).text);
    expect(tiles[1]!.textContent).toContain(copy.item('Your world', 'written elsewhere'));
    expect(tiles[1]!.textContent).not.toContain('QQQQ');
    expect(tintOfSlot('.tile')).toBe('var(--tint-sun)');
    // The card set aside: a tile of the same kind, white, its area and its question, no answer, no button.
    const aside = dialog.querySelector('.world-section.aside')!;
    expect(aside.querySelector('.section-label')!.textContent).toBe(
      copy.item('Your world', 'set aside'),
    );
    const asideTile = aside.querySelector('li.tile.aside')!;
    expect(asideTile.querySelector('.label')!.textContent).toBe(card(c!).area);
    expect(asideTile.querySelector('.q')!.textContent).toBe(card(c!).text);
    expect(asideTile.querySelector('.a')).toBeNull();
    expect(asideTile.getAttribute('style') ?? '').not.toContain('--tint');
    expect(aside.querySelectorAll('button')).toHaveLength(0);
    expect(dialog.querySelector('.chip, .chips')).toBeNull();
    // After the answers, as in the laptop's column.
    expect(
      dialog.querySelector('.world-section.answered')!.compareDocumentPosition(aside) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.getByText(fill(copy.item('Your world', 'summary'), { answered: 2, aside: 1 })),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: fill(copy.item('Your world', 'pill label'), { n: 2 }) }),
    ).toBeTruthy();
  });
});

describe('the laptop page', () => {
  it('from 600 pixels: the stack in the left column, the world in the right with the empty notice as one tile-sized cell and the set-aside tile, no pill and no sheet, and in the top bar the count of answers so far instead of a strip', async () => {
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
      copy.item('Card labels', 'write an answer'),
    );
    const world = screen.getByRole('region', { name: copy.item('Your world', 'title') });
    expect(world.classList.contains('col-world')).toBe(true);
    // The empty notice sits in the grid as one cell, where the first tile will land.
    const empty = world.querySelector('.tiles > .world-empty')!;
    expect(empty.textContent).toBe(copy.item('Your world', 'empty laptop'));
    expect(world.querySelector('.world-section.aside .tile.aside')).toBeTruthy();
    expect(screen.queryByText(copy.item('Card labels', 'swipe hint'))).toBeTruthy();
    expect(document.querySelector('.pill.world')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    const header = document.querySelector('header')!;
    expect(header.querySelector('.progress, .seg')).toBeNull();
    const count = header.querySelector('.answered-so-far')!;
    expect(count.querySelector('.figure')!.textContent).toBe('0');
    expect(count.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
    expect(count.textContent!.replace(/\s+/g, ' ').trim()).toBe(
      fill(copy.item('Your world', 'answered so far'), { n: 0 }),
    );
    expect(document.querySelector('.app')!.classList.contains('wide')).toBe(true);
  });

  it("the left column always holds the stack: when a round's queue is done, the next round's first card is the front", async () => {
    const app = await onACard({ wide: true });
    renderApp(app);
    const roundOne = app.live!.session.id;
    for (let i = 0; i < 4; i++) {
      app.draft = `Answer ${i}`;
      expect(await app.save()).toBe(true);
    }
    expect(app.sessionNo).toBe(2);
    expect(app.live!.session.id).not.toBe(roundOne);
    await waitFor(() => expect(frontCard().textContent).toContain(app.card!.text));
    const page = document.querySelector('.page')!;
    expect(page.querySelector('.col-stack .card.front')).toBeTruthy();
    expect(page.querySelector('.col-stack h1')).toBeNull();
    const world = screen.getByRole('region', { name: copy.item('Your world', 'title') });
    expect(world.querySelectorAll('.tile')).toHaveLength(4);
    // The count in the top bar is the answers so far, across rounds, not this round's.
    await waitFor(() =>
      expect(document.querySelector('.answered-so-far .figure')!.textContent).toBe('4'),
    );
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

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deckSchema, workshopConfigSchema, type Card, type Deck } from '@wb/contracts';
import { planSession, type SessionPlanInput } from '../src/index.ts';

/** A deck of numbered cards: warmup-1 .. warmup-W and checkpoint-1 .. checkpoint-C, checked against the schema. */
function deckOf(warmups: number, checkpoints: number): Deck {
  const cards: Card[] = [];
  for (let i = 1; i <= warmups; i++) {
    cards.push({ id: `warmup-${i}`, set: 'warmup', text: `Warm-up ${i}?` });
  }
  for (let i = 1; i <= checkpoints; i++) {
    cards.push({ id: `checkpoint-${i}`, set: 'checkpoint', text: `Checkpoint ${i}?` });
  }
  return deckSchema.parse({ version: '0.1', cards });
}

const sixAndFour = deckOf(6, 4);

/** A session over the six-and-four deck with counts 3 and 1 and no history, unless overridden. */
function plan(overrides: Partial<SessionPlanInput> = {}) {
  return planSession({
    deck: sixAndFour,
    warmupsPerSession: 3,
    checkpointsPerSession: 1,
    seed: 'seed',
    answeredIds: [],
    deferredIds: [],
    ...overrides,
  });
}

const setsOf = (deck: Deck, queue: readonly string[]) =>
  queue.map((id) => deck.cards.find((card) => card.id === id)?.set);

const distinct = (queue: readonly string[]) => new Set(queue).size === queue.length;

describe('planSession: the cards of a session', () => {
  it('the same seed, deck and history give the same order every time', () => {
    const answered = ['warmup-1', 'checkpoint-2'];
    const first = plan({ seed: '0123456789abcdef', answeredIds: answered });
    const second = plan({ seed: '0123456789abcdef', answeredIds: new Set(answered) });
    expect(second.queue).toEqual(first.queue);
    expect(plan({ seed: '0123456789abcdef', answeredIds: answered }).queue).toEqual(first.queue);
  });

  it('different seeds give different orders', () => {
    const deck = deckOf(12, 2);
    const a = plan({ deck, warmupsPerSession: 12, seed: 'first' });
    const b = plan({ deck, warmupsPerSession: 12, seed: 'second' });
    expect(a.queue).not.toEqual(b.queue);
    const orders = new Set<string>();
    for (let s = 0; s < 30; s++) {
      orders.add(plan({ deck, warmupsPerSession: 12, seed: `seed-${s}` }).queue.join(','));
    }
    expect(orders.size).toBeGreaterThan(27);
  });

  it('warm-ups come before checkpoints', () => {
    expect(setsOf(sixAndFour, plan().queue)).toEqual(['warmup', 'warmup', 'warmup', 'checkpoint']);
  });

  it('the counts are respected: W warm-ups then C checkpoints', () => {
    const { queue } = plan({ warmupsPerSession: 2, checkpointsPerSession: 2 });
    expect(setsOf(sixAndFour, queue)).toEqual(['warmup', 'warmup', 'checkpoint', 'checkpoint']);
  });

  it('an empty history, the first session, gives W warm-ups and C checkpoints with no repeat', () => {
    const { queue } = plan();
    expect(queue).toHaveLength(4);
    expect(distinct(queue)).toBe(true);
  });

  it('cards never answered are preferred over answered ones', () => {
    const answered = ['warmup-1', 'warmup-2', 'warmup-3', 'checkpoint-1', 'checkpoint-2'];
    const { queue } = plan({ answeredIds: answered });
    expect([...queue.slice(0, 3)].sort()).toEqual(['warmup-4', 'warmup-5', 'warmup-6']);
    expect(['checkpoint-3', 'checkpoint-4']).toContain(queue[3]);
  });

  it('an answered card comes back only when the set has no unanswered card left', () => {
    const answered = ['warmup-1', 'warmup-2', 'warmup-3', 'warmup-4', 'warmup-5'];
    const { queue } = plan({ answeredIds: answered });
    expect(queue[0]).toBe('warmup-6');
    expect(answered).toContain(queue[1]);
    expect(answered).toContain(queue[2]);
    expect(distinct(queue)).toBe(true);
  });

  it('when every card of a set is answered, the session still shows W of them', () => {
    const everything = sixAndFour.cards.map((card) => card.id);
    const { queue } = plan({ answeredIds: everything });
    expect(setsOf(sixAndFour, queue)).toEqual(['warmup', 'warmup', 'warmup', 'checkpoint']);
    expect(distinct(queue)).toBe(true);
  });

  it('a deferred card is shown first next session', () => {
    const { queue } = plan({ deferredIds: ['warmup-5'] });
    expect(queue[0]).toBe('warmup-5');
  });

  it('deferred cards keep the order they were deferred in, before anything fresh', () => {
    const { queue } = plan({ deferredIds: ['warmup-5', 'checkpoint-3', 'warmup-2'] });
    expect(queue.slice(0, 3)).toEqual(['warmup-5', 'checkpoint-3', 'warmup-2']);
  });

  it('a deferred warm-up takes one of the W warm-up places', () => {
    const { queue } = plan({ deferredIds: ['warmup-5'] });
    expect(queue).toHaveLength(4);
    expect(setsOf(sixAndFour, queue)).toEqual(['warmup', 'warmup', 'warmup', 'checkpoint']);
    expect(distinct(queue)).toBe(true);
  });

  it('a deferred checkpoint takes the C checkpoint place and comes before the warm-ups', () => {
    const { queue } = plan({ deferredIds: ['checkpoint-3'] });
    expect(queue).toHaveLength(4);
    expect(setsOf(sixAndFour, queue)).toEqual(['checkpoint', 'warmup', 'warmup', 'warmup']);
    expect(queue[0]).toBe('checkpoint-3');
  });

  it('more deferred cards than the count are all shown, and nothing fresh of that set is added', () => {
    const deferred = ['warmup-1', 'warmup-2', 'warmup-3', 'warmup-4'];
    const { queue } = plan({ deferredIds: deferred });
    expect(queue.slice(0, 4)).toEqual(deferred);
    expect(setsOf(sixAndFour, queue)).toEqual([
      'warmup',
      'warmup',
      'warmup',
      'warmup',
      'checkpoint',
    ]);
  });

  it('a deferred card that is no longer in the deck is skipped', () => {
    expect(plan({ deferredIds: ['gone-card'] }).queue).toEqual(plan().queue);
  });

  it('a deferred card listed twice is shown once', () => {
    const { queue } = plan({ deferredIds: ['warmup-5', 'warmup-5'] });
    expect(queue.filter((id) => id === 'warmup-5')).toHaveLength(1);
    expect(queue).toHaveLength(4);
  });

  it('a deferred card that was answered in an earlier session is still shown first, once', () => {
    // Answered in session 1, back again once the set ran out, deferred then: it is owed a showing.
    const { queue } = plan({ answeredIds: ['warmup-5'], deferredIds: ['warmup-5'] });
    expect(queue[0]).toBe('warmup-5');
    expect(distinct(queue)).toBe(true);
  });

  it('a deck with fewer cards than the counts gives what it has, never a repeat', () => {
    const small = deckOf(2, 1);
    const { queue } = plan({ deck: small, warmupsPerSession: 3, checkpointsPerSession: 2 });
    expect([...queue].sort()).toEqual(['checkpoint-1', 'warmup-1', 'warmup-2']);
  });

  it('a count of zero shows none of that set', () => {
    expect(setsOf(sixAndFour, plan({ checkpointsPerSession: 0 }).queue)).toEqual([
      'warmup',
      'warmup',
      'warmup',
    ]);
    expect(setsOf(sixAndFour, plan({ warmupsPerSession: 0 }).queue)).toEqual(['checkpoint']);
  });

  it('a count that is not a whole number never throws: it is read towards zero, never below', () => {
    expect(plan({ warmupsPerSession: 2.7 }).queue).toHaveLength(3);
    expect(plan({ warmupsPerSession: -1 }).queue).toHaveLength(1);
    expect(plan({ warmupsPerSession: Number.NaN }).queue).toHaveLength(1);
  });

  it('the order of the cards in the deck file does not change the plan', () => {
    const reversed: Deck = { ...sixAndFour, cards: [...sixAndFour.cards].reverse() };
    expect(plan({ deck: reversed, seed: 'any' }).queue).toEqual(plan({ seed: 'any' }).queue);
  });

  it('a card is never shown twice in one session, whatever the seed and history', () => {
    const histories = [
      { answeredIds: [], deferredIds: [] },
      { answeredIds: ['warmup-1', 'warmup-2', 'checkpoint-1'], deferredIds: ['warmup-2'] },
      { answeredIds: sixAndFour.cards.map((c) => c.id), deferredIds: ['checkpoint-4'] },
    ];
    for (let s = 0; s < 40; s++) {
      for (const history of histories) {
        const { queue } = plan({ seed: `seed-${s}`, ...history });
        expect(distinct(queue)).toBe(true);
      }
    }
  });

  it('the input is not changed', () => {
    const deck = deckOf(6, 4);
    const before = JSON.stringify(deck);
    const answered = new Set(['warmup-1']);
    const deferred = ['warmup-2'];
    plan({ deck, answeredIds: answered, deferredIds: deferred });
    expect(JSON.stringify(deck)).toBe(before);
    expect([...answered]).toEqual(['warmup-1']);
    expect(deferred).toEqual(['warmup-2']);
  });

  it('the real workshop deck plans a session of W warm-ups then C checkpoints', () => {
    const folder = new URL('../../../workshops/rural-manufacturing/', import.meta.url);
    const deck = deckSchema.parse(JSON.parse(readFileSync(new URL('deck.json', folder), 'utf8')));
    const config = workshopConfigSchema.parse(
      JSON.parse(readFileSync(new URL('workshop.json', folder), 'utf8')),
    );
    const { queue } = planSession({
      deck,
      warmupsPerSession: config.warmupsPerSession,
      checkpointsPerSession: config.checkpointsPerSession,
      seed: '0123456789abcdef',
      answeredIds: [],
      deferredIds: [],
    });
    const warmups = deck.cards.filter((card) => card.set === 'warmup').length;
    const checkpoints = deck.cards.filter((card) => card.set === 'checkpoint').length;
    const w = Math.min(config.warmupsPerSession, warmups);
    const c = Math.min(config.checkpointsPerSession, checkpoints);
    expect(setsOf(deck, queue)).toEqual([
      ...new Array<string>(w).fill('warmup'),
      ...new Array<string>(c).fill('checkpoint'),
    ]);
    expect(distinct(queue)).toBe(true);
  });

  it('the worked example: six cards, counts 3 and 1, seed "example"', () => {
    // The example in the pull request description and the build log. Pinned so the written
    // example stays true; if the generator ever changes, this is the test that says so in words.
    const deck = deckSchema.parse({
      version: '0.1',
      cards: [
        { id: 'tuesday-night', set: 'warmup', text: 'What is a typical Tuesday night?' },
        { id: 'on-tv', set: 'warmup', text: 'What is on TV?' },
        { id: 'embarrassing', set: 'warmup', text: 'What is embarrassing?' },
        { id: 'cool', set: 'warmup', text: 'What is cool?' },
        { id: 'immigrants', set: 'checkpoint', text: 'Are there immigrants? What do they do?' },
        { id: 'rich-poor', set: 'checkpoint', text: 'Who gets richer, or poorer? How?' },
      ],
    });
    const { queue } = planSession({
      deck,
      warmupsPerSession: 3,
      checkpointsPerSession: 1,
      seed: 'example',
      answeredIds: [],
      deferredIds: [],
    });
    expect(queue).toEqual(['cool', 'on-tv', 'embarrassing', 'immigrants']);
  });
});

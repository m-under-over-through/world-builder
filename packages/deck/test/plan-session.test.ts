import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deckSchema, workshopConfigSchema, type Card, type Deck } from '@wb/contracts';
import { isDeckDone, planSession, type SessionPlanInput } from '../src/index.ts';

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

/** A round over the six-and-four deck with counts 3 and 1 and no history, unless overridden. */
function plan(overrides: Partial<SessionPlanInput> = {}) {
  return planSession({
    deck: sixAndFour,
    warmupsPerSession: 3,
    checkpointsPerSession: 1,
    seed: 'seed',
    answeredIds: [],
    deferredIds: [],
    dismissedIds: [],
    ...overrides,
  });
}

const setsOf = (deck: Deck, queue: readonly string[]) =>
  queue.map((id) => deck.cards.find((card) => card.id === id)?.set);

const distinct = (queue: readonly string[]) => new Set(queue).size === queue.length;

/** The places of a queue that hold a card coming back, from 0. */
const placesOf = (queue: readonly string[], back: Iterable<string>) => {
  const set = new Set(back);
  return queue.flatMap((id, i) => (set.has(id) ? [i] : []));
};

/** True when no two places in the list are next to each other. */
const apart = (places: readonly number[]) =>
  places.every((p, i) => i === 0 || p - places[i - 1]! > 1);

describe('planSession: a round', () => {
  it('a round holds 3 warm-ups then 1 checkpoint, drawn from the seed', () => {
    expect(setsOf(sixAndFour, plan().queue)).toEqual(['warmup', 'warmup', 'warmup', 'checkpoint']);
    const orders = new Set<string>();
    for (let s = 0; s < 30; s++) orders.add(plan({ seed: `seed-${s}` }).queue.join(','));
    expect(orders.size).toBeGreaterThan(20);
  });

  it('the same seed and the same history give the same queue, whatever the order of the lists', () => {
    const history = {
      seed: '0123456789abcdef',
      answeredIds: ['warmup-1', 'checkpoint-2'],
      deferredIds: ['warmup-2'],
      dismissedIds: ['warmup-3', 'checkpoint-4'],
    };
    const first = plan(history);
    expect(plan(history)).toEqual(first);
    expect(
      plan({
        ...history,
        answeredIds: new Set([...history.answeredIds].reverse()),
        dismissedIds: [...history.dismissedIds].reverse(),
      }),
    ).toEqual(first);
  });

  it('different seeds give different orders', () => {
    const deck = deckOf(12, 2);
    const a = plan({ deck, warmupsPerSession: 12, seed: 'first' });
    const b = plan({ deck, warmupsPerSession: 12, seed: 'second' });
    expect(a.queue).not.toEqual(b.queue);
  });

  it('the counts are respected: W warm-ups then C checkpoints', () => {
    const { queue } = plan({ warmupsPerSession: 2, checkpointsPerSession: 2 });
    expect(setsOf(sixAndFour, queue)).toEqual(['warmup', 'warmup', 'checkpoint', 'checkpoint']);
  });

  it('a round with no history has W warm-ups and C checkpoints, no repeat, nothing set aside before', () => {
    const { queue, setAsideBefore } = plan();
    expect(queue).toHaveLength(4);
    expect(distinct(queue)).toBe(true);
    expect(setAsideBefore).toEqual([]);
  });
});

describe('planSession: what never comes round again', () => {
  it('an answered card never comes round again, whatever the seed', () => {
    const answered = ['warmup-1', 'warmup-2', 'warmup-3', 'warmup-4', 'warmup-5', 'checkpoint-1'];
    for (let s = 0; s < 40; s++) {
      const { queue } = plan({ seed: `seed-${s}`, answeredIds: answered });
      for (const id of answered) expect(queue).not.toContain(id);
    }
  });

  it('with every warm-up answered, a round shows no warm-up at all: the old fallback is gone', () => {
    const warmups = sixAndFour.cards.filter((c) => c.set === 'warmup').map((c) => c.id);
    expect(setsOf(sixAndFour, plan({ answeredIds: warmups }).queue)).toEqual(['checkpoint']);
  });

  it('a card set aside twice never comes round again, whatever the seed', () => {
    for (let s = 0; s < 40; s++) {
      const { queue } = plan({ seed: `seed-${s}`, deferredIds: ['warmup-5', 'checkpoint-3'] });
      expect(queue).not.toContain('warmup-5');
      expect(queue).not.toContain('checkpoint-3');
    }
  });

  it('a card both set aside once and answered since is not brought back', () => {
    const { queue, setAsideBefore } = plan({
      answeredIds: ['warmup-5'],
      dismissedIds: ['warmup-5'],
    });
    expect(queue).not.toContain('warmup-5');
    expect(setAsideBefore).toEqual([]);
  });
});

describe('planSession: a card set aside once comes back later', () => {
  it('it comes back in the next round when there is room, never first, and the plan names it', () => {
    for (let s = 0; s < 40; s++) {
      const { queue, setAsideBefore } = plan({ seed: `seed-${s}`, dismissedIds: ['warmup-5'] });
      expect(queue).toContain('warmup-5');
      expect(queue.indexOf('warmup-5')).toBeGreaterThan(0);
      expect(setAsideBefore).toEqual(['warmup-5']);
      expect(setsOf(sixAndFour, queue)).toEqual(['warmup', 'warmup', 'warmup', 'checkpoint']);
    }
  });

  it('its place in the round is drawn from the seed: the second or the third', () => {
    const places = new Set<number>();
    for (let s = 0; s < 40; s++) {
      places.add(plan({ seed: `seed-${s}`, dismissedIds: ['warmup-5'] }).queue.indexOf('warmup-5'));
    }
    expect([...places].sort()).toEqual([1, 2]);
  });

  it('a warm-up and a checkpoint coming back both return in one round, apart: the warm-up second, the checkpoint last', () => {
    for (let s = 0; s < 40; s++) {
      const { queue } = plan({ seed: `seed-${s}`, dismissedIds: ['checkpoint-2', 'warmup-5'] });
      expect(queue[1]).toBe('warmup-5');
      expect(queue[3]).toBe('checkpoint-2');
    }
  });

  it('more cards coming back than the round has room for: the seed picks which, the others wait', () => {
    const waiting = ['warmup-4', 'warmup-5', 'warmup-6'];
    const picked = new Set<string>();
    for (let s = 0; s < 40; s++) {
      const { queue, setAsideBefore } = plan({ seed: `seed-${s}`, dismissedIds: waiting });
      // With 3 warm-up places a card coming back needs a fresh one before it: one fits.
      expect(setAsideBefore).toHaveLength(1);
      expect(placesOf(queue, waiting)).toHaveLength(1);
      picked.add(setAsideBefore[0]!);
    }
    expect([...picked].sort()).toEqual(waiting);
  });

  it('two cards coming back are never next to each other while there are enough fresh cards', () => {
    const deck = deckOf(10, 4);
    const back = ['warmup-1', 'warmup-2', 'warmup-3', 'checkpoint-1'];
    for (let s = 0; s < 60; s++) {
      for (const counts of [
        { warmupsPerSession: 3, checkpointsPerSession: 1 },
        { warmupsPerSession: 5, checkpointsPerSession: 2 },
      ]) {
        const { queue } = plan({ deck, seed: `seed-${s}`, dismissedIds: back, ...counts });
        const places = placesOf(queue, back);
        expect(places.length).toBeGreaterThan(0);
        expect(places[0]).toBeGreaterThan(0);
        expect(apart(places)).toBe(true);
      }
    }
  });

  it('with one fresh warm-up left and two coming back, they stand on either side of it: apart wins over "never first"', () => {
    // The choice for a set that has run short (ADR 0020): as far apart as the fresh cards allow,
    // even when one of them is then first. The other way round would put the two side by side.
    const answered = ['warmup-1', 'warmup-2', 'warmup-3'];
    const back = ['warmup-4', 'warmup-5'];
    for (let s = 0; s < 20; s++) {
      const { queue } = plan({ seed: `seed-${s}`, answeredIds: answered, dismissedIds: back });
      expect(queue[1]).toBe('warmup-6');
      expect(placesOf(queue, back)).toEqual([0, 2]);
      expect(setsOf(sixAndFour, queue)).toEqual(['warmup', 'warmup', 'warmup', 'checkpoint']);
    }
  });

  it('with no fresh warm-up left, the cards coming back fill the warm-up places side by side', () => {
    const answered = ['warmup-1', 'warmup-2', 'warmup-3', 'warmup-4'];
    const { queue } = plan({ answeredIds: answered, dismissedIds: ['warmup-5', 'warmup-6'] });
    expect(placesOf(queue, ['warmup-5', 'warmup-6'])).toEqual([0, 1]);
    expect(setsOf(sixAndFour, queue)).toEqual(['warmup', 'warmup', 'checkpoint']);
  });

  it('a card coming back that is no longer in the deck is skipped', () => {
    expect(plan({ dismissedIds: ['gone-card'] })).toEqual(plan());
  });
});

describe('planSession and isDeckDone: the end of the deck', () => {
  it('with every card answered or out for good, the deck is done and the queue is empty', () => {
    const all = sixAndFour.cards.map((c) => c.id);
    const answered = all.slice(0, 7);
    const deferred = all.slice(7);
    expect(isDeckDone(sixAndFour, answered, deferred)).toBe(true);
    const { queue, setAsideBefore } = plan({ answeredIds: answered, deferredIds: deferred });
    expect(queue).toEqual([]);
    expect(setAsideBefore).toEqual([]);
  });

  it('a card set aside once keeps the deck open, and the next round brings it back', () => {
    const all = sixAndFour.cards.map((c) => c.id);
    const answered = all.filter((id) => id !== 'warmup-6');
    expect(isDeckDone(sixAndFour, answered, [])).toBe(false);
    expect(plan({ answeredIds: answered, dismissedIds: ['warmup-6'] }).queue).toEqual(['warmup-6']);
  });

  it('ids that are not in the deck do not count towards the end', () => {
    expect(isDeckDone(sixAndFour, ['gone-card'], ['other-card'])).toBe(false);
    expect(isDeckDone(deckOf(1, 1), ['warmup-1', 'gone-card'], ['checkpoint-1'])).toBe(true);
  });
});

describe('planSession: the rules hold round after round', () => {
  /**
   * A participant played to the end of the deck: each card is answered or set aside, by a second
   * seeded stream so the run is the same every time. Checks every round against the rules.
   */
  function playToTheEnd(deck: Deck, run: number, w = 3, c = 1) {
    let draws = run * 7919 + 1;
    const coin = () => {
      draws = (draws * 48271) % 2147483647;
      return draws % 10 < 4;
    };
    const answered = new Set<string>();
    const deferred = new Set<string>();
    const pending = new Set<string>();
    const neighbours = new Map<string, string[]>();
    const rounds: string[][] = [];
    for (let round = 1; round <= 100 && !isDeckDone(deck, answered, deferred); round++) {
      const { queue, setAsideBefore } = planSession({
        deck,
        warmupsPerSession: w,
        checkpointsPerSession: c,
        seed: `run-${run}-round-${round}`,
        answeredIds: answered,
        deferredIds: deferred,
        dismissedIds: pending,
      });
      rounds.push([...queue]);
      expect(distinct(queue)).toBe(true);
      expect(queue.length).toBeGreaterThan(0);
      for (const id of queue) expect(answered.has(id) || deferred.has(id)).toBe(false);
      expect([...setAsideBefore].sort()).toEqual(queue.filter((id) => pending.has(id)).sort());
      // While each set has a fresh card for every place, the rules hold to the letter.
      const fresh = (set: string) =>
        deck.cards.filter(
          (card) =>
            card.set === set &&
            !answered.has(card.id) &&
            !deferred.has(card.id) &&
            !pending.has(card.id),
        ).length;
      if (fresh('warmup') >= w && fresh('checkpoint') >= c) {
        const places = placesOf(queue, setAsideBefore);
        expect(places[0] ?? 1).toBeGreaterThan(0);
        expect(apart(places)).toBe(true);
        for (const id of setAsideBefore) {
          const i = queue.indexOf(id);
          for (const before of neighbours.get(id) ?? []) {
            expect([queue[i - 1], queue[i + 1]]).not.toContain(before);
          }
        }
      }
      for (const [i, id] of queue.entries()) {
        if (coin()) {
          if (setAsideBefore.includes(id)) {
            deferred.add(id);
            pending.delete(id);
          } else {
            pending.add(id);
            neighbours.set(
              id,
              [queue[i - 1], queue[i + 1]].filter((n): n is string => n !== undefined),
            );
          }
        } else {
          answered.add(id);
          pending.delete(id);
        }
      }
    }
    return { rounds, answered, deferred, pending };
  }

  it('across a whole run, no card returns once answered or out, and the deck ends', () => {
    for (let run = 0; run < 25; run++) {
      const { answered, deferred, pending } = playToTheEnd(sixAndFour, run);
      expect(pending.size).toBe(0);
      expect(answered.size + deferred.size).toBe(sixAndFour.cards.length);
    }
  });

  it('the real workshop deck plays to its end under the rules, at counts 3 and 1 and at 5 and 2', () => {
    const folder = new URL('../../../workshops/rural-manufacturing/', import.meta.url);
    const deck = deckSchema.parse(JSON.parse(readFileSync(new URL('deck.json', folder), 'utf8')));
    for (let run = 0; run < 10; run++) {
      for (const [w, c] of [
        [3, 1],
        [5, 2],
      ] as const) {
        const { rounds } = playToTheEnd(deck, run, w, c);
        expect(rounds.length).toBeGreaterThanOrEqual(deck.cards.length / (w + c));
      }
    }
  });
});

describe('planSession: inputs it must survive', () => {
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

  it('a count of zero for checkpoints does not hold back a warm-up coming back', () => {
    const { queue } = plan({
      checkpointsPerSession: 0,
      dismissedIds: ['warmup-5', 'checkpoint-1'],
    });
    expect(queue).toContain('warmup-5');
    expect(queue).not.toContain('checkpoint-1');
  });

  it('a count that is not a whole number never throws: it is read towards zero, never below', () => {
    expect(plan({ warmupsPerSession: 2.7 }).queue).toHaveLength(3);
    expect(plan({ warmupsPerSession: -1 }).queue).toHaveLength(1);
    expect(plan({ warmupsPerSession: Number.NaN }).queue).toHaveLength(1);
  });

  it('the order of the cards in the deck file does not change the plan', () => {
    const reversed: Deck = { ...sixAndFour, cards: [...sixAndFour.cards].reverse() };
    const history = { seed: 'any', dismissedIds: ['warmup-2', 'checkpoint-1'] };
    expect(plan({ deck: reversed, ...history })).toEqual(plan(history));
  });

  it('a card is never shown twice in one round, whatever the seed and history', () => {
    const histories = [
      { answeredIds: [], deferredIds: [], dismissedIds: [] },
      {
        answeredIds: ['warmup-1', 'checkpoint-1'],
        deferredIds: ['warmup-2'],
        dismissedIds: ['warmup-3', 'warmup-3', 'checkpoint-2'],
      },
      { answeredIds: [], deferredIds: [], dismissedIds: sixAndFour.cards.map((c) => c.id) },
    ];
    for (let s = 0; s < 40; s++) {
      for (const history of histories) {
        expect(distinct(plan({ seed: `seed-${s}`, ...history }).queue)).toBe(true);
      }
    }
  });

  it('the input is not changed', () => {
    const deck = deckOf(6, 4);
    const before = JSON.stringify(deck);
    const answered = new Set(['warmup-1']);
    const deferred = ['warmup-2'];
    const dismissed = ['warmup-3'];
    plan({ deck, answeredIds: answered, deferredIds: deferred, dismissedIds: dismissed });
    expect(JSON.stringify(deck)).toBe(before);
    expect([...answered]).toEqual(['warmup-1']);
    expect(deferred).toEqual(['warmup-2']);
    expect(dismissed).toEqual(['warmup-3']);
  });

  it('the real workshop deck plans a round of W warm-ups then C checkpoints', () => {
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
      dismissedIds: [],
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
});

describe('the worked example', () => {
  it('six cards, counts 3 and 1, seed "example"; then "cool" set aside once comes back second in round 2', () => {
    // The example in the pull request description, the build log and docs/learn/09. Pinned so the
    // written example stays true; if the generator ever changes, this is the test that says so.
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
    const counts = { deck, warmupsPerSession: 3, checkpointsPerSession: 1 };
    const none = { answeredIds: [], deferredIds: [], dismissedIds: [] };
    expect(planSession({ ...counts, ...none, seed: 'example' }).queue).toEqual([
      'cool',
      'on-tv',
      'embarrassing',
      'immigrants',
    ]);
    // Round 1: "cool" set aside, the other three answered. Round 2, seed "next": one fresh
    // warm-up is left, "cool" comes back right after it, and the round ends on the checkpoint.
    const second = planSession({
      ...counts,
      seed: 'next',
      answeredIds: ['on-tv', 'embarrassing', 'immigrants'],
      deferredIds: [],
      dismissedIds: ['cool'],
    });
    expect(second.queue).toEqual(['tuesday-night', 'cool', 'rich-poor']);
    expect(second.setAsideBefore).toEqual(['cool']);
  });
});

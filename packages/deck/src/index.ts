import type { Card, CardSet, Deck } from '@wb/contracts';
import { seededShuffle } from './random.ts';

/**
 * @wb/deck: the deck engine. Which cards a session shows and in what order; item 2 of the deck
 * brief adds what a dismissal does. The rules are the architecture plan's section 8; the shuffle
 * is explained in docs/learn/09-seeded-shuffle.md.
 *
 * Everything here is a pure function: plain data in, plain data out, no storage, no network, no
 * screen. The client stores the seed, keeps the history, records the events and renders the cards.
 * The engine never throws: every input gives a plan.
 */

export { hashSeed, mulberry32, seededShuffle } from './random.ts';

export interface SessionPlanInput {
  /** The workshop's deck, as loaded from deck.json and checked against the deck schema. */
  deck: Deck;
  /** W from workshop.json: how many warm-ups a session shows. */
  warmupsPerSession: number;
  /** C from workshop.json: how many checkpoints a session shows. */
  checkpointsPerSession: number;
  /** The session's seed, stored with the session. Same seed, same deck, same history: same plan. */
  seed: string;
  /** Every card id this participant has ever answered, on any device. A set, an array, anything iterable. */
  answeredIds: Iterable<string>;
  /**
   * The card ids deferred in the previous session (dismissed twice there) and not answered since,
   * in the order they were deferred. The first session passes an empty list.
   */
  deferredIds: readonly string[];
}

export interface SessionPlan {
  /** Card ids in the order this session shows them. */
  readonly queue: readonly string[];
}

/** Warm-ups come first in a session, then checkpoints (the comment on CARD_SETS says the same). */
const SETS_IN_ORDER: readonly CardSet[] = ['warmup', 'checkpoint'];

/**
 * A count from workshop.json is a whole number from 0 to 10; the schema guarantees it. For a
 * hand-built input, anything else is read as the nearest whole number towards zero and never
 * below zero, so the engine always gives a plan rather than an error.
 */
function wholeCount(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

/**
 * The cards of this session, in order (architecture plan, section 8):
 *
 * 1. The cards deferred in the previous session, first, in the order they were deferred. Each
 *    counts against the set it belongs to, so a deferred warm-up takes one of the W places.
 * 2. Then warm-ups up to W, then checkpoints up to C. Each set is shuffled once by the seed; cards
 *    never answered come before answered ones, so an answered card returns only when the set's
 *    unanswered cards have run out. A card is never shown twice in one session.
 *
 * A deck with fewer cards than the counts gives what it has.
 */
export function planSession(input: SessionPlanInput): SessionPlan {
  const setOf = new Map<string, CardSet>(input.deck.cards.map((card) => [card.id, card.set]));
  const answered = new Set(input.answeredIds);
  const remaining: Record<CardSet, number> = {
    warmup: wholeCount(input.warmupsPerSession),
    checkpoint: wholeCount(input.checkpointsPerSession),
  };
  const queue: string[] = [];
  const queued = new Set<string>();

  for (const id of input.deferredIds) {
    const set = setOf.get(id);
    // Not in this deck (the deck changed since), or listed twice: skipped, not failed.
    if (set === undefined || queued.has(id)) continue;
    queue.push(id);
    queued.add(id);
    remaining[set] = Math.max(0, remaining[set] - 1);
  }

  for (const set of SETS_IN_ORDER) {
    const candidates = shuffleSet(input.deck, set, input.seed).filter((id) => !queued.has(id));
    const fresh = candidates.filter((id) => !answered.has(id));
    const seen = candidates.filter((id) => answered.has(id));
    for (const id of [...fresh, ...seen].slice(0, remaining[set])) {
      queue.push(id);
      queued.add(id);
    }
  }

  return { queue };
}

/**
 * One set of the deck in seeded order. Each set gets its own sub-seed, and the cards are sorted by
 * id before the shuffle, so the order of a set depends on the seed and on which ids the set holds,
 * and on nothing else: not on the other set, not on the order of the cards in the file.
 */
function shuffleSet(deck: Deck, set: CardSet, seed: string): string[] {
  const ids = deck.cards
    .filter((card: Card) => card.set === set)
    .map((card) => card.id)
    .sort();
  return seededShuffle(ids, `${seed}:${set}`);
}

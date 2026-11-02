import type { Card, CardSet, Deck, EventKind } from '@wb/contracts';
import { seededShuffle } from './random.ts';

/**
 * @wb/deck: the deck engine. Which cards a session shows, in what order, what a dismissal does,
 * and when a session is over. The rules are the architecture plan's section 8; the shuffle is
 * explained in docs/learn/09-seeded-shuffle.md.
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
   * in the order they were deferred. Each comes first within its own set. The first session
   * passes an empty list.
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
 * 1. Warm-ups up to W, then checkpoints up to C, so a session ends after the checkpoints.
 * 2. Within each set, the cards deferred in the previous session come first, in the order they
 *    were deferred, and each takes one of the set's places. The places left are filled from a
 *    seeded shuffle of the set: cards never answered before answered ones, so an answered card
 *    returns only when the set's unanswered cards have run out.
 *
 * A card is never shown twice in one session. A deck with fewer cards than the counts gives what
 * it has. A set with more deferred cards than places shows them all and adds nothing fresh.
 */
export function planSession(input: SessionPlanInput): SessionPlan {
  const setOf = new Map<string, CardSet>(input.deck.cards.map((card) => [card.id, card.set]));
  const answered = new Set(input.answeredIds);
  const places: Record<CardSet, number> = {
    warmup: wholeCount(input.warmupsPerSession),
    checkpoint: wholeCount(input.checkpointsPerSession),
  };
  const owed: Record<CardSet, string[]> = { warmup: [], checkpoint: [] };
  const queued = new Set<string>();

  for (const id of input.deferredIds) {
    const set = setOf.get(id);
    // Not in this deck (the deck changed since), or listed twice: skipped, not failed.
    if (set === undefined || queued.has(id)) continue;
    owed[set].push(id);
    queued.add(id);
  }

  const queue: string[] = [];
  for (const set of SETS_IN_ORDER) {
    const candidates = shuffleSet(input.deck, set, input.seed).filter((id) => !queued.has(id));
    const fresh = candidates.filter((id) => !answered.has(id));
    const seen = candidates.filter((id) => answered.has(id));
    const left = Math.max(0, places[set] - owed[set].length);
    queue.push(...owed[set], ...[...fresh, ...seen].slice(0, left));
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

/** The two event kinds a dismissal can call for; both are kinds the event contract knows. */
export type DismissEvent = Extract<EventKind, 'dismissed' | 'deferred'>;

export interface DismissResult {
  /** The queue after the dismissal. The input plan is never changed. */
  plan: SessionPlan;
  /** The event the caller records, or null when the card was not in the queue and nothing happened. */
  event: DismissEvent | null;
}

/**
 * What "Set aside" does (architecture plan, section 8). The first dismissal of a card in this
 * session moves it to the end of the queue, so it comes round once more; the event to record is
 * `dismissed`. The second dismissal of the same card in the same session takes it out of the queue
 * for a future session; the event to record is `deferred`. A card that is not in the queue is left
 * alone and no event is called for.
 *
 * `dismissedThisSession` is the set of card ids already dismissed in this session, as it stood
 * before this call. The caller keeps it and records the event; the engine does neither. Add the
 * card to the set after the call, never before: added before, a first dismissal reads as a second
 * and the card is deferred at once.
 */
export function applyDismiss(
  plan: SessionPlan,
  cardId: string,
  dismissedThisSession: Iterable<string>,
): DismissResult {
  if (!plan.queue.includes(cardId)) return { plan, event: null };
  const rest = plan.queue.filter((id) => id !== cardId);
  if (new Set(dismissedThisSession).has(cardId)) {
    return { plan: { queue: rest }, event: 'deferred' };
  }
  return { plan: { queue: [...rest, cardId] }, event: 'dismissed' };
}

/**
 * A session ends when its queue is exhausted: every card in it has been answered or deferred in
 * this session. With a queue of warm-ups then checkpoints, that is after the last checkpoint. A
 * card dismissed once is still owed its second showing, so it keeps the session open.
 */
export function isSessionOver(
  plan: SessionPlan,
  answeredOrDeferredThisSession: Iterable<string>,
): boolean {
  const done = new Set(answeredOrDeferredThisSession);
  return plan.queue.every((id) => done.has(id));
}

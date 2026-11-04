import type { Card, CardSet, Deck, EventKind } from '@wb/contracts';
import { seededShuffle } from './random.ts';

/**
 * @wb/deck: the deck engine. Which cards a round shows, in what order, what a set-aside does,
 * when a round is over and when the whole deck is done. The rules are the architecture plan's
 * section 8 as ADR 0020 revised them on 5 November 2026; the shuffle and the way a card set aside
 * once finds its place are explained in docs/learn/09-seeded-shuffle.md.
 *
 * Everything here is a pure function: plain data in, plain data out, no storage, no network, no
 * screen. The client stores the seed, keeps the history, records the events and renders the cards.
 * The engine never throws: every input gives a plan.
 *
 * A session is one round (the glossary): W warm-ups then C checkpoints. The names below still say
 * "session" where the contracts do.
 */

export { hashSeed, mulberry32, seededShuffle } from './random.ts';

export interface SessionPlanInput {
  /** The workshop's deck, as loaded from deck.json and checked against the deck schema. */
  deck: Deck;
  /** W from workshop.json: how many warm-ups a round shows. */
  warmupsPerSession: number;
  /** C from workshop.json: how many checkpoints a round shows. */
  checkpointsPerSession: number;
  /** The round's seed, stored with the session. Same seed, same deck, same history: same plan. */
  seed: string;
  /** Every card id answered in an earlier round, on any device. An answered card never comes round again. */
  answeredIds: Iterable<string>;
  /**
   * The cards out for good: set aside a second time (a `deferred` event) in an earlier round.
   * They never come round again.
   */
  deferredIds: Iterable<string>;
  /**
   * The cards set aside once (a `dismissed` event) in an earlier round and neither answered nor
   * out since. Each comes back in this round or a later one, at a place the seed draws: never the
   * first of the round and never next to another of them while fresh cards last. A card that is
   * also answered or out is skipped. The order of this list does not matter.
   */
  dismissedIds: Iterable<string>;
}

export interface SessionPlan {
  /** Card ids in the order this round shows them. A card set aside leaves it. */
  readonly queue: readonly string[];
  /**
   * The cards of this queue that were set aside once in an earlier round and come back in this
   * one. Setting one of them aside again sends it out of the deck for good (`deferred`).
   */
  readonly setAsideBefore: readonly string[];
}

/** Warm-ups come first in a round, then checkpoints (the comment on CARD_SETS says the same). */
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
 * The cards of this round, in order (ADR 0020, the rules of 5 November 2026):
 *
 * 1. Warm-ups up to W, then checkpoints up to C, so a round ends on its checkpoints. Every card
 *    is drawn from the seed; nothing comes first because of what happened before.
 * 2. A card answered, or set aside twice, never comes round again.
 * 3. A card set aside once comes back in a later round, placed right after a fresh card (one
 *    never shown before) and never after the same fresh card as another: so never first in the
 *    round and never next to another card coming back. As many come back as the round has room
 *    for under that rule; the seed draws which ones and where. The others wait for a later round.
 * 4. When a set has too few fresh cards left to fill its places, the cards coming back fill them
 *    anyway, spread as far apart as the fresh cards allow, even if one is then first.
 *
 * A card is never shown twice in one round. A deck with fewer cards than the counts gives what it
 * has. When every card is answered or out for good the deck is done (`isDeckDone`) and the queue
 * is empty.
 */
export function planSession(input: SessionPlanInput): SessionPlan {
  const setOf = new Map<string, CardSet>(input.deck.cards.map((card) => [card.id, card.set]));
  const out = new Set([...input.answeredIds, ...input.deferredIds]);
  const back = new Set<string>();
  for (const id of input.dismissedIds) {
    // Not in this deck (the deck changed since), answered or out since: skipped, not failed.
    if (setOf.has(id) && !out.has(id)) back.add(id);
  }
  const places: Record<CardSet, number> = {
    warmup: wholeCount(input.warmupsPerSession),
    checkpoint: wholeCount(input.checkpointsPerSession),
  };

  const queue: string[] = [];
  const setAsideBefore: string[] = [];
  // Whether the place just before the next block holds a fresh card, so the block may open with
  // a card coming back. Nothing stands before the first block of a round.
  let afterFresh = false;
  for (const [i, set] of SETS_IN_ORDER.entries()) {
    const fresh = shuffleSet(input.deck, set, input.seed).filter(
      (id) => !out.has(id) && !back.has(id),
    );
    const returning = seededShuffle(
      [...back].filter((id) => setOf.get(id) === set).sort(),
      `${input.seed}:${set}:back`,
    );
    const size = Math.min(places[set], fresh.length + returning.length);
    // The next block wants to open with a card coming back: keep this block's last place fresh
    // when it can, so both come back in this round.
    const next = SETS_IN_ORDER[i + 1];
    const nextWantsLead =
      next !== undefined && places[next] > 0 && [...back].some((id) => setOf.get(id) === next);
    // A card coming back needs a fresh card right before it: with k of them in a block of `size`
    // places, `size - k` fresh cards (plus the one before the block, if any) give the room.
    const room = Math.max(
      0,
      Math.floor((size + (afterFresh ? 1 : 0) - (nextWantsLead ? 1 : 0)) / 2),
    );
    const needed = Math.max(0, size - fresh.length);
    const k = Math.min(returning.length, Math.max(needed, room));
    const comingBack = returning.slice(0, k);
    const block = layBlock(
      fresh.slice(0, size - k),
      comingBack,
      afterFresh,
      nextWantsLead,
      `${input.seed}:${set}:places`,
    );
    queue.push(...block);
    setAsideBefore.push(...comingBack);
    if (block.length > 0) afterFresh = !back.has(block.at(-1)!);
  }

  return { queue, setAsideBefore };
}

/**
 * One block of a round: the fresh cards in their seeded order, with the cards coming back slotted
 * into the gaps. Gap 0 is before the first fresh card and is open only when the place before the
 * block holds a fresh card (`afterFresh`); gap n is right after the n-th fresh card. Each gap
 * takes at most one card coming back, so no two are ever next to each other and none is first.
 * Which gaps is drawn from the seed; the block's last gap is left out when the next block wants to
 * open with a card coming back and there is a gap to spare.
 *
 * With more cards coming back than open gaps (the set has run short of fresh cards), every gap
 * opens, gap 0 included, and the cards are spread as evenly as they go, the extra ones from the
 * end: as far apart as the fresh cards left allow.
 */
function layBlock(
  fresh: readonly string[],
  comingBack: readonly string[],
  afterFresh: boolean,
  avoidEnd: boolean,
  seed: string,
): string[] {
  const gaps = fresh.length + 1;
  const perGap = new Array<number>(gaps).fill(0);
  let open: number[] = [];
  for (let g = afterFresh ? 0 : 1; g < gaps; g++) open.push(g);
  if (avoidEnd && comingBack.length < open.length) open = open.filter((g) => g !== gaps - 1);
  if (comingBack.length <= open.length) {
    for (const g of seededShuffle(open, seed).slice(0, comingBack.length)) perGap[g] = 1;
  } else {
    const even = Math.floor(comingBack.length / gaps);
    const extra = comingBack.length % gaps;
    for (let g = 0; g < gaps; g++) perGap[g] = even + (g >= gaps - extra ? 1 : 0);
  }
  const block: string[] = [];
  let next = 0;
  const fill = (g: number) => {
    for (let n = 0; n < perGap[g]!; n++) block.push(comingBack[next++]!);
  };
  fill(0);
  fresh.forEach((id, i) => {
    block.push(id);
    fill(i + 1);
  });
  return block;
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

/**
 * The deck is done when every card in it is answered or out for good (set aside twice): there is
 * nothing left to plan, and `planSession` gives an empty queue. A card set aside once is still to
 * come back, so it keeps the deck open. Ids that are not in the deck do not count.
 */
export function isDeckDone(
  deck: Deck,
  answeredIds: Iterable<string>,
  deferredIds: Iterable<string>,
): boolean {
  const done = new Set([...answeredIds, ...deferredIds]);
  return deck.cards.every((card) => done.has(card.id));
}

/** The two event kinds a set-aside can call for; both are kinds the event contract knows. */
export type DismissEvent = Extract<EventKind, 'dismissed' | 'deferred'>;

export interface DismissResult {
  /** The plan after the set-aside. The input plan is never changed. */
  plan: SessionPlan;
  /** The event the caller records, or null when the card was not in the queue and nothing happened. */
  event: DismissEvent | null;
}

/**
 * What "Set aside" does (ADR 0020). The card leaves this round's queue either way. A card set
 * aside for the first time is recorded as `dismissed` and comes back in a later round
 * (`planSession`, rule 3). A card that was already set aside once before, and came back in this
 * round (`plan.setAsideBefore`), is recorded as `deferred` and leaves the deck for good. A card
 * that is not in the queue is left alone and no event is called for, so a second tap on a card
 * already gone does nothing.
 */
export function applyDismiss(plan: SessionPlan, cardId: string): DismissResult {
  if (!plan.queue.includes(cardId)) return { plan, event: null };
  return {
    plan: { ...plan, queue: plan.queue.filter((id) => id !== cardId) },
    event: plan.setAsideBefore.includes(cardId) ? 'deferred' : 'dismissed',
  };
}

/**
 * A round ends when its queue is exhausted: every card still in it has been answered (a card set
 * aside has already left it). With a queue of warm-ups then checkpoints, that is after the last
 * checkpoint. Answers recorded under other rounds do not count.
 */
export function isSessionOver(plan: SessionPlan, doneThisSession: Iterable<string>): boolean {
  const done = new Set(doneThisSession);
  return plan.queue.every((id) => done.has(id));
}

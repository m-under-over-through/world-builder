import type { Deck, Event, Session, WorkshopConfig } from '@wb/contracts';
import { applyDismiss, isDeckDone, isSessionOver, planSession, type SessionPlan } from '@wb/deck';

/**
 * A session on the device, rebuilt from what is stored: the session row (its seed) and its events.
 * The queue itself is never stored (architecture plan, section 8; the deck brief): it is replayed
 * from the seed and the events, so a reload, a second device with the same code and a restored
 * server all arrive at the same card. The rules of the queue are the deck engine's (ADR 0020); this
 * file only feeds it the history and replays this session's set-asides through it.
 */
export interface History {
  sessions: Session[];
  events: Event[];
}

export interface LiveSession {
  session: Session;
  plan: SessionPlan;
  /**
   * The queue as the engine planned it when the session started, before any set-aside took a
   * card out. A card's number in this session ("03 of 4") is its place here, so the number and
   * the tint that follows it stay with the card (design/DESIGN.md).
   */
  queueAsPlanned: readonly string[];
  /** Card ids shown in this session, so a card is recorded as shown once however often it is displayed. */
  shown: ReadonlySet<string>;
  /** Card ids answered in this session. Answers do not change the queue; they mark cards done. */
  answered: ReadonlySet<string>;
  /** Card ids set aside for the first time in this round (`dismissed`): out of its queue, back in a later round. */
  dismissed: ReadonlySet<string>;
  /** Card ids set aside again in this round after coming back (`deferred`): out of the deck for good. */
  deferred: ReadonlySet<string>;
  /** The seq of the next event this session records. */
  nextSeq: number;
  /** True while nothing but `shown` has happened: the demo card and the hint are still due. */
  untouched: boolean;
  /**
   * True when every card of the deck is answered or out for good, this round's events included
   * (`isDeckDone`, ADR 0020): the thank-you card's cue. Worked out when the round is replayed;
   * `withAnswer` and `withDismissal` carry it over unchanged, and the client replays a round as it
   * starts, so the round after the last card is planned empty with this set.
   */
  deckDone: boolean;
}

/** The device's rows and the server's, as one history; a row the two share counts once. */
export function mergeHistory(local: History, server: History | null): History {
  if (!server) return local;
  const sessions = new Map(local.sessions.map((s) => [s.id, s]));
  for (const s of server.sessions) if (!sessions.has(s.id)) sessions.set(s.id, s);
  const events = new Map(local.events.map((e) => [e.id, e]));
  for (const e of server.events) if (!events.has(e.id)) events.set(e.id, e);
  return { sessions: [...sessions.values()], events: [...events.values()] };
}

/** The session with the highest number, on this device or on the server; none when there is none. */
export function latestSession(history: History): Session | undefined {
  let latest: Session | undefined;
  for (const s of history.sessions) if (!latest || s.sessionNo > latest.sessionNo) latest = s;
  return latest;
}

const bySeq = (a: Event, b: Event) => a.seq - b.seq;

/**
 * The events of the sessions before this one: every session numbered below it, on whichever
 * device it ran, and any session the history has no row for, as answers were always counted.
 * Never this session's own events or a later session's, or the plan would change under the
 * participant.
 */
function eventsBefore(history: History, session: Session): Event[] {
  const numberOf = new Map(history.sessions.map((s) => [s.id, s.sessionNo]));
  return history.events.filter((e) => {
    if (e.sessionId === session.id) return false;
    const no = numberOf.get(e.sessionId);
    return no === undefined || no < session.sessionNo;
  });
}

const cardsOf = (events: Event[], kind: Event['kind']) =>
  events.filter((e) => e.kind === kind).map((e) => e.cardId);

/**
 * The cards out for good before this session: set aside a second time (`deferred`) in any
 * earlier round. The deck engine never brings them round again. The first session has none.
 */
export function deferredBefore(history: History, session: Session): string[] {
  return cardsOf(eventsBefore(history, session), 'deferred');
}

/**
 * The cards set aside once (`dismissed`) in an earlier round and neither answered nor set aside
 * again since: the deck engine brings them back, never first and never side by side (ADR 0020).
 */
export function dismissedBefore(history: History, session: Session): string[] {
  const before = eventsBefore(history, session);
  const settled = new Set([...cardsOf(before, 'answered'), ...cardsOf(before, 'deferred')]);
  return [...new Set(cardsOf(before, 'dismissed'))].filter((id) => !settled.has(id));
}

/**
 * The plan as it stood when the session started: made from the sessions before this one only
 * (`eventsBefore`): their answers and their deferred cards, which never come round again, and
 * the cards they set aside once, which come back. The same for the session being played and for
 * a past session whose cards "Your world so far" numbers.
 */
export function planAsStarted(
  deck: Deck,
  config: WorkshopConfig,
  session: Session,
  history: History,
): SessionPlan {
  return planSession({
    deck,
    warmupsPerSession: config.warmupsPerSession,
    checkpointsPerSession: config.checkpointsPerSession,
    seed: session.seed,
    answeredIds: cardsOf(eventsBefore(history, session), 'answered'),
    deferredIds: deferredBefore(history, session),
    dismissedIds: dismissedBefore(history, session),
  });
}

/**
 * Rebuild a session from its seed and its events (the deck engine's resume recipe): the plan as
 * it started (`planAsStarted`), then this session's `dismissed` and `deferred` events through
 * `applyDismiss` in seq order, each taking its card out of the queue. The engine names the event
 * again from the plan, so the sets below follow the engine, as they did live.
 */
export function replaySession(
  deck: Deck,
  config: WorkshopConfig,
  session: Session,
  history: History,
): LiveSession {
  const own = history.events.filter((e) => e.sessionId === session.id).sort(bySeq);
  let plan = planAsStarted(deck, config, session, history);
  const queueAsPlanned = plan.queue;
  const shown = new Set<string>();
  const answered = new Set<string>();
  const dismissed = new Set<string>();
  const deferred = new Set<string>();
  for (const event of own) {
    if (event.kind === 'shown') shown.add(event.cardId);
    if (event.kind === 'answered') answered.add(event.cardId);
    if (event.kind === 'dismissed' || event.kind === 'deferred') {
      const result = applyDismiss(plan, event.cardId);
      plan = result.plan;
      if (result.event === 'dismissed') dismissed.add(event.cardId);
      if (result.event === 'deferred') deferred.add(event.cardId);
    }
  }
  const last = own.at(-1);
  const before = eventsBefore(history, session);
  const deckDone = isDeckDone(
    deck,
    [...cardsOf(before, 'answered'), ...answered],
    [...cardsOf(before, 'deferred'), ...deferred],
  );
  return {
    session,
    plan,
    queueAsPlanned,
    shown,
    answered,
    dismissed,
    deferred,
    nextSeq: last ? last.seq + 1 : 0,
    untouched: own.every((e) => e.kind === 'shown'),
    deckDone,
  };
}

/** The card to show: the first in the queue not yet answered or deferred in this session. */
export function currentCardId(live: LiveSession): string | undefined {
  return live.plan.queue.find((id) => !live.answered.has(id) && !live.deferred.has(id));
}

/** Over when the engine says so: every card still in the queue answered (a card set aside has left it). */
export function sessionOver(live: LiveSession): boolean {
  return isSessionOver(live.plan, [...live.answered, ...live.deferred]);
}

/** "Card n of total": how many cards of the queue are answered, plus one, out of the queue as it stands. */
export function position(live: LiveSession): { n: number; total: number } {
  const done = live.plan.queue.filter((id) => live.answered.has(id)).length;
  return { n: done + 1, total: live.plan.queue.length };
}

/**
 * A card's number in a session: its place in the queue as planned, from 1; 0 for a card the
 * session never planned. The label on the card ("03 of 4") and the tint follow it.
 */
export function cardNumber(queueAsPlanned: readonly string[], cardId: string): number {
  return queueAsPlanned.indexOf(cardId) + 1;
}

/** The session after an answer: the card is done; the queue is untouched. */
export function withAnswer(live: LiveSession, cardId: string): LiveSession {
  return {
    ...live,
    answered: new Set([...live.answered, cardId]),
    nextSeq: live.nextSeq + 1,
    untouched: false,
  };
}

/**
 * The session after "Set aside": the engine takes the card out of this round's queue and names
 * the event to record: `dismissed` the first time, so it comes back in a later round; `deferred`
 * when it had come back, so it leaves the deck for good (ADR 0020).
 */
export function withDismissal(
  live: LiveSession,
  cardId: string,
): { live: LiveSession; event: 'dismissed' | 'deferred' | null } {
  const { plan, event } = applyDismiss(live.plan, cardId);
  if (!event) return { live, event };
  return {
    event,
    live: {
      ...live,
      plan,
      dismissed: event === 'dismissed' ? new Set([...live.dismissed, cardId]) : live.dismissed,
      deferred: event === 'deferred' ? new Set([...live.deferred, cardId]) : live.deferred,
      nextSeq: live.nextSeq + 1,
      untouched: false,
    },
  };
}

/** A `shown` event was recorded for this card: the seq moves on, and the card is not recorded shown again. */
export function withShown(live: LiveSession, cardId: string): LiveSession {
  return { ...live, shown: new Set([...live.shown, cardId]), nextSeq: live.nextSeq + 1 };
}

import type { Deck, Event, Session, WorkshopConfig } from '@wb/contracts';
import { applyDismiss, isSessionOver, planSession, type SessionPlan } from '@wb/deck';

/**
 * A session on the device, rebuilt from what is stored: the session row (its seed) and its events.
 * The queue itself is never stored (architecture plan, section 8; the deck brief): it is replayed
 * from the seed and the events, so a reload, a second device with the same code and a restored
 * server all arrive at the same card. The rules of the queue are the deck engine's; this file only
 * feeds it the history and replays this session's dismissals through it.
 */
export interface History {
  sessions: Session[];
  events: Event[];
}

export interface LiveSession {
  session: Session;
  plan: SessionPlan;
  /** Card ids shown in this session, so a card is recorded as shown once however often it is displayed. */
  shown: ReadonlySet<string>;
  /** Card ids answered in this session. Answers do not change the queue; they mark cards done. */
  answered: ReadonlySet<string>;
  /** Card ids set aside once in this session: still in the queue, at the end, owed a second showing. */
  dismissed: ReadonlySet<string>;
  /** Card ids set aside twice in this session: out of the queue, first in line next session. */
  deferred: ReadonlySet<string>;
  /** The seq of the next event this session records. */
  nextSeq: number;
  /** True while nothing but `shown` has happened: the demo card and the hint are still due. */
  untouched: boolean;
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
 * The card ids deferred in the previous session, in the order they were deferred: the deck
 * engine shows them first. The previous session is the one numbered just below this one, on
 * whichever device it ran. The first session has none.
 */
export function deferredBefore(history: History, session: Session): string[] {
  const previous = new Set(
    history.sessions.filter((s) => s.sessionNo === session.sessionNo - 1).map((s) => s.id),
  );
  return history.events
    .filter((e) => e.kind === 'deferred' && previous.has(e.sessionId))
    .sort(bySeq)
    .map((e) => e.cardId);
}

/**
 * Rebuild a session from its seed and its events (the deck engine's resume recipe). The plan is
 * made with the history as it stood when the session started: every answer from other sessions,
 * never this session's own, or the plan would change under the participant; and the previous
 * session's deferrals. Then this session's `dismissed` and `deferred` events go through
 * `applyDismiss` in seq order, each `dismissed` card joining the set after its own call.
 */
export function replaySession(
  deck: Deck,
  config: WorkshopConfig,
  session: Session,
  history: History,
): LiveSession {
  const own = history.events.filter((e) => e.sessionId === session.id).sort(bySeq);
  const answeredBefore = history.events
    .filter((e) => e.kind === 'answered' && e.sessionId !== session.id)
    .map((e) => e.cardId);
  let plan = planSession({
    deck,
    warmupsPerSession: config.warmupsPerSession,
    checkpointsPerSession: config.checkpointsPerSession,
    seed: session.seed,
    answeredIds: answeredBefore,
    deferredIds: deferredBefore(history, session),
  });
  const shown = new Set<string>();
  const answered = new Set<string>();
  const dismissed = new Set<string>();
  const deferred = new Set<string>();
  for (const event of own) {
    if (event.kind === 'shown') shown.add(event.cardId);
    if (event.kind === 'answered') answered.add(event.cardId);
    if (event.kind === 'dismissed' || event.kind === 'deferred') {
      const result = applyDismiss(plan, event.cardId, dismissed);
      plan = result.plan;
      if (result.event === 'dismissed') dismissed.add(event.cardId);
      if (result.event === 'deferred') deferred.add(event.cardId);
    }
  }
  const last = own.at(-1);
  return {
    session,
    plan,
    shown,
    answered,
    dismissed,
    deferred,
    nextSeq: last ? last.seq + 1 : 0,
    untouched: own.every((e) => e.kind === 'shown'),
  };
}

/** The card to show: the first in the queue not yet answered or deferred in this session. */
export function currentCardId(live: LiveSession): string | undefined {
  return live.plan.queue.find((id) => !live.answered.has(id) && !live.deferred.has(id));
}

/** Over when the engine says so: every card in the queue answered or deferred. */
export function sessionOver(live: LiveSession): boolean {
  return isSessionOver(live.plan, [...live.answered, ...live.deferred]);
}

/** "Card n of total": how many are done plus one, out of the queue as it stands. */
export function position(live: LiveSession): { n: number; total: number } {
  return { n: live.answered.size + live.deferred.size + 1, total: live.plan.queue.length };
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
 * The session after "Set aside": the engine moves the card to the end or, the second time, out
 * of the queue, and names the event to record. The set it is given is the one before this call;
 * the card joins it only after, and only on a first dismissal (the deck engine's sharp edge).
 */
export function withDismissal(
  live: LiveSession,
  cardId: string,
): { live: LiveSession; event: 'dismissed' | 'deferred' | null } {
  const { plan, event } = applyDismiss(live.plan, cardId, live.dismissed);
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

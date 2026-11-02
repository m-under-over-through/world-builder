import { describe, expect, it } from 'vitest';
import type { Event, Session } from '@wb/contracts';
import {
  currentCardId,
  deferredBefore,
  latestSession,
  mergeHistory,
  position,
  replaySession,
  sessionOver,
  withAnswer,
  withDismissal,
  withShown,
} from '../src/lib/session.ts';
import { findWorkshop } from '../src/lib/workshops.ts';

/**
 * The session as the client rebuilds it from the seed and the events, on the deck engine. The
 * engine's own rules are tested in packages/deck; here it is the feeding and the replay.
 */
const { deck, config } = findWorkshop('rural-manufacturing')!;
const session = (n: number, id = n): Session => ({
  id: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
  sessionNo: n,
  startedDay: '2026-11-16',
  deckVersion: deck.version,
  seed: `000000000000000${n}`,
});
let ids = 0;
const event = (s: Session, seq: number, kind: Event['kind'], cardId: string): Event => ({
  id: `10000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`,
  sessionId: s.id,
  cardId,
  seq,
  kind,
  createdDay: '2026-11-16',
  deckVersion: deck.version,
  ...(kind === 'answered' ? { body: 'v1.' + 'A'.repeat(64) } : {}),
});

describe('a session is replayed from its seed and its events', () => {
  it('a new session has W warm-ups then C checkpoints and starts at seq 0', () => {
    const live = replaySession(deck, config, session(1), { sessions: [], events: [] });
    expect(live.plan.queue).toHaveLength(config.warmupsPerSession + config.checkpointsPerSession);
    const setOf = (id: string) => deck.cards.find((c) => c.id === id)!.set;
    expect(live.plan.queue.slice(0, 3).map(setOf)).toEqual(['warmup', 'warmup', 'warmup']);
    expect(setOf(live.plan.queue[3]!)).toBe('checkpoint');
    expect(live.nextSeq).toBe(0);
    expect(live.untouched).toBe(true);
    expect(currentCardId(live)).toBe(live.plan.queue[0]);
    expect(position(live)).toEqual({ n: 1, total: 4 });
  });

  it('the same seed and the same history give the same queue', () => {
    const a = replaySession(deck, config, session(1), { sessions: [], events: [] });
    const b = replaySession(deck, config, session(1), { sessions: [], events: [] });
    expect(a.plan.queue).toEqual(b.plan.queue);
  });

  it("replays this session's dismissals in seq order: a set-aside card comes round again, then leaves", () => {
    const s1 = session(1);
    const fresh = replaySession(deck, config, s1, { sessions: [s1], events: [] });
    const [first, second] = fresh.plan.queue as [string, string];
    const events = [
      event(s1, 0, 'shown', first),
      event(s1, 1, 'dismissed', first),
      event(s1, 2, 'shown', second),
      event(s1, 3, 'answered', second),
    ];
    const live = replaySession(deck, config, s1, { sessions: [s1], events });
    expect(live.plan.queue.at(-1)).toBe(first);
    expect(live.dismissed.has(first)).toBe(true);
    expect(live.answered.has(second)).toBe(true);
    expect(live.nextSeq).toBe(4);
    expect(live.untouched).toBe(false);
    expect(currentCardId(live)).toBe(fresh.plan.queue[2]);

    const again = replaySession(deck, config, s1, {
      sessions: [s1],
      events: [...events, event(s1, 4, 'shown', first), event(s1, 5, 'deferred', first)],
    });
    expect(again.plan.queue).not.toContain(first);
    expect(again.deferred.has(first)).toBe(true);
  });

  it('is over when every card in the queue is answered or deferred, and not before', () => {
    const s1 = session(1);
    let live = replaySession(deck, config, s1, { sessions: [s1], events: [] });
    const queue = [...live.plan.queue];
    for (const id of queue.slice(0, 3)) live = withAnswer(live, id);
    expect(sessionOver(live)).toBe(false);
    const { live: dismissedOnce } = withDismissal(live, queue[3]!);
    expect(sessionOver(dismissedOnce)).toBe(false);
    const { live: deferred, event: kind } = withDismissal(dismissedOnce, queue[3]!);
    expect(kind).toBe('deferred');
    expect(sessionOver(deferred)).toBe(true);
    expect(currentCardId(deferred)).toBeUndefined();
  });

  it("the previous session's deferred cards, in order, lead the next session; the first session has none", () => {
    const s1 = session(1);
    const s2 = session(2);
    const first = replaySession(deck, config, s1, { sessions: [s1], events: [] });
    const [a, b] = first.plan.queue as [string, string];
    const events = [
      event(s1, 0, 'dismissed', a),
      event(s1, 1, 'dismissed', b),
      event(s1, 2, 'deferred', b),
      event(s1, 3, 'deferred', a),
    ];
    expect(deferredBefore({ sessions: [s1, s2], events }, s2)).toEqual([b, a]);
    expect(deferredBefore({ sessions: [s1, s2], events }, s1)).toEqual([]);
    const second = replaySession(deck, config, s2, { sessions: [s1, s2], events });
    expect(second.plan.queue.slice(0, 2)).toEqual([b, a]);
  });

  it("this session's own answers are not history: the queue does not change under the participant", () => {
    const s1 = session(1);
    const fresh = replaySession(deck, config, s1, { sessions: [s1], events: [] });
    const first = fresh.plan.queue[0]!;
    const mid = replaySession(deck, config, s1, {
      sessions: [s1],
      events: [event(s1, 0, 'answered', first)],
    });
    expect(mid.plan.queue).toEqual(fresh.plan.queue);
    expect(mid.answered.has(first)).toBe(true);
  });

  it('answers from other sessions are history: a later session prefers cards not yet answered', () => {
    const s1 = session(1);
    const s2 = session(2);
    const warmups = deck.cards.filter((c) => c.set === 'warmup').map((c) => c.id);
    const events = warmups.slice(0, 3).map((id, i) => event(s1, i, 'answered', id));
    const second = replaySession(deck, config, s2, { sessions: [s1, s2], events });
    // Five warm-ups, three answered: the two fresh ones come first, then one answered comes round.
    for (const id of second.plan.queue.slice(0, 2)) expect(warmups.slice(3)).toContain(id);
    expect(warmups.slice(0, 3)).toContain(second.plan.queue[2]);
  });
});

describe('the bookkeeping around the engine', () => {
  it("withDismissal hands the engine the set as it stood before the call, so the first tap is 'dismissed'", () => {
    const s1 = session(1);
    const live = replaySession(deck, config, s1, { sessions: [s1], events: [] });
    const id = live.plan.queue[0]!;
    const once = withDismissal(live, id);
    expect(once.event).toBe('dismissed');
    expect(once.live.plan.queue.at(-1)).toBe(id);
    expect(once.live.nextSeq).toBe(1);
    const twice = withDismissal(once.live, id);
    expect(twice.event).toBe('deferred');
    expect(twice.live.plan.queue).not.toContain(id);
    expect(twice.live.nextSeq).toBe(2);
    expect(withDismissal(twice.live, id).event).toBeNull();
  });

  it('withShown and withAnswer move the seq on; the input is never changed', () => {
    const s1 = session(1);
    const live = replaySession(deck, config, s1, { sessions: [s1], events: [] });
    const shown = withShown(live);
    expect(shown.nextSeq).toBe(1);
    expect(live.nextSeq).toBe(0);
    const answered = withAnswer(shown, live.plan.queue[0]!);
    expect(answered.nextSeq).toBe(2);
    expect(answered.untouched).toBe(false);
    expect(shown.untouched).toBe(true);
  });

  it("the device's rows and the server's merge into one history, a shared row counting once", () => {
    const s1 = session(1);
    const s2 = session(2);
    const shared = event(s1, 0, 'answered', 'cool');
    const merged = mergeHistory(
      { sessions: [s1], events: [shared] },
      { sessions: [s1, s2], events: [shared, event(s2, 0, 'answered', 'on-tv')] },
    );
    expect(merged.sessions.map((s) => s.sessionNo).sort()).toEqual([1, 2]);
    expect(merged.events).toHaveLength(2);
    expect(mergeHistory({ sessions: [s1], events: [] }, null).sessions).toEqual([s1]);
  });

  it('the latest session is the highest number, wherever it ran', () => {
    expect(latestSession({ sessions: [], events: [] })).toBeUndefined();
    expect(
      latestSession({ sessions: [session(2), session(3), session(1)], events: [] })?.sessionNo,
    ).toBe(3);
  });
});

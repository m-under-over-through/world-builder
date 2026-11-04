import { describe, expect, it } from 'vitest';
import type { Event, Session } from '@wb/contracts';
import {
  currentCardId,
  deferredBefore,
  dismissedBefore,
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
    expect(live.plan.setAsideBefore).toEqual([]);
    expect(live.deckDone).toBe(false);
  });

  it('the same seed and the same history give the same queue', () => {
    const a = replaySession(deck, config, session(1), { sessions: [], events: [] });
    const b = replaySession(deck, config, session(1), { sessions: [], events: [] });
    expect(a.plan.queue).toEqual(b.plan.queue);
  });

  it('a card set aside leaves the round at once: the replay records it as dismissed and the next card is the front', () => {
    const s1 = session(1);
    const fresh = replaySession(deck, config, s1, { sessions: [s1], events: [] });
    const [first, second, third] = fresh.plan.queue as [string, string, string];
    const events = [
      event(s1, 0, 'shown', first),
      event(s1, 1, 'dismissed', first),
      event(s1, 2, 'shown', second),
      event(s1, 3, 'answered', second),
    ];
    const live = replaySession(deck, config, s1, { sessions: [s1], events });
    expect(live.plan.queue).not.toContain(first);
    expect(live.queueAsPlanned).toEqual(fresh.plan.queue);
    expect(live.dismissed.has(first)).toBe(true);
    expect([...live.shown].sort()).toEqual([first, second].sort());
    expect(live.answered.has(second)).toBe(true);
    expect(live.nextSeq).toBe(4);
    expect(live.untouched).toBe(false);
    expect(currentCardId(live)).toBe(third);
    expect(position(live)).toEqual({ n: 2, total: 3 });
  });

  it('a round is over when every card left in it is answered: a card set aside does not hold it open', () => {
    const s1 = session(1);
    let live = replaySession(deck, config, s1, { sessions: [s1], events: [] });
    const queue = [...live.plan.queue];
    for (const id of queue.slice(0, 3)) live = withAnswer(live, id);
    expect(sessionOver(live)).toBe(false);
    const { live: aside, event: kind } = withDismissal(live, queue[3]!);
    expect(kind).toBe('dismissed');
    expect(sessionOver(aside)).toBe(true);
    expect(currentCardId(aside)).toBeUndefined();
  });

  it('across two sessions: a card set aside in round 1 comes back in round 2, never first, and set aside again it is out for good', () => {
    const [s1, s2, s3] = [session(1), session(2), session(3)];
    const round1 = replaySession(deck, config, s1, { sessions: [s1], events: [] });
    const [a, ...rest] = round1.plan.queue as [string, ...string[]];
    const events = [
      event(s1, 0, 'dismissed', a),
      ...rest.map((id, i) => event(s1, i + 1, 'answered', id)),
    ];
    const history = { sessions: [s1, s2], events };
    expect(dismissedBefore(history, s2)).toEqual([a]);
    expect(deferredBefore(history, s2)).toEqual([]);
    const round2 = replaySession(deck, config, s2, history);
    expect(round2.plan.queue).toContain(a);
    expect(round2.plan.queue.indexOf(a)).toBeGreaterThan(0);
    expect(round2.plan.setAsideBefore).toEqual([a]);
    for (const id of rest) expect(round2.plan.queue).not.toContain(id);

    const again = withDismissal(round2, a);
    expect(again.event).toBe('deferred');
    expect(again.live.deferred.has(a)).toBe(true);
    const later = { sessions: [s1, s2, s3], events: [...events, event(s2, 0, 'deferred', a)] };
    expect(dismissedBefore(later, s3)).toEqual([]);
    expect(deferredBefore(later, s3)).toEqual([a]);
    expect(replaySession(deck, config, s3, later).plan.queue).not.toContain(a);
  });

  it('deckDone turns true at the end: every card answered or out, and the round after is empty', () => {
    const history = { sessions: [] as Session[], events: [] as Event[] };
    // Set aside every card whose id is of even length, answer the others: a card set aside comes
    // back and, set aside again by the same rule, leaves for good.
    const setAside = (id: string) => id.length % 2 === 0;
    let n = 1;
    for (; n <= 60; n++) {
      const s = session(n);
      history.sessions.push(s);
      let live = replaySession(deck, config, s, history);
      if (live.plan.queue.length === 0) break;
      expect(live.deckDone).toBe(false);
      while (!sessionOver(live)) {
        const id = currentCardId(live)!;
        const seq = live.nextSeq;
        if (setAside(id)) {
          const result = withDismissal(live, id);
          history.events.push(event(s, seq, result.event!, id));
          live = result.live;
        } else {
          history.events.push(event(s, seq, 'answered', id));
          live = withAnswer(live, id);
        }
      }
    }
    const last = replaySession(deck, config, latestSession(history)!, history);
    expect(last.plan.queue).toEqual([]);
    expect(last.deckDone).toBe(true);
    expect(sessionOver(last)).toBe(true);
    const kinds = (id: string) => history.events.filter((e) => e.cardId === id).map((e) => e.kind);
    for (const card of deck.cards) {
      expect(kinds(card.id)).toEqual(setAside(card.id) ? ['dismissed', 'deferred'] : ['answered']);
    }
    // The round before the empty one was the deck's last: its replay says so too.
    const done = replaySession(deck, config, session(n - 1), history);
    expect(done.queueAsPlanned.length).toBeGreaterThan(0);
    expect(done.deckDone).toBe(true);
  });

  it('the queue of a resumed session is the same as before the reload', () => {
    const [s1, s2] = [session(1), session(2)];
    const round1 = replaySession(deck, config, s1, { sessions: [s1], events: [] });
    const [a, b, ...rest] = round1.plan.queue as [string, string, ...string[]];
    const history = {
      sessions: [s1, s2],
      events: [
        event(s1, 0, 'dismissed', a),
        event(s1, 1, 'dismissed', b),
        ...rest.map((id, i) => event(s1, i + 2, 'answered', id)),
      ],
    };
    // Live: round 2 from its seed, then a set-aside of a fresh card, an answer, and a set-aside
    // of a card that came back, each recorded as the client records it.
    let live = replaySession(deck, config, s2, history);
    const recorded: Event[] = [];
    const back = live.plan.setAsideBefore[0]!;
    const fresh = live.plan.queue.filter((id) => id !== back);
    for (const [kind, id] of [
      ['aside', fresh[0]!],
      ['answer', fresh[1]!],
      ['aside', back],
    ] as const) {
      const seq = live.nextSeq;
      if (kind === 'answer') {
        recorded.push(event(s2, seq, 'answered', id));
        live = withAnswer(live, id);
      } else {
        const result = withDismissal(live, id);
        recorded.push(event(s2, seq, result.event!, id));
        live = result.live;
      }
    }
    expect(recorded.map((e) => e.kind)).toEqual(['dismissed', 'answered', 'deferred']);

    const resumed = replaySession(deck, config, s2, {
      ...history,
      events: [...history.events, ...recorded],
    });
    expect(resumed.plan).toEqual(live.plan);
    expect(resumed.queueAsPlanned).toEqual(live.queueAsPlanned);
    expect([...resumed.dismissed]).toEqual([...live.dismissed]);
    expect([...resumed.deferred]).toEqual([...live.deferred]);
    expect([...resumed.answered]).toEqual([...live.answered]);
    expect(resumed.nextSeq).toBe(live.nextSeq);
    expect(currentCardId(resumed)).toBe(currentCardId(live));
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

  it('an answer in an earlier session is history: the card never comes round again', () => {
    const [s1, s2] = [session(1), session(2)];
    const warmups = deck.cards.filter((c) => c.set === 'warmup').map((c) => c.id);
    // All warm-ups but two answered in round 1: round 2 shows those two warm-ups and no other.
    const left = warmups.slice(-2);
    const events = warmups.slice(0, -2).map((id, i) => event(s1, i, 'answered', id));
    const second = replaySession(deck, config, s2, { sessions: [s1, s2], events });
    const shownWarmups = second.plan.queue.filter((id) => warmups.includes(id));
    expect([...shownWarmups].sort()).toEqual([...left].sort());
    expect(second.deckDone).toBe(false);
  });
});

describe('the bookkeeping around the engine', () => {
  it("withDismissal: a first set-aside is 'dismissed' and takes the card out; a second tap on it does nothing", () => {
    const s1 = session(1);
    const live = replaySession(deck, config, s1, { sessions: [s1], events: [] });
    const id = live.plan.queue[0]!;
    const once = withDismissal(live, id);
    expect(once.event).toBe('dismissed');
    expect(once.live.plan.queue).not.toContain(id);
    expect(once.live.dismissed.has(id)).toBe(true);
    expect(once.live.nextSeq).toBe(1);
    expect(once.live.deckDone).toBe(false);
    const twice = withDismissal(once.live, id);
    expect(twice.event).toBeNull();
    expect(twice.live).toBe(once.live);
  });

  it('withShown and withAnswer move the seq on; the input is never changed', () => {
    const s1 = session(1);
    const live = replaySession(deck, config, s1, { sessions: [s1], events: [] });
    const shown = withShown(live, live.plan.queue[0]!);
    expect(shown.nextSeq).toBe(1);
    expect(shown.shown.has(live.plan.queue[0]!)).toBe(true);
    expect(live.nextSeq).toBe(0);
    expect(live.shown.size).toBe(0);
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

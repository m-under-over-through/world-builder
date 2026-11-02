import { describe, expect, it } from 'vitest';
import { deckSchema, EVENT_KINDS, type Card, type Deck } from '@wb/contracts';
import { applyDismiss, isSessionOver, planSession, type SessionPlan } from '../src/index.ts';

const queueOf = (...ids: string[]): SessionPlan => ({ queue: ids });

/** The worked example's deck: four warm-ups and two checkpoints. */
function exampleDeck(): Deck {
  const cards: Card[] = [
    { id: 'tuesday-night', set: 'warmup', text: 'What is a typical Tuesday night?' },
    { id: 'on-tv', set: 'warmup', text: 'What is on TV?' },
    { id: 'embarrassing', set: 'warmup', text: 'What is embarrassing?' },
    { id: 'cool', set: 'warmup', text: 'What is cool?' },
    { id: 'immigrants', set: 'checkpoint', text: 'Are there immigrants? What do they do?' },
    { id: 'rich-poor', set: 'checkpoint', text: 'Who gets richer, or poorer? How?' },
  ];
  return deckSchema.parse({ version: '0.1', cards });
}

describe('applyDismiss: what "Set aside" does', () => {
  it('the first dismissal of a card moves it to the end of the queue and records dismissed', () => {
    const { plan, event } = applyDismiss(queueOf('a', 'b', 'c', 'd'), 'a', []);
    expect(plan.queue).toEqual(['b', 'c', 'd', 'a']);
    expect(event).toBe('dismissed');
  });

  it('the second dismissal of the same card in the same session removes it and records deferred', () => {
    const { plan, event } = applyDismiss(queueOf('b', 'c', 'd', 'a'), 'a', ['a']);
    expect(plan.queue).toEqual(['b', 'c', 'd']);
    expect(event).toBe('deferred');
  });

  it('a dismissal of a card that is not in the queue is a no-op with no event', () => {
    const before = queueOf('a', 'b', 'c');
    const { plan, event } = applyDismiss(before, 'zzz', []);
    expect(plan).toBe(before);
    expect(plan.queue).toEqual(['a', 'b', 'c']);
    expect(event).toBeNull();
  });

  it('a card that was already deferred and left the queue cannot be dismissed again', () => {
    const { plan, event } = applyDismiss(queueOf('b', 'c'), 'a', ['a']);
    expect(plan.queue).toEqual(['b', 'c']);
    expect(event).toBeNull();
  });

  it('a card dismissed in the middle of the queue goes to the end, the others keep their order', () => {
    const { plan } = applyDismiss(queueOf('a', 'b', 'c', 'd'), 'b', []);
    expect(plan.queue).toEqual(['a', 'c', 'd', 'b']);
  });

  it('a first dismissal of the last card keeps it last and still records dismissed', () => {
    const { plan, event } = applyDismiss(queueOf('a', 'b', 'c'), 'c', []);
    expect(plan.queue).toEqual(['a', 'b', 'c']);
    expect(event).toBe('dismissed');
  });

  it('the input plan is not changed', () => {
    const before = queueOf('a', 'b', 'c');
    applyDismiss(before, 'a', []);
    applyDismiss(before, 'a', ['a']);
    expect(before.queue).toEqual(['a', 'b', 'c']);
  });

  it('only dismissals of this session count: a card deferred last session starts fresh', () => {
    // Deferred last session, so first in this one; its first dismissal here moves it to the end.
    const plan = planSession({
      deck: exampleDeck(),
      warmupsPerSession: 3,
      checkpointsPerSession: 1,
      seed: 'example',
      answeredIds: [],
      deferredIds: ['tuesday-night'],
    });
    expect(plan.queue[0]).toBe('tuesday-night');
    const after = applyDismiss(plan, 'tuesday-night', []);
    expect(after.event).toBe('dismissed');
    expect(after.plan.queue.at(-1)).toBe('tuesday-night');
  });

  it('dismissedThisSession means "before this call": adding the id first turns a first dismissal into deferred', () => {
    const plan = queueOf('a', 'b', 'c');
    // Right: the set as it stood before this dismissal. The card goes to the end.
    expect(applyDismiss(plan, 'a', []).event).toBe('dismissed');
    // Wrong: the id added before the call. The engine reads a second dismissal and defers at once.
    expect(applyDismiss(plan, 'a', ['a']).event).toBe('deferred');
  });

  it('dismissedThisSession accepts a set or an array', () => {
    expect(applyDismiss(queueOf('a', 'b'), 'a', new Set(['a'])).event).toBe('deferred');
    expect(applyDismiss(queueOf('a', 'b'), 'a', ['a']).event).toBe('deferred');
    expect(applyDismiss(queueOf('a', 'b'), 'a', new Set()).event).toBe('dismissed');
  });

  it('the events it names are kinds the event contract knows', () => {
    expect(EVENT_KINDS).toContain(applyDismiss(queueOf('a', 'b'), 'a', []).event);
    expect(EVENT_KINDS).toContain(applyDismiss(queueOf('a', 'b'), 'a', ['a']).event);
  });
});

describe('isSessionOver: when the queue is exhausted', () => {
  const plan = queueOf('warmup-1', 'warmup-2', 'warmup-3', 'checkpoint-1');

  it('a session with nothing answered is not over', () => {
    expect(isSessionOver(plan, [])).toBe(false);
  });

  it('a session is not over before the last checkpoint is answered', () => {
    expect(isSessionOver(plan, ['warmup-1', 'warmup-2', 'warmup-3'])).toBe(false);
  });

  it('a session is over after the last checkpoint is answered', () => {
    expect(isSessionOver(plan, ['warmup-1', 'warmup-2', 'warmup-3', 'checkpoint-1'])).toBe(true);
  });

  it('a session is over when the last card is deferred instead of answered', () => {
    expect(isSessionOver(plan, ['warmup-1', 'warmup-2', 'warmup-3'])).toBe(false);
    const { plan: after, event } = applyDismiss(plan, 'checkpoint-1', ['checkpoint-1']);
    expect(event).toBe('deferred');
    // Either way of looking at it says over: the card left the queue, or it is in the done set.
    expect(isSessionOver(after, ['warmup-1', 'warmup-2', 'warmup-3'])).toBe(true);
    expect(isSessionOver(plan, ['warmup-1', 'warmup-2', 'warmup-3', 'checkpoint-1'])).toBe(true);
  });

  it('a card dismissed once keeps the session open until it is answered or deferred', () => {
    const { plan: after } = applyDismiss(plan, 'warmup-1', []);
    expect(after.queue).toEqual(['warmup-2', 'warmup-3', 'checkpoint-1', 'warmup-1']);
    expect(isSessionOver(after, ['warmup-2', 'warmup-3', 'checkpoint-1'])).toBe(false);
    expect(isSessionOver(after, ['warmup-2', 'warmup-3', 'checkpoint-1', 'warmup-1'])).toBe(true);
  });

  it('the order of answering does not matter, only that every card is done', () => {
    expect(isSessionOver(plan, ['checkpoint-1', 'warmup-3', 'warmup-2', 'warmup-1'])).toBe(true);
  });

  it('ids outside the queue do not count towards the end', () => {
    expect(isSessionOver(plan, ['something-else', 'warmup-1'])).toBe(false);
  });

  it('an empty queue is over at once', () => {
    expect(isSessionOver(queueOf(), [])).toBe(true);
  });
});

describe('resuming a session', () => {
  const start = {
    deck: exampleDeck(),
    warmupsPerSession: 3,
    checkpointsPerSession: 1,
    seed: 'example',
    answeredIds: ['tuesday-night'],
    deferredIds: [] as string[],
  };

  it("a resumed session rebuilds its queue by replaying this session's dismissals in order", () => {
    // The client stores the seed and the events, never the queue. Live: plan, then answer "cool",
    // dismiss "on-tv", answer "embarrassing" and "immigrants", and dismiss "on-tv" again.
    let live = planSession(start);
    expect(live.queue).toEqual(['cool', 'on-tv', 'embarrassing', 'immigrants']);
    const events: { kind: 'answered' | 'dismissed' | 'deferred'; cardId: string }[] = [];
    const dismissed = new Set<string>();
    const answer = (cardId: string) => events.push({ kind: 'answered', cardId });
    const dismiss = (cardId: string) => {
      const result = applyDismiss(live, cardId, dismissed);
      live = result.plan;
      events.push({ kind: result.event!, cardId });
      if (result.event === 'dismissed') dismissed.add(cardId);
    };
    answer('cool');
    dismiss('on-tv');
    answer('embarrassing');
    answer('immigrants');
    dismiss('on-tv');
    expect(live.queue).toEqual(['cool', 'embarrassing', 'immigrants']);
    expect(events.map((e) => e.kind)).toEqual([
      'answered',
      'dismissed',
      'answered',
      'answered',
      'deferred',
    ]);

    // Resume: the same inputs as at the start (this session's answers are not history yet), then
    // this session's dismissals replayed in seq order. The queue comes back the same.
    let resumed = planSession(start);
    const seen = new Set<string>();
    for (const event of events) {
      if (event.kind === 'answered') continue;
      resumed = applyDismiss(resumed, event.cardId, seen).plan;
      if (event.kind === 'dismissed') seen.add(event.cardId);
    }
    expect(resumed.queue).toEqual(live.queue);
    const done = events.filter((e) => e.kind !== 'dismissed').map((e) => e.cardId);
    expect(isSessionOver(resumed, done)).toBe(true);
  });

  it("feeding this session's answers back as history would change the plan, so the client must not", () => {
    const fresh = planSession(start).queue;
    const polluted = planSession({ ...start, answeredIds: ['tuesday-night', 'cool'] }).queue;
    expect(polluted).not.toEqual(fresh);
  });
});

describe('the worked example, continued', () => {
  it('six cards, counts 3 and 1, seed "example": the order, then one and two dismissals of the first card', () => {
    const deck = exampleDeck();
    const session = { deck, warmupsPerSession: 3, checkpointsPerSession: 1, seed: 'example' };
    const plan = planSession({ ...session, answeredIds: [], deferredIds: [] });
    expect(plan.queue).toEqual(['cool', 'on-tv', 'embarrassing', 'immigrants']);

    // First dismissal of "cool": to the end, event dismissed. The session goes on.
    const once = applyDismiss(plan, 'cool', []);
    expect(once.plan.queue).toEqual(['on-tv', 'embarrassing', 'immigrants', 'cool']);
    expect(once.event).toBe('dismissed');
    expect(isSessionOver(once.plan, ['on-tv', 'embarrassing', 'immigrants'])).toBe(false);

    // Second dismissal of "cool", once it comes round again: out of the queue, event deferred.
    const twice = applyDismiss(once.plan, 'cool', ['cool']);
    expect(twice.plan.queue).toEqual(['on-tv', 'embarrassing', 'immigrants']);
    expect(twice.event).toBe('deferred');
    expect(isSessionOver(twice.plan, ['on-tv', 'embarrassing', 'immigrants'])).toBe(true);

    // Next session: "cool" is owed a showing and comes first, counted as one of the three warm-ups.
    const next = planSession({
      ...session,
      seed: 'next',
      answeredIds: ['on-tv', 'embarrassing', 'immigrants'],
      deferredIds: ['cool'],
    });
    expect(next.queue[0]).toBe('cool');
    expect(next.queue).toHaveLength(4);
  });
});

import { describe, expect, it } from 'vitest';
import { deckSchema, EVENT_KINDS, type Card, type Deck } from '@wb/contracts';
import { applyDismiss, isSessionOver, planSession, type SessionPlan } from '../src/index.ts';

const queueOf = (ids: string[], setAsideBefore: string[] = []): SessionPlan => ({
  queue: ids,
  setAsideBefore,
});

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
  it('a card set aside for the first time leaves the round and is recorded as dismissed', () => {
    const { plan, event } = applyDismiss(queueOf(['a', 'b', 'c', 'd']), 'a');
    expect(plan.queue).toEqual(['b', 'c', 'd']);
    expect(event).toBe('dismissed');
  });

  it('a card that came back after being set aside once leaves the deck when set aside again: deferred', () => {
    const { plan, event } = applyDismiss(queueOf(['a', 'b', 'c', 'd'], ['b']), 'b');
    expect(plan.queue).toEqual(['a', 'c', 'd']);
    expect(event).toBe('deferred');
  });

  it('the cards left keep their order: nothing is moved to the end', () => {
    expect(applyDismiss(queueOf(['a', 'b', 'c', 'd']), 'b').plan.queue).toEqual(['a', 'c', 'd']);
  });

  it('a second tap on a card already set aside in this round does nothing and calls for no event', () => {
    const once = applyDismiss(queueOf(['a', 'b', 'c']), 'a');
    const twice = applyDismiss(once.plan, 'a');
    expect(twice.plan).toBe(once.plan);
    expect(twice.event).toBeNull();
  });

  it('a set-aside of a card that is not in the queue is a no-op with no event', () => {
    const before = queueOf(['a', 'b', 'c'], ['zzz']);
    const { plan, event } = applyDismiss(before, 'zzz');
    expect(plan).toBe(before);
    expect(event).toBeNull();
  });

  it('the input plan is not changed', () => {
    const before = queueOf(['a', 'b', 'c'], ['b']);
    applyDismiss(before, 'a');
    applyDismiss(before, 'b');
    expect(before).toEqual({ queue: ['a', 'b', 'c'], setAsideBefore: ['b'] });
  });

  it('the events it names are kinds the event contract knows', () => {
    expect(EVENT_KINDS).toContain(applyDismiss(queueOf(['a', 'b']), 'a').event);
    expect(EVENT_KINDS).toContain(applyDismiss(queueOf(['a', 'b'], ['a']), 'a').event);
  });
});

describe('isSessionOver: when the round is exhausted', () => {
  const plan = queueOf(['warmup-1', 'warmup-2', 'warmup-3', 'checkpoint-1']);

  it('a round with nothing answered is not over', () => {
    expect(isSessionOver(plan, [])).toBe(false);
  });

  it('a round is not over before the last checkpoint is answered, and is after', () => {
    expect(isSessionOver(plan, ['warmup-1', 'warmup-2', 'warmup-3'])).toBe(false);
    expect(isSessionOver(plan, ['warmup-1', 'warmup-2', 'warmup-3', 'checkpoint-1'])).toBe(true);
  });

  it('a card set aside leaves the queue, so it does not keep the round open', () => {
    const { plan: after } = applyDismiss(plan, 'checkpoint-1');
    expect(isSessionOver(after, ['warmup-1', 'warmup-2', 'warmup-3'])).toBe(true);
  });

  it('the order of answering does not matter, only that every card is done', () => {
    expect(isSessionOver(plan, ['checkpoint-1', 'warmup-3', 'warmup-2', 'warmup-1'])).toBe(true);
  });

  it('ids outside the queue do not count towards the end', () => {
    expect(isSessionOver(plan, ['something-else', 'warmup-1'])).toBe(false);
  });

  it('an empty queue is over at once', () => {
    expect(isSessionOver(queueOf([]), [])).toBe(true);
  });
});

describe('resuming a round', () => {
  it("a resumed round rebuilds its queue from the same inputs and this round's set-asides in order", () => {
    // The client stores the seed and the events, never the queue. Round 2 of the worked example:
    // "cool" came back; live, the participant sets aside "tuesday-night" and then "cool".
    const start = {
      deck: exampleDeck(),
      warmupsPerSession: 3,
      checkpointsPerSession: 1,
      seed: 'next',
      answeredIds: ['on-tv', 'embarrassing', 'immigrants'],
      deferredIds: [],
      dismissedIds: ['cool'],
    };
    let live = planSession(start);
    const events: { kind: string; cardId: string }[] = [];
    for (const cardId of ['tuesday-night', 'cool']) {
      const result = applyDismiss(live, cardId);
      live = result.plan;
      events.push({ kind: result.event!, cardId });
    }
    expect(events.map((e) => e.kind)).toEqual(['dismissed', 'deferred']);
    expect(live.queue).toEqual(['rich-poor']);

    let resumed = planSession(start);
    for (const event of events) resumed = applyDismiss(resumed, event.cardId).plan;
    expect(resumed).toEqual(live);
  });
});

describe('the worked example, continued', () => {
  it('"cool" set aside in round 1, back in round 2, set aside again: out of the deck for good', () => {
    const counts = { deck: exampleDeck(), warmupsPerSession: 3, checkpointsPerSession: 1 };
    const round1 = planSession({
      ...counts,
      seed: 'example',
      answeredIds: [],
      deferredIds: [],
      dismissedIds: [],
    });
    expect(round1.queue).toEqual(['cool', 'on-tv', 'embarrassing', 'immigrants']);
    const once = applyDismiss(round1, 'cool');
    expect(once.event).toBe('dismissed');
    expect(once.plan.queue).toEqual(['on-tv', 'embarrassing', 'immigrants']);
    expect(isSessionOver(once.plan, ['on-tv', 'embarrassing', 'immigrants'])).toBe(true);

    const round2 = planSession({
      ...counts,
      seed: 'next',
      answeredIds: ['on-tv', 'embarrassing', 'immigrants'],
      deferredIds: [],
      dismissedIds: ['cool'],
    });
    expect(round2.queue).toEqual(['tuesday-night', 'cool', 'rich-poor']);
    const twice = applyDismiss(round2, 'cool');
    expect(twice.event).toBe('deferred');

    const round3 = planSession({
      ...counts,
      seed: 'third',
      answeredIds: ['on-tv', 'embarrassing', 'immigrants', 'tuesday-night'],
      deferredIds: ['cool'],
      dismissedIds: [],
    });
    expect(round3.queue).toEqual(['rich-poor']);
  });
});

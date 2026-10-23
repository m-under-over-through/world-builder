import { describe, expect, it } from 'vitest';
import { eventSchema, MAX_BODY_CHARS, sealedEnvelopeSchema, sessionSchema } from '../src/index.ts';

const base = {
  id: '3b241101-e2bb-4255-8caf-4136c566a962',
  sessionId: '9e107d9d-372b-4a1c-8f1e-6a7f4a1b2c3d',
  cardId: 'tuesday-night',
  seq: 0,
  createdDay: '2026-11-16',
  deckVersion: '0.1',
};

describe('events', () => {
  it('an answered event must carry a sealed body', () => {
    expect(eventSchema.safeParse({ ...base, kind: 'answered' }).success).toBe(false);
    expect(eventSchema.safeParse({ ...base, kind: 'answered', body: 'v1.AAAA' }).success).toBe(
      true,
    );
  });

  it('a dismissed, shown, deferred or revisited event must not carry a body', () => {
    for (const kind of ['shown', 'dismissed', 'deferred', 'revisited']) {
      expect(eventSchema.safeParse({ ...base, kind }).success).toBe(true);
      expect(eventSchema.safeParse({ ...base, kind, body: 'v1.AAAA' }).success).toBe(false);
    }
  });

  it('rejects an unknown kind, a bad day, a bad card id', () => {
    expect(eventSchema.safeParse({ ...base, kind: 'edited' }).success).toBe(false);
    expect(
      eventSchema.safeParse({ ...base, kind: 'shown', createdDay: '16/11/2026' }).success,
    ).toBe(false);
    expect(eventSchema.safeParse({ ...base, kind: 'shown', cardId: 'Tuesday Night' }).success).toBe(
      false,
    );
  });

  it('a sealed envelope is "v1." plus base64, within the size cap', () => {
    expect(sealedEnvelopeSchema.safeParse('v1.aGVsbG8=').success).toBe(true);
    expect(sealedEnvelopeSchema.safeParse('v2.aGVsbG8=').success).toBe(false);
    expect(sealedEnvelopeSchema.safeParse('hello').success).toBe(false);
    expect(sealedEnvelopeSchema.safeParse('v1.' + 'A'.repeat(MAX_BODY_CHARS)).success).toBe(false);
  });
});

describe('sessions', () => {
  it('needs a 16-hex seed and a session number from 1', () => {
    const ok = {
      id: base.sessionId,
      sessionNo: 1,
      startedDay: '2026-11-16',
      deckVersion: '0.1',
      seed: '0123456789abcdef',
    };
    expect(sessionSchema.safeParse(ok).success).toBe(true);
    expect(sessionSchema.safeParse({ ...ok, sessionNo: 0 }).success).toBe(false);
    expect(sessionSchema.safeParse({ ...ok, seed: 'xyz' }).success).toBe(false);
  });
});

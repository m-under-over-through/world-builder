import { describe, expect, it } from 'vitest';
import { eventSchema, MAX_BODY_CHARS, sealedEnvelopeSchema, sessionSchema } from '../src/index.ts';

// The shortest thing the crypto package can produce: 48 sealed bytes, 64 base64 characters.
const sealedBody = 'v1.' + 'A'.repeat(64);

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
    expect(eventSchema.safeParse({ ...base, kind: 'answered', body: sealedBody }).success).toBe(
      true,
    );
  });

  it('a dismissed, shown, deferred or revisited event must not carry a body', () => {
    for (const kind of ['shown', 'dismissed', 'deferred', 'revisited']) {
      expect(eventSchema.safeParse({ ...base, kind }).success).toBe(true);
      expect(eventSchema.safeParse({ ...base, kind, body: sealedBody }).success).toBe(false);
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
    expect(sealedEnvelopeSchema.safeParse(sealedBody).success).toBe(true);
    expect(sealedEnvelopeSchema.safeParse('v2.' + sealedBody.slice(3)).success).toBe(false);
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

describe('events and sessions reject what the contract does not name', () => {
  it('an event with an extra field is invalid, not silently trimmed', () => {
    const smuggled = { ...base, kind: 'shown', ip: '203.0.113.9' };
    expect(eventSchema.safeParse(smuggled).success).toBe(false);
  });

  it('a session with an extra field is invalid', () => {
    const ok = {
      id: base.sessionId,
      sessionNo: 1,
      startedDay: '2026-11-16',
      deckVersion: '0.1',
      seed: '0123456789abcdef',
    };
    expect(sessionSchema.safeParse({ ...ok, userAgent: 'x' }).success).toBe(false);
  });

  it('bounds the deck version that rides on every event', () => {
    expect(eventSchema.safeParse({ ...base, kind: 'shown', deckVersion: '12345.1' }).success).toBe(
      false,
    );
    expect(
      eventSchema.safeParse({ ...base, kind: 'shown', deckVersion: '1234.5678' }).success,
    ).toBe(true);
  });

  it('envelopes must be whole base64 groups and at least one sealed box long', () => {
    const smallestSealedBox = 'v1.' + 'A'.repeat(64);
    expect(sealedEnvelopeSchema.safeParse(smallestSealedBox).success).toBe(true);
    for (const bad of [
      'v1.A',
      'v1.AAAAA',
      'v1.AAAA',
      'v1.' + 'A'.repeat(63),
      'v1.' + 'A'.repeat(65),
    ]) {
      expect(sealedEnvelopeSchema.safeParse(bad).success).toBe(false);
    }
    expect(sealedEnvelopeSchema.safeParse('v1.' + 'A'.repeat(MAX_BODY_CHARS - 3)).success).toBe(
      false,
    ); // not a multiple of 4
    expect(sealedEnvelopeSchema.safeParse('v1.' + 'A'.repeat(MAX_BODY_CHARS - 4)).success).toBe(
      true,
    );
  });
});

describe('primitives', () => {
  it('ids must be lowercase v4 uuids, so the same id cannot appear twice in two spellings', () => {
    const lower = { ...base, kind: 'shown' };
    const upper = { ...lower, id: base.id.toUpperCase() };
    expect(eventSchema.safeParse(lower).success).toBe(true);
    expect(eventSchema.safeParse(upper).success).toBe(false);
    expect(
      eventSchema.safeParse({ ...lower, id: '00000000-0000-0000-0000-000000000000' }).success,
    ).toBe(false);
  });

  it('days must exist on the calendar', () => {
    for (const bad of ['2026-02-30', '2026-13-01', '0000-00-00']) {
      expect(eventSchema.safeParse({ ...base, kind: 'shown', createdDay: bad }).success).toBe(
        false,
      );
    }
    expect(
      eventSchema.safeParse({ ...base, kind: 'shown', createdDay: '2028-02-29' }).success,
    ).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import {
  ERROR_CODES,
  errorResponseSchema,
  inviteTokenSchema,
  joinRequestSchema,
  SYNC_MAX_EVENTS,
  syncRequestSchema,
} from '../src/index.ts';

describe('join request', () => {
  const code = '1234567890123456';

  it('takes exactly one of wave or invite', () => {
    expect(joinRequestSchema.safeParse({ code, wave: 'wave-1' }).success).toBe(true);
    expect(joinRequestSchema.safeParse({ code, invite: 'A'.repeat(22) }).success).toBe(true);
    expect(joinRequestSchema.safeParse({ code }).success).toBe(false);
    expect(
      joinRequestSchema.safeParse({ code, wave: 'wave-1', invite: 'A'.repeat(22) }).success,
    ).toBe(false);
  });

  it('rejects a malformed code', () => {
    expect(joinRequestSchema.safeParse({ code: '1234', wave: 'wave-1' }).success).toBe(false);
  });
});

describe('sync request', () => {
  it('caps the batch size', () => {
    const tooMany = { sessions: [], events: new Array(SYNC_MAX_EVENTS + 1).fill(null) };
    expect(syncRequestSchema.safeParse(tooMany).success).toBe(false);
    expect(syncRequestSchema.safeParse({ sessions: [], events: [] }).success).toBe(true);
  });
});

describe('error codes', () => {
  it('every code has an HTTP status and a meaning, and the response schema only accepts known codes', () => {
    for (const [name, def] of Object.entries(ERROR_CODES)) {
      expect(name).toMatch(/^[A-Z_]+$/);
      expect(def.status).toBeGreaterThanOrEqual(400);
      expect(def.meaning.length).toBeGreaterThan(10);
    }
    expect(
      errorResponseSchema.safeParse({ error: 'AUTH_CODE_UNKNOWN', message: 'x' }).success,
    ).toBe(true);
    expect(errorResponseSchema.safeParse({ error: 'SOMETHING_ELSE', message: 'x' }).success).toBe(
      false,
    );
  });
});

describe('invite tokens', () => {
  it('are 22 base64url characters', () => {
    expect(inviteTokenSchema.safeParse('abcDEF123_-abcDEF123_-').success).toBe(true);
    expect(inviteTokenSchema.safeParse('abc+DEF/123=abcDEF123x').success).toBe(false);
  });
});

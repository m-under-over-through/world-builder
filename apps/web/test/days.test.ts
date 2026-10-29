import { describe, expect, it } from 'vitest';
import { dayStatus } from '../src/lib/days.ts';

const OPENS = '2026-11-16';
const CLOSES = '2026-12-06';

describe('where a day falls against the workshop days', () => {
  it('a day before the opening day is before, so a new arrival sees "Not open yet" without a request', () => {
    expect(dayStatus('2026-10-29', OPENS, CLOSES)).toBe('before');
    expect(dayStatus('2026-11-15', OPENS, CLOSES)).toBe('before');
  });

  it('the opening day and the close day are both open', () => {
    expect(dayStatus(OPENS, OPENS, CLOSES)).toBe('open');
    expect(dayStatus('2026-11-30', OPENS, CLOSES)).toBe('open');
    expect(dayStatus(CLOSES, OPENS, CLOSES)).toBe('open');
  });

  it('a day after the close day is after', () => {
    expect(dayStatus('2026-12-07', OPENS, CLOSES)).toBe('after');
    expect(dayStatus('2027-01-01', OPENS, CLOSES)).toBe('after');
  });

  it('staging may open earlier than the folder says, and the same rule applies', () => {
    expect(dayStatus('2026-10-29', '2026-10-28', CLOSES)).toBe('open');
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  escapeText,
  firstOccurrence,
  fold,
  REMINDER_HOUR,
  REMINDER_WEEKDAYS,
  reminderCalendar,
  reminderLink,
} from '../src/lib/reminder.ts';

/**
 * The calendar file's rules (ADR 0013), read back from the text: the repeat ends on the close
 * day, the alarm is there, and the only address in it is the workshop's home.
 */
const input = {
  slug: 'rural-manufacturing',
  base: 'https://worldbuilder.under-over-through.co',
  opensDay: '2026-11-16',
  closesDay: '2026-12-06',
  summary: 'World Builder: a few more cards',
  description: 'A few quiet minutes with the next cards, whenever it suits you. [link]',
};

/** The file as lines, unfolded (a continuation line starts with a space). */
function lines(text: string): string[] {
  return text.replace(/\r\n /g, '').split('\r\n').filter(Boolean);
}

describe('the calendar reminder', () => {
  const text = reminderCalendar(input);
  const all = lines(text);
  const line = (name: string) => all.find((l) => l.startsWith(`${name}:`))?.slice(name.length + 1);

  it('is one event in a calendar, with CRLF line ends and nothing longer than 75 octets', () => {
    expect(all[0]).toBe('BEGIN:VCALENDAR');
    expect(all.at(-1)).toBe('END:VCALENDAR');
    expect(all.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(1);
    expect(text.endsWith('\r\n')).toBe(true);
    expect(text.includes('\n') && !text.includes('\r\n')).toBe(false);
    for (const raw of text.split('\r\n'))
      expect(new TextEncoder().encode(raw).length).toBeLessThanOrEqual(75);
  });

  it('repeats twice a week on fixed weekdays, from the day after the opening day until the close day, inclusive', () => {
    expect(REMINDER_WEEKDAYS).toHaveLength(2);
    expect(line('RRULE')).toBe(
      `FREQ=WEEKLY;BYDAY=${REMINDER_WEEKDAYS.join(',')};UNTIL=20261206T${String(REMINDER_HOUR).padStart(2, '0')}0000`,
    );
    // 16 November 2026 is a Monday: the first Wednesday after it is the 18th.
    expect(firstOccurrence('2026-11-16')).toBe('2026-11-18');
    expect(line('DTSTART')).toBe(`20261118T${String(REMINDER_HOUR).padStart(2, '0')}0000`);
    // The day after a Tuesday is a Wednesday: the first occurrence is that day.
    expect(firstOccurrence('2026-11-17')).toBe('2026-11-18');
    // The day after a Wednesday is a Thursday: the next is Sunday.
    expect(firstOccurrence('2026-11-18')).toBe('2026-11-22');
  });

  it("rings at a reasonable hour, in the phone's own time, with an alarm at the time of the event", () => {
    expect(REMINDER_HOUR).toBeGreaterThanOrEqual(8);
    expect(REMINDER_HOUR).toBeLessThanOrEqual(20);
    // Floating local time: no Z and no TZID on the start.
    expect(line('DTSTART')).not.toMatch(/Z$/);
    expect(all.some((l) => l.startsWith('DTSTART;TZID'))).toBe(false);
    expect(all).toContain('BEGIN:VALARM');
    expect(line('ACTION')).toBe('DISPLAY');
    expect(line('TRIGGER')).toBe('PT0M');
  });

  it('carries the workshop home link only: no code, no wave, no invite, nothing about the person', () => {
    expect(reminderLink(input.base, input.slug)).toBe(
      'https://worldbuilder.under-over-through.co/rural-manufacturing/',
    );
    expect(line('URL')).toBe('https://worldbuilder.under-over-through.co/rural-manufacturing/');
    expect(line('DESCRIPTION')).toContain(
      'https://worldbuilder.under-over-through.co/rural-manufacturing/',
    );
    expect(text).not.toContain('[link]');
    expect(text).not.toMatch(/\d{4} ?\d{4} ?\d{4} ?\d{4}/);
    expect(text).not.toMatch(/join|invite|wave|code|Authorization/i);
    // The stamp is a day, the opening day, not the moment of the build.
    expect(line('DTSTAMP')).toBe('20261116T000000Z');
    expect(line('UID')).toBe('reminder-rural-manufacturing@worldbuilder.under-over-through.co');
  });

  it('is the same bytes for everyone: two calls agree, and the base can carry a trailing slash', () => {
    expect(reminderCalendar(input)).toBe(text);
    expect(reminderCalendar({ ...input, base: `${input.base}/` })).toBe(text);
  });

  it('escapes the characters the format reserves and folds long lines without cutting a character', () => {
    expect(escapeText('a, b; c\\d\nnext')).toBe('a\\, b\\; c\\\\d\\nnext');
    const long = 'é'.repeat(60);
    const folded = fold(`DESCRIPTION:${long}`);
    for (const part of folded.split('\r\n'))
      expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, '')).toBe(`DESCRIPTION:${long}`);
  });

  it('is built from the workshop folder: its days and the words of the "Reminder" block', () => {
    const root = join(fileURLToPath(import.meta.url), '../../../../workshops/rural-manufacturing');
    const config = JSON.parse(readFileSync(join(root, 'workshop.json'), 'utf8')) as {
      opensDay: string;
      closesDay: string;
    };
    expect(config.closesDay).toBe('2026-12-06');
    expect(readFileSync(join(root, 'copy.md'), 'utf8')).toContain('## Reminder');
  });
});

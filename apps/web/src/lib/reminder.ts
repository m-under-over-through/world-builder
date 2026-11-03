/**
 * The calendar reminder (ADR 0013): a small file in the iCalendar format (RFC 5545) that the
 * phone's own calendar reads, so it reminds the participant to come back. One file per workshop,
 * written into the build at /<slug>/reminder.ics (apps/web/pwa.ts), served from this origin with
 * `Content-Type: text/calendar` (apps/web/public/_headers). Nothing about the person is in it:
 * the same bytes go to everyone, and the only address in it is the workshop's home, never the
 * code, a wave or an invite.
 *
 * What the file says: one event, twice a week on fixed weekdays at an evening hour, repeating
 * from the day after the workshop opens until its close day, with an alarm at the time of the
 * event. The times are "floating" (no time zone), so the phone reads them in its own local time.
 * A participant who joins late sees the earlier dates in the past; past alarms never ring.
 */

/** The weekdays of the reminder, as RFC 5545 spells them (section 3.3.10): Wednesday and Sunday. */
export const REMINDER_WEEKDAYS = ['WE', 'SU'] as const;
/** The hour of the reminder, in the phone's own time. */
export const REMINDER_HOUR = 18;
/** How long the event lasts, in minutes: a session is a few cards. */
export const REMINDER_MINUTES = 15;

export interface ReminderInput {
  slug: string;
  /** The absolute address of this deployment, without a trailing slash: the link is `${base}/${slug}/`. */
  base: string;
  opensDay: string;
  closesDay: string;
  /** The words, from the workshop's copy.md ("Reminder"); `[link]` in the description is filled here. */
  summary: string;
  description: string;
}

/** The address of a workshop's reminder file, relative to the origin. */
export function reminderHref(slug: string): string {
  return `/${slug}/reminder.ics`;
}

/** The workshop's home, the one address the file carries. */
export function reminderLink(base: string, slug: string): string {
  return `${base.replace(/\/+$/, '')}/${slug}/`;
}

/** The text of the file. */
export function reminderCalendar(input: ReminderInput): string {
  const link = reminderLink(input.base, input.slug);
  const start = firstOccurrence(input.opensDay);
  const host = safeHost(input.base);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//World Builder//reminder//EN',
    'BEGIN:VEVENT',
    // A unique id and a stamp are required (sections 3.8.4.7 and 3.8.7.2). Both are the same for
    // everyone: the stamp is the opening day at midnight, a day and not a moment.
    `UID:reminder-${input.slug}@${host}`,
    `DTSTAMP:${compact(input.opensDay)}T000000Z`,
    `DTSTART:${compact(start)}T${pad(REMINDER_HOUR)}0000`,
    `DURATION:PT${REMINDER_MINUTES}M`,
    // Twice a week until the close day, inclusive: UNTIL is a floating time like DTSTART
    // (section 3.3.10), at the event's own hour, so the close day's occurrence is the last.
    `RRULE:FREQ=WEEKLY;BYDAY=${REMINDER_WEEKDAYS.join(',')};UNTIL=${compact(input.closesDay)}T${pad(REMINDER_HOUR)}0000`,
    `SUMMARY:${escapeText(input.summary)}`,
    `DESCRIPTION:${escapeText(input.description.split('[link]').join(link))}`,
    `URL:${link}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(input.summary)}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  // Lines end in CRLF and are folded at 75 octets (section 3.1).
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** The first weekday of the reminder on or after the day after the opening day. */
export function firstOccurrence(opensDay: string): string {
  const day = new Date(`${opensDay}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  const wanted = REMINDER_WEEKDAYS.map((d) => WEEKDAYS.indexOf(d));
  while (!wanted.includes(day.getUTCDay())) day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}

/** Sunday first, as JavaScript counts weekdays, in RFC 5545's two-letter names. */
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

/** "2026-11-18" as the format's "20261118". */
function compact(day: string): string {
  return day.replaceAll('-', '');
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** The host of the deployment's address, for the UID; "localhost" when the address is not one. */
function safeHost(base: string): string {
  try {
    return new URL(base).host;
  } catch {
    return 'localhost';
  }
}

/** A text value: backslashes, semicolons, commas and newlines are escaped (section 3.3.11). */
export function escapeText(text: string): string {
  return text
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replaceAll(/\r?\n/g, '\\n');
}

/**
 * A content line longer than 75 octets is split into several, each continuation starting with a
 * space (section 3.1). Counted in bytes, so a multi-byte character is never cut in half.
 */
export function fold(line: string): string {
  const encoder = new TextEncoder();
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > 75) {
      out.push(current);
      current = ' ';
      bytes = 1;
    }
    current += char;
    bytes += size;
  }
  out.push(current);
  return out.join('\r\n');
}

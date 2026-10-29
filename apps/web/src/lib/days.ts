/**
 * Where a day falls against a workshop's days, judged on the device from the phone's own date
 * before anything is asked of the server. A participant who arrives before the opening day sees
 * "Not open yet" without a request; one who arrives after the close day sees "closed". The server
 * stays the authority: it refuses joins and events outside the same days with WORKSHOP_CLOSED, and
 * the client shows the same screen for that answer. Days are "YYYY-MM-DD" strings (docs/glossary.md),
 * so comparing the strings compares the days.
 */
export type DayStatus = 'before' | 'open' | 'after';

export function dayStatus(day: string, opensDay: string, closesDay: string): DayStatus {
  if (day < opensDay) return 'before';
  if (day > closesDay) return 'after';
  return 'open';
}

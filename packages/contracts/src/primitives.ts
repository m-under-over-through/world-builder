import { z } from 'zod';

/**
 * A calendar day, YYYY-MM-DD, in the participant's local time. We never store finer time than this.
 * `z.iso.date()` checks the shape and that the date exists (no 2026-02-30).
 */
export const daySchema = z.iso.date();
export type Day = z.infer<typeof daySchema>;

/**
 * Client-generated identifiers are UUID v4, so the same record sent twice is recognised as the same
 * record. Lowercase only: ids are compared as strings, and "3B24..." must not become a second row
 * next to "3b24...". `crypto.randomUUID()` emits lowercase v4.
 */
export const uuidSchema = z.uuidv4().refine((s) => s === s.toLowerCase(), 'uuid must be lowercase');

/** Short, URL-safe names: card ids, workshop slugs, wave ids. Lowercase words joined by single hyphens. */
export const slugLikeSchema = z
  .string()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'lowercase letters, digits and single hyphens only');

/**
 * A deck version such as "0.1" or "2.0". Recorded on every event so rewording a card never corrupts
 * analysis. Bounded, because it rides on every event: an unbounded string here would let one sync
 * batch carry megabytes of junk.
 */
export const deckVersionSchema = z
  .string()
  .regex(/^\d{1,4}\.\d{1,4}$/, 'expected major.minor, up to 4 digits each');

/** Compare two days as strings; the YYYY-MM-DD format sorts correctly as text. */
export function dayIsBefore(a: Day, b: Day): boolean {
  return a < b;
}

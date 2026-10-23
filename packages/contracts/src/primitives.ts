import { z } from 'zod';

/** A calendar day, YYYY-MM-DD, in the participant's local time. We never store finer time than this. */
export const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
export type Day = z.infer<typeof daySchema>;

/** Client-generated identifiers are UUID v4, so the same record sent twice is recognised as the same record. */
export const uuidSchema = z.uuid();

/** Short, URL-safe names: card ids, workshop slugs, wave ids. Lowercase words joined by single hyphens. */
export const slugLikeSchema = z
  .string()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'lowercase letters, digits and single hyphens only');

/** A deck version such as "0.1" or "2.0". Recorded on every event so rewording a card never corrupts analysis. */
export const deckVersionSchema = z.string().regex(/^\d+\.\d+$/, 'expected major.minor');

/** Compare two days as strings; the YYYY-MM-DD format sorts correctly as text. */
export function dayIsBefore(a: Day, b: Day): boolean {
  return a < b;
}

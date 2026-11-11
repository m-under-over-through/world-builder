import { z } from 'zod';
import { daySchema, deckVersionSchema, uuidSchema } from './primitives.ts';

/** One sitting with the cards. The seed makes the shuffle reproducible if the session is resumed. */
export const sessionSchema = z.strictObject({
  id: uuidSchema,
  /** 1 for the participant's first session, 2 for the second, and so on. */
  // The ceiling is the database column's (a 32-bit integer): a larger number is refused here as
  // SYNC_PAYLOAD_INVALID, not later as a SERVER_ERROR (security pass, 11 November 2026).
  sessionNo: z.number().int().min(1).max(2_147_483_647),
  startedDay: daySchema,
  deckVersion: deckVersionSchema,
  /** 64 bits of randomness as 16 hex characters. */
  seed: z.string().regex(/^[0-9a-f]{16}$/, 'expected 16 hex characters'),
});
export type Session = z.infer<typeof sessionSchema>;

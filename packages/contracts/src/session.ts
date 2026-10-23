import { z } from 'zod';
import { daySchema, deckVersionSchema, uuidSchema } from './primitives.ts';

/** One sitting with the cards. The seed makes the shuffle reproducible if the session is resumed. */
export const sessionSchema = z.strictObject({
  id: uuidSchema,
  /** 1 for the participant's first session, 2 for the second, and so on. */
  sessionNo: z.number().int().min(1),
  startedDay: daySchema,
  deckVersion: deckVersionSchema,
  /** 64 bits of randomness as 16 hex characters. */
  seed: z.string().regex(/^[0-9a-f]{16}$/, 'expected 16 hex characters'),
});
export type Session = z.infer<typeof sessionSchema>;

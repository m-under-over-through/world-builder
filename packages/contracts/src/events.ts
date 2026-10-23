import { z } from 'zod';
import { daySchema, deckVersionSchema, slugLikeSchema, uuidSchema } from './primitives.ts';

/**
 * Everything a participant does is an event. Events are append-only: nothing is edited in place,
 * the client generates the id, and the server stores each id at most once. That is what makes
 * sync safe to retry (docs/adr/0005-append-only-events.md).
 */
export const EVENT_KINDS = ['shown', 'answered', 'dismissed', 'deferred', 'revisited'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/** Plain-text answers are capped before encryption. */
export const MAX_ANSWER_CHARS = 4000;

/**
 * The sealed answer, as stored and transmitted: "v1." followed by standard base64.
 * 4000 characters of text is at most 16,000 bytes of UTF-8; sealed it grows by 48 bytes;
 * base64 grows it by a third. 24,000 characters leaves room.
 */
export const MAX_BODY_CHARS = 24000;
export const sealedEnvelopeSchema = z
  .string()
  .max(MAX_BODY_CHARS)
  .regex(/^v1\.[A-Za-z0-9+/]+={0,2}$/, 'expected "v1." followed by base64');

export const eventSchema = z
  .object({
    id: uuidSchema,
    sessionId: uuidSchema,
    cardId: slugLikeSchema,
    /** Order within the session, set by the client. Replaces a timestamp. */
    seq: z.number().int().min(0),
    kind: z.enum(EVENT_KINDS),
    /** Present only for `answered`: the sealed answer. The server cannot read it. */
    body: sealedEnvelopeSchema.optional(),
    createdDay: daySchema,
    deckVersion: deckVersionSchema,
  })
  .superRefine((event, ctx) => {
    if (event.kind === 'answered' && event.body === undefined) {
      ctx.addIssue({ code: 'custom', message: 'an answered event must carry a sealed body' });
    }
    if (event.kind !== 'answered' && event.body !== undefined) {
      ctx.addIssue({ code: 'custom', message: `a ${event.kind} event must not carry a body` });
    }
  });
export type Event = z.infer<typeof eventSchema>;

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
 *
 * Size: 4000 UTF-16 units of text is at most 12,000 bytes of UTF-8; sealed it grows by 48 bytes
 * (32 of ephemeral key, 16 of tag); base64 grows it by a third. 24,000 characters leaves room.
 * The smallest possible sealed box is 48 bytes, which is 64 base64 characters, so 67 with the prefix.
 * The regex enforces whole base64 groups, so the server never stores an envelope the export tool
 * cannot decode.
 */
export const MAX_BODY_CHARS = 24000;
export const MIN_BODY_CHARS = 67;
export const sealedEnvelopeSchema = z
  .string()
  .min(MIN_BODY_CHARS)
  .max(MAX_BODY_CHARS)
  .regex(
    /^v1\.(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
    'expected "v1." followed by base64',
  );

// strictObject: a field this contract does not name is an error, not something to drop silently.
// Version skew between client and server then shows up as SYNC_PAYLOAD_INVALID instead of lost data.
export const eventSchema = z
  .strictObject({
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

import { z } from 'zod';
import { deckVersionSchema, slugLikeSchema } from './primitives.ts';

/** Two sets of cards: warm-ups come first in a session, then checkpoints. */
export const CARD_SETS = ['warmup', 'checkpoint'] as const;
export type CardSet = (typeof CARD_SETS)[number];

export const cardSchema = z.object({
  id: slugLikeSchema,
  set: z.enum(CARD_SETS),
  text: z.string().min(1).max(300),
});
export type Card = z.infer<typeof cardSchema>;

/** The deck file of a workshop: workshops/<slug>/deck.json. */
export const deckSchema = z
  .object({
    version: deckVersionSchema,
    cards: z.array(cardSchema).min(2),
  })
  .superRefine((deck, ctx) => {
    const seen = new Set<string>();
    for (const card of deck.cards) {
      if (seen.has(card.id)) {
        ctx.addIssue({ code: 'custom', message: `duplicate card id "${card.id}"` });
      }
      seen.add(card.id);
    }
    for (const set of CARD_SETS) {
      if (!deck.cards.some((card) => card.set === set)) {
        ctx.addIssue({ code: 'custom', message: `the deck needs at least one ${set} card` });
      }
    }
  });
export type Deck = z.infer<typeof deckSchema>;

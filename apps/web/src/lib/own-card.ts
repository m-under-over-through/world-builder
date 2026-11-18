import { OWN_CARD_PREFIX } from '@wb/contracts';
import { newValue, type Random } from './invitations.ts';

/**
 * The id of a blank card: a card with no question, which the participant writes (ADR 0022).
 * It is `own-` and the first eight characters of a link value (lib/invitations.ts), so the same
 * strong generator and the same alphabet make it, and no second generator exists to review.
 * Eight characters are 40 random bits: two of a hundred blank cards share an id about once in two
 * hundred million, so no list of the ids already made is needed (learning note 12). A deck may not
 * use the prefix, so the id is never a card of the deck.
 */
export const OWN_CARD_TAIL = 8;

export function newOwnCardId(random?: Random): string {
  return OWN_CARD_PREFIX + newValue(random).slice(0, OWN_CARD_TAIL);
}

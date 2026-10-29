import type { Card, Deck, WorkshopConfig } from '@wb/contracts';

/**
 * Which cards make up a session: W warm-ups then C checkpoints, preferring cards this
 * participant has not answered, cycling back once a set is exhausted. The seeded shuffle and
 * dismiss and defer rules belong to the deck engine package (week two); the skeleton takes the
 * cards in file order.
 */
export function sessionCards(deck: Deck, config: WorkshopConfig, answeredIds: Set<string>): Card[] {
  const pick = (set: Card['set'], n: number) => {
    const all = deck.cards.filter((c) => c.set === set);
    const fresh = all.filter((c) => !answeredIds.has(c.id));
    return [...fresh, ...all.filter((c) => answeredIds.has(c.id))].slice(0, n);
  };
  return [
    ...pick('warmup', config.warmupsPerSession),
    ...pick('checkpoint', config.checkpointsPerSession),
  ];
}

/** Count by code points, not UTF-16 units, so an emoji is never cut in half (CRYPTO_BAD_TEXT). */
export function codePoints(text: string): number {
  let n = 0;
  for (const _ of text) n++;
  return n;
}

export function truncateCodePoints(text: string, max: number): string {
  return [...text].slice(0, max).join('');
}

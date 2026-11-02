/**
 * Deterministic randomness for the deck engine. The idea is explained in
 * docs/learn/09-seeded-shuffle.md.
 *
 * A session's seed is stored with the session (packages/contracts/src/session.ts), and the
 * architecture plan, section 8, asks that the same seed always give the same order: that is what
 * lets a session resume mid-way and show the same cards. So the generator here must never change
 * once sessions exist. A different generator, hash or shuffle would reorder every stored session.
 *
 * Nothing in this file is cryptographic, and nothing in it may be used for codes, keys or ids.
 * Those come from crypto.getRandomValues and crypto.randomUUID.
 */

/**
 * FNV-1a, 32 bits, over the UTF-16 code units of the text: the step that turns a seed string into
 * the 32-bit number the generator starts from. Published known answers: '' hashes to 0x811c9dc5
 * and 'a' to 0xe40c292c; the tests check both.
 */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * mulberry32 (Tommy Ettinger, public domain): 32 bits of state, one addition and a handful of
 * multiplies and shifts per number. Short enough to read in a minute and good enough to shuffle a
 * deck; its period is 2^32 numbers, and a session draws fewer than a hundred.
 *
 * Returns a function that gives the next unsigned 32-bit integer. The published version divides by
 * 2^32 to give a fraction; the integer is kept here because the shuffle wants a whole number, and
 * the tests compare against the published outputs multiplied back up.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

/**
 * The Fisher-Yates shuffle, driven by the seed: walk from the last position down, and at each one
 * swap in a card drawn from the positions not yet fixed. Every order is equally likely, up to a
 * bias of at most n in 2^32 from the remainder operation, which for a deck of a hundred cards is
 * under one in forty million.
 *
 * Returns a new array; the input is never changed. The same seed gives the same order, always.
 */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const next = mulberry32(hashSeed(seed));
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = next() % (i + 1);
    // Both positions are inside the array; the assertions only tell the type checker so.
    const moved = out[i]!;
    out[i] = out[j]!;
    out[j] = moved;
  }
  return out;
}

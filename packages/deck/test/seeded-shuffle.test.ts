import { describe, expect, it } from 'vitest';
import { hashSeed, mulberry32, seededShuffle } from '../src/index.ts';

const firstFour = (seed: number) => {
  const next = mulberry32(seed);
  return [next(), next(), next(), next()];
};

describe('the seeded shuffle', () => {
  it('the hash gives the published FNV-1a answers', () => {
    expect(hashSeed('')).toBe(0x811c9dc5);
    expect(hashSeed('a')).toBe(0xe40c292c);
    expect(hashSeed('foobar')).toBe(0xbf9cf968);
  });

  it('the generator gives the published mulberry32 numbers', () => {
    // Computed with the published implementation (fraction times 2^32). If this test fails, the
    // generator changed, and every stored session would show its cards in a different order.
    expect(firstFour(0)).toEqual([0x4434b462, 0x159c37, 0x39285b08, 0x256d8104]);
    expect(firstFour(1)).toEqual([0xa087eaf3, 0xb349c9, 0x8706c4eb, 0xfb2627fd]);
    expect(firstFour(0xdeadbeef)).toEqual([0xf0fd995a, 0x4466f0cf, 0xc5a3fa66, 0x5bb06c70]);
  });

  it('the shuffle is a permutation: every item once and nothing else', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const out = seededShuffle(items, 'any seed');
    expect(out).toHaveLength(items.length);
    expect([...out].sort()).toEqual(items);
  });

  it('the shuffle leaves the input untouched and returns a new array', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const out = seededShuffle(items, 'seed');
    expect(items).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(out).not.toBe(items);
  });

  it('the same seed gives the same order', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    expect(seededShuffle(items, '0123456789abcdef')).toEqual(
      seededShuffle(items, '0123456789abcdef'),
    );
  });

  it('different seeds give different orders', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
    expect(seededShuffle(items, 'first')).not.toEqual(seededShuffle(items, 'second'));
    const distinct = new Set<string>();
    for (let s = 0; s < 50; s++) distinct.add(seededShuffle(items, `seed-${s}`).join(','));
    expect(distinct.size).toBeGreaterThan(45);
  });

  it('an empty list and a single item shuffle to themselves', () => {
    expect(seededShuffle([], 'seed')).toEqual([]);
    expect(seededShuffle(['only'], 'seed')).toEqual(['only']);
  });

  it('over many seeds every item lands in every position about equally often', () => {
    // 6 items, 3000 seeds: 500 expected per cell. A broken Fisher-Yates (the classic mistake of
    // drawing from the whole array at every step) skews cells by far more than the 20% allowed.
    const items = ['a', 'b', 'c', 'd', 'e', 'f'];
    const rounds = 3000;
    const counts = new Map(items.map((item) => [item, new Array<number>(items.length).fill(0)]));
    for (let s = 0; s < rounds; s++) {
      seededShuffle(items, `seed-${s}`).forEach((item, position) => {
        const row = counts.get(item)!;
        row[position] = (row[position] ?? 0) + 1;
      });
    }
    const expected = rounds / items.length;
    for (const row of counts.values()) {
      for (const count of row) {
        expect(count).toBeGreaterThan(expected * 0.8);
        expect(count).toBeLessThan(expected * 1.2);
      }
    }
  });
});

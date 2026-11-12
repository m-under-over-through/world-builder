import { describe, expect, it } from 'vitest';
import { codeFromValue, valueFromHash } from '../src/lib/identity.ts';
import {
  invitationText,
  newLinkSet,
  newValue,
  SPARE_LINKS,
  VALUE_ALPHABET,
  VALUE_LENGTH,
  type Random,
} from '../src/lib/invitations.ts';
import { findWorkshop } from '../src/lib/workshops.ts';

/**
 * The links of the invitation page (ADR 0021; learning note 12). The random bytes are handed in,
 * so the tests know what each value must be.
 */
const SLUG = 'rural-manufacturing';
const ORIGIN = 'https://example.test';
const copy = findWorkshop(SLUG)!.copy;

/** Bytes that come out as given, one array after another; the last repeats once the list runs out. */
function fixed(...arrays: number[][]): Random {
  let i = 0;
  return (bytes) => {
    const next = arrays[Math.min(i++, arrays.length - 1)]!;
    bytes.set(next.slice(0, bytes.length));
    return bytes;
  };
}

/** Twenty bytes starting at `from`. */
const run = (from: number) => Array.from({ length: VALUE_LENGTH }, (_, k) => from + k);

describe('a link value', () => {
  it('the alphabet is 32 characters: lowercase letters and digits, without i, l, o and u', () => {
    expect(VALUE_ALPHABET).toHaveLength(32);
    expect(new Set(VALUE_ALPHABET).size).toBe(32);
    expect(VALUE_ALPHABET).toMatch(/^[a-z0-9]+$/);
    for (const lookAlike of 'ilou') expect(VALUE_ALPHABET).not.toContain(lookAlike);
  });

  it("a value is 20 characters of the alphabet, one for each random byte, and passes the link value's own check", async () => {
    const bytes = run(0).map((b, k) => (k % 2 ? b + 32 * 3 : b + 32 * 7));
    const value = newValue(fixed(bytes));
    expect(value).toHaveLength(20);
    expect(value).toBe(bytes.map((b) => VALUE_ALPHABET[b % 32]).join(''));
    // Byte 0 and byte 224 are both the first character; byte 255 is the last.
    expect(newValue(fixed([0, 224, 255, ...run(0).slice(3)])).slice(0, 3)).toBe('aa9');
    const set = newLinkSet(ORIGIN, SLUG, 'wave-1', fixed(run(0), run(40), run(80)));
    const hash = set.own.slice(set.own.indexOf('#'));
    expect(valueFromHash(hash)).toBe(set.own.split('#p=')[1]);
    expect(await codeFromValue(valueFromHash(hash)!)).toMatch(/^\d{16}$/);
  });

  it("with no random function handed in, values come from the browser's generator and differ", () => {
    const values = new Set(Array.from({ length: 50 }, () => newValue()));
    expect(values.size).toBe(50);
    for (const value of values) expect(value).toMatch(/^[a-hjkmnp-tv-z0-9]{20}$/);
  });
});

describe('a link set', () => {
  it('a link set is one own link and two spare links, all different, on the origin, the workshop and the wave of the page', () => {
    const set = newLinkSet(ORIGIN, SLUG, 'wave-1', fixed(run(0), run(40), run(80)));
    expect(SPARE_LINKS).toBe(2);
    expect(set.spares).toHaveLength(SPARE_LINKS);
    const links = [set.own, ...set.spares];
    expect(new Set(links).size).toBe(3);
    for (const link of links)
      expect(link).toMatch(new RegExp(`^${ORIGIN}/${SLUG}/join/wave-1#p=[${VALUE_ALPHABET}]{20}$`));
  });

  it('an equal pair of values, which practically never comes, is drawn again', () => {
    const set = newLinkSet(ORIGIN, SLUG, 'wave-1', fixed(run(0), run(0), run(40), run(80)));
    expect(new Set([set.own, ...set.spares]).size).toBe(3);
  });
});

describe('the invitation text', () => {
  const set = newLinkSet(ORIGIN, SLUG, 'wave-1', fixed(run(0), run(40), run(80)));

  it("the invitation's text carries the three links, each on a line of its own, and no slot is left unfilled", () => {
    const text = invitationText(copy, set);
    const lines = text.split('\n');
    for (const link of [set.own, ...set.spares]) expect(lines).toContain(link);
    expect(text).not.toMatch(/\[[^\]]*\]/);
    // Plain text: paragraphs joined by one empty line, nothing else between them.
    expect(text).not.toMatch(/\n{3}/);
    expect(text.indexOf(set.own)).toBeLessThan(text.indexOf(set.spares[0]!));
  });

  it("the copy file's block has a slot for the own link and for every spare SPARE_LINKS asks for, and for nothing more", () => {
    const block = copy.text('Invitation: text');
    const slots = block.match(/\[[^\]]+\]/g) ?? [];
    const wanted = [
      '[your link]',
      ...Array.from({ length: SPARE_LINKS }, (_, i) => `[spare link ${i + 1}]`),
    ];
    expect([...slots].sort()).toEqual([...wanted].sort());
    // Each slot is a paragraph of its own, so each link is a line of its own in the email.
    for (const slot of wanted) expect(copy.paragraphs('Invitation: text')).toContain(slot);
  });
});

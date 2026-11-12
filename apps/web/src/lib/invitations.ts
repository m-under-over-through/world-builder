import { fill, type Copy } from './copy.ts';

/**
 * The links of one invitation, made in the browser and kept nowhere (ADR 0021). A link set is
 * one own link and SPARE_LINKS spare links, each `<origin>/<slug>/join/<wave>#p=<value>`. The
 * value after `#` never reaches a server (ADR 0018); lib/identity.ts turns it into the code.
 *
 * Nothing remembers the values made before: with 100 random bits a repeat does not happen in
 * practice, so no list is needed. Learning note 12 (docs/learn/12-unique-without-a-list.md) has
 * the sums.
 */

/** Two spares, Marco's choice: the wave's cap is 150 (ADR 0021). */
export const SPARE_LINKS = 2;

/**
 * 32 characters: the lowercase letters and the digits, without the look-alikes i, l, o and u.
 * Letters and digits only, so no mail program cuts a mark off the end of a link (ADR 0021).
 */
export const VALUE_ALPHABET = 'abcdefghjkmnpqrstvwxyz0123456789';

/** 20 characters of 5 bits each: 100 random bits. */
export const VALUE_LENGTH = 20;

/** Fills an array with random bytes. `crypto.getRandomValues` in the app; fixed bytes in a test. */
export type Random = (bytes: Uint8Array) => Uint8Array;

/** The browser's strong generator, the one it uses for keys. Never Math.random, which is predictable. */
const strongRandom: Random = (bytes) => crypto.getRandomValues(bytes);

export interface LinkSet {
  own: string;
  spares: string[];
}

/**
 * One link value: one character for each random byte, the byte modulo 32. 256 is exactly 8
 * times 32, so every character is equally likely (learning note 12).
 */
export function newValue(random: Random = strongRandom): string {
  const bytes = random(new Uint8Array(VALUE_LENGTH));
  let value = '';
  for (const byte of bytes) value += VALUE_ALPHABET[byte % VALUE_ALPHABET.length];
  return value;
}

/** The address a link value opens: the join address of the wave, the value after `#p=`. */
function link(origin: string, slug: string, wave: string, value: string): string {
  return `${origin}/${slug}/join/${wave}#p=${value}`;
}

/**
 * A link set for the wave of the page, on the origin the page is served from, so staging makes
 * staging links. The values differ: an equal pair, which practically never comes, is drawn again.
 */
export function newLinkSet(
  origin: string,
  slug: string,
  wave: string,
  random: Random = strongRandom,
): LinkSet {
  const values = new Set<string>();
  while (values.size < 1 + SPARE_LINKS) values.add(newValue(random));
  const [own, ...spares] = [...values].map((value) => link(origin, slug, wave, value));
  return { own: own!, spares };
}

/** The slots of the block "Invitation: text" and the links that fill them. */
export function invitationSlots(set: LinkSet): Record<string, string> {
  const slots: Record<string, string> = { 'your link': set.own };
  set.spares.forEach((spare, i) => (slots[`spare link ${i + 1}`] = spare));
  return slots;
}

/**
 * The text of one invitation, as plain text to paste into an email: the block "Invitation:
 * text" of copy.md with its slots filled, its paragraphs joined by one empty line.
 */
export function invitationText(copy: Copy, set: LinkSet): string {
  return fill(copy.text('Invitation: text'), invitationSlots(set));
}

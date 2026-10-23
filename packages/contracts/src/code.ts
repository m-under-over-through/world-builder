import { z } from 'zod';

/**
 * The anonymous code: the only thing that identifies a participant.
 *
 * 16 random digits, shown as four groups of four. There are 10^16 possible codes, which is about
 * 53 bits of randomness: enough that guessing one is hopeless when the API rate-limits attempts,
 * and the server stores only a keyed hash of it (see docs/learn/02-codes-hashes-and-peppers.md).
 *
 * Why digits and not words: the phone shows a numeric keypad, there is nothing to spell, and the
 * format is the same in every language. Mullvad VPN uses the same idea for its accounts.
 */
export const CODE_DIGITS = 16;
export const CODE_GROUP = 4;

/** A normalised code: exactly 16 digits, no spaces. */
export const codeSchema = z
  .string()
  .regex(new RegExp(`^\\d{${CODE_DIGITS}}$`), `expected ${CODE_DIGITS} digits`);
export type Code = z.infer<typeof codeSchema>;

/** Strip the spaces, hyphens and dots people type or paste. Does not validate. */
export function normalizeCode(input: string): string {
  return input.replace(/[\s\-.]/g, '');
}

/** "1234567890123456" -> "1234 5678 9012 3456" for display. */
export function formatCode(code: string): string {
  const groups = code.match(new RegExp(`.{1,${CODE_GROUP}}`, 'g'));
  return groups ? groups.join(' ') : code;
}

/** Source of random bytes. Injectable so tests can check the generator with known bytes. */
export type RandomBytes = (count: number) => Uint8Array;

const webCryptoRandom: RandomBytes = (count) => {
  const bytes = new Uint8Array(count);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
};

/**
 * Generate a code with every digit equally likely.
 *
 * A random byte is 0..255. Taking `byte % 10` directly would make 0..5 slightly more likely than
 * 6..9, because 256 is not a multiple of 10. So bytes of 250 and above are thrown away (rejection
 * sampling); the remaining 0..249 map evenly onto the ten digits.
 */
export function generateCode(random: RandomBytes = webCryptoRandom): Code {
  let out = '';
  while (out.length < CODE_DIGITS) {
    for (const byte of random(32)) {
      if (byte >= 250) continue;
      out += String(byte % 10);
      if (out.length === CODE_DIGITS) break;
    }
  }
  return out;
}

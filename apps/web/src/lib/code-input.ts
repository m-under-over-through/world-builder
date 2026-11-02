import { CODE_DIGITS, CODE_GROUP } from '@wb/contracts';

/**
 * What the enter-code field shows as the digits are typed or pasted: digits only, in groups of
 * four, and never more than sixteen (docs/screen-map.md, Enter code). Spaces, hyphens and dots
 * from a pasted code are dropped before grouping, so "1234-5678" and "12345678" read the same.
 * Pure, so it is tested without a browser; the field calls it on every input.
 */
export function groupDigits(typed: string): string {
  const digits = typed.replace(/\D/g, '').slice(0, CODE_DIGITS);
  const groups = digits.match(new RegExp(`.{1,${CODE_GROUP}}`, 'g'));
  return groups ? groups.join(' ') : '';
}

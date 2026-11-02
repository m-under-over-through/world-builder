/**
 * Answers are measured in code points, not UTF-16 units, so the limit never cuts an emoji in
 * half: a half emoji is a lone surrogate, which `sealAnswer` refuses (CRYPTO_BAD_TEXT).
 */
export function codePoints(text: string): number {
  let n = 0;
  for (const _ of text) n++;
  return n;
}

export function truncateCodePoints(text: string, max: number): string {
  return [...text].slice(0, max).join('');
}

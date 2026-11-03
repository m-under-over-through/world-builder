import { describe, expect, it } from 'vitest';
import { codePoints, truncateCodePoints } from '../src/lib/text.ts';

describe('answers are measured in code points', () => {
  it('counts an emoji as one and never cuts one in half', () => {
    expect(codePoints('ab\u{1F3ED}')).toBe(3);
    expect(truncateCodePoints('ab\u{1F3ED}cd', 3)).toBe('ab\u{1F3ED}');
    expect(truncateCodePoints('ab\u{1F3ED}cd', 2)).toBe('ab');
  });
});

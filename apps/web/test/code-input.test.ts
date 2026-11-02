import { describe, expect, it } from 'vitest';
import { groupDigits } from '../src/lib/code-input.ts';

describe('the enter-code field groups digits as they are typed', () => {
  it('shows groups of four with a space between them', () => {
    expect(groupDigits('1')).toBe('1');
    expect(groupDigits('1234')).toBe('1234');
    expect(groupDigits('12345')).toBe('1234 5');
    expect(groupDigits('1234567890123456')).toBe('1234 5678 9012 3456');
  });

  it('takes sixteen digits and no more', () => {
    expect(groupDigits('12345678901234567')).toBe('1234 5678 9012 3456');
    expect(groupDigits('1234 5678 9012 3456 7')).toBe('1234 5678 9012 3456');
  });

  it('keeps only digits from what is typed or pasted', () => {
    expect(groupDigits('1234-5678.9012 3456')).toBe('1234 5678 9012 3456');
    expect(groupDigits('abc')).toBe('');
    expect(groupDigits('')).toBe('');
  });
});

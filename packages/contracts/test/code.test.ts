import { describe, expect, it } from 'vitest';
import { CODE_DIGITS, codeSchema, formatCode, generateCode, normalizeCode } from '../src/index.ts';

describe('anonymous code', () => {
  it('generates 16 digits that pass the schema', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateCode();
      expect(code).toHaveLength(CODE_DIGITS);
      expect(codeSchema.safeParse(code).success).toBe(true);
    }
  });

  it('two generated codes differ', () => {
    expect(generateCode()).not.toBe(generateCode());
  });

  it('maps bytes 0..249 to digits and throws bytes 250..255 away', () => {
    // Bytes: 250..255 must be skipped; 0 -> "0", 9 -> "9", 10 -> "0", 249 -> "9".
    const scripted = [
      250, 251, 252, 253, 254, 255, 0, 9, 10, 249, 1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 13, 14,
    ];
    const random = () => Uint8Array.from(scripted);
    expect(generateCode(random)).toBe('0909123456781234');
  });

  it('keeps asking for bytes until it has enough digits', () => {
    let calls = 0;
    const random = () => {
      calls++;
      // Only three usable bytes per call; the rest are rejected.
      return Uint8Array.from([7, 7, 7, ...new Array(29).fill(255)]);
    };
    expect(generateCode(random)).toBe('7'.repeat(16));
    expect(calls).toBe(6); // 16 digits / 3 per call, rounded up
  });

  it('normalises spaces, hyphens and dots away', () => {
    expect(normalizeCode('1234 5678-9012.3456')).toBe('1234567890123456');
  });

  it('formats in groups of four', () => {
    expect(formatCode('1234567890123456')).toBe('1234 5678 9012 3456');
  });

  it('rejects anything that is not exactly 16 digits', () => {
    for (const bad of [
      '123456789012345',
      '12345678901234567',
      '1234 5678 9012 3456',
      'abcdefghijklmnop',
    ]) {
      expect(codeSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('anonymous code, broken random sources', () => {
  it('throws instead of spinning forever when the random source returns nothing', () => {
    expect(() => generateCode(() => new Uint8Array(0))).toThrow('no bytes');
  });

  it('copes with a source that returns fewer bytes than asked', () => {
    const random = () => Uint8Array.from([4, 2]);
    expect(generateCode(random)).toBe('42'.repeat(8));
  });
});

import { describe, expect, it } from 'vitest';
import { codeSchema } from '@wb/contracts';
import { codeFromValue, valueFromHash } from '../src/lib/identity.ts';

/**
 * Identity by the link (ADR 0018): the value after `#p=` and the code it makes. The vector below
 * was computed once (SHA-256 of "test-link-value-0001", read as a decimal number, last sixteen
 * digits) and is written here so the rule can never change without this test saying so: a change
 * would make every newsletter link a new participant.
 */
describe('the code a link value makes', () => {
  it('is the last sixteen digits of the SHA-256 digest read as a decimal number', async () => {
    // SHA-256("test-link-value-0001") = 2962da2473d9e045...dc6ef57
    expect(await codeFromValue('test-link-value-0001')).toBe('9173841926745943');
  });

  it('is the same on every device for the same value, different for another, and always a code', async () => {
    const a = await codeFromValue('abcd-1234_EFGH');
    expect(await codeFromValue('abcd-1234_EFGH')).toBe(a);
    expect(await codeFromValue('abcd-1234_EFGI')).not.toBe(a);
    expect(codeSchema.safeParse(a).success).toBe(true);
  });
});

describe('the value in the fragment', () => {
  it('reads #p=<value> from the fragment, with or without the #, among other parameters', () => {
    expect(valueFromHash('#p=abcd')).toBe('abcd');
    expect(valueFromHash('p=Ab3_x-9')).toBe('Ab3_x-9');
    expect(valueFromHash('#utm=x&p=abcd1234')).toBe('abcd1234');
  });

  it('accepts letters, digits, - and _ only, 4 to 80 of them', () => {
    expect(valueFromHash('#p=abc')).toBeNull();
    expect(valueFromHash(`#p=${'a'.repeat(4)}`)).toBe('aaaa');
    expect(valueFromHash(`#p=${'a'.repeat(80)}`)).toBe('a'.repeat(80));
    expect(valueFromHash(`#p=${'a'.repeat(81)}`)).toBeNull();
    expect(valueFromHash('#p=abc%20def')).toBeNull();
    expect(valueFromHash('#p=abc.def')).toBeNull();
    expect(valueFromHash('#p=')).toBeNull();
  });

  it('finds nothing without a fragment or without p', () => {
    expect(valueFromHash('')).toBeNull();
    expect(valueFromHash('#')).toBeNull();
    expect(valueFromHash('#q=abcd')).toBeNull();
    expect(valueFromHash('#pp=abcd')).toBeNull();
  });

  it('never reads a query: ?p= is not the fragment, so a value there makes no code', () => {
    expect(valueFromHash('?p=abcd1234')).toBeNull();
    expect(valueFromHash('#?p=abcd1234')).toBeNull();
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CLIENT_ERROR_CODES, ERROR_CODES } from '../src/index.ts';

// "Every failure has a name, and every name has a page." This test keeps that true.
describe('the runbook', () => {
  const runbook = readFileSync(new URL('../../../docs/runbook.md', import.meta.url), 'utf8');
  const headings = new Set(runbook.match(/^### (\S+)$/gm)?.map((h) => h.slice(4)) ?? []);

  it('has a heading for every server error code', () => {
    const missing = Object.keys(ERROR_CODES).filter((code) => !headings.has(code));
    expect(missing).toEqual([]);
  });

  it('has a heading for every client error code', () => {
    const missing = Object.keys(CLIENT_ERROR_CODES).filter((code) => !headings.has(code));
    expect(missing).toEqual([]);
  });

  it('has a heading for every crypto error code', () => {
    const cryptoSource = readFileSync(
      new URL('../../crypto/src/index.ts', import.meta.url),
      'utf8',
    );
    const codes = new Set(
      cryptoSource.match(/'CRYPTO_[A-Z_]+'/g)?.map((c) => c.slice(1, -1)) ?? [],
    );
    expect(codes.size).toBeGreaterThan(0);
    const missing = [...codes].filter((code) => !headings.has(code));
    expect(missing).toEqual([]);
  });
});

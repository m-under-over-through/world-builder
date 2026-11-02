import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../pepper.ts', import.meta.url));

function pepper(args: string[]) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
}

describe('pepper', () => {
  it('writes 32 random bytes in base64 to a file only the owner can read, and never prints them', () => {
    const out = mkdtempSync(join(tmpdir(), 'wb-pepper-'));
    const run = pepper(['staging', '--out', out]);
    expect(run.status, run.stderr).toBe(0);

    const file = join(out, 'staging.pepper');
    expect(readdirSync(out)).toEqual(['staging.pepper']);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(out).mode & 0o777).toBe(0o700);

    const text = readFileSync(file, 'utf8');
    expect(text.endsWith('\n')).toBe(true);
    const value = text.trim();
    expect(value).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(Buffer.from(value, 'base64')).toHaveLength(32);
    expect(run.stdout).toContain('pepper written to');
    expect(run.stdout).toContain('(not shown)');
    expect(run.stdout).not.toContain(value);
    expect(run.stderr).not.toContain(value);
  });

  it('gives a different pepper every time', () => {
    const out = mkdtempSync(join(tmpdir(), 'wb-pepper-'));
    expect(pepper(['one', '--out', out]).status).toBe(0);
    expect(pepper(['two', '--out', out]).status).toBe(0);
    expect(readFileSync(join(out, 'one.pepper'), 'utf8')).not.toBe(
      readFileSync(join(out, 'two.pepper'), 'utf8'),
    );
  });

  it('refuses to overwrite an existing pepper and leaves it untouched', () => {
    const out = mkdtempSync(join(tmpdir(), 'wb-pepper-'));
    expect(pepper(['production', '--out', out]).status).toBe(0);
    const before = readFileSync(join(out, 'production.pepper'), 'utf8');
    const second = pepper(['production', '--out', out]);
    expect(second.status).toBe(1);
    expect(second.stderr).toContain('refusing to overwrite');
    expect(second.stderr).not.toContain(before.trim());
    expect(readFileSync(join(out, 'production.pepper'), 'utf8')).toBe(before);
  });

  it('rejects an unknown flag or a bad name without writing anything', () => {
    const out = mkdtempSync(join(tmpdir(), 'wb-pepper-'));
    for (const args of [
      ['staging', '--Out', out],
      ['staging', '--out'],
      ['staging', '--out', out, 'extra'],
      ['Staging', '--out', out],
      ['staging pepper', '--out', out],
      ['--out', out],
      [],
    ]) {
      const run = pepper(args);
      expect(run.status, args.join(' ')).toBe(2);
      expect(run.stderr).toContain('usage');
    }
    expect(readdirSync(out)).toEqual([]);
  });
});

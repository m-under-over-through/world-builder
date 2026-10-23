import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../keygen.ts', import.meta.url));

function keygen(args: string[]) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
}

describe('workshop keygen', () => {
  it('writes a development key only the owner can read, prints the public half, never the private one', () => {
    const out = mkdtempSync(join(tmpdir(), 'wb-keygen-'));
    const run = keygen(['demo', '--dev', '--out', out]);
    expect(run.status).toBe(0);

    const file = join(out, 'dev-demo.private-key');
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(out).mode & 0o777).toBe(0o700);

    const privateKey = readFileSync(file, 'utf8').trim();
    expect(privateKey).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    expect(run.stdout).toMatch(/public key:\s+[A-Za-z0-9+/]{43}=/);
    expect(run.stdout).toMatch(/fingerprint:\s+[0-9a-f]{4}(-[0-9a-f]{4}){3}/);
    expect(run.stdout).not.toContain(privateKey);
    expect(run.stderr).not.toContain(privateKey);
  });

  it('refuses to overwrite an existing key and leaves it untouched', () => {
    const out = mkdtempSync(join(tmpdir(), 'wb-keygen-'));
    expect(keygen(['demo', '--out', out]).status).toBe(0);
    const before = readFileSync(join(out, 'demo.private-key'), 'utf8');
    const second = keygen(['demo', '--out', out]);
    expect(second.status).toBe(1);
    expect(second.stderr).toContain('refusing to overwrite');
    expect(readFileSync(join(out, 'demo.private-key'), 'utf8')).toBe(before);
  });

  it('names a production key without the dev- prefix', () => {
    const out = mkdtempSync(join(tmpdir(), 'wb-keygen-'));
    expect(keygen(['demo', '--out', out]).status).toBe(0);
    expect(readdirSync(out)).toEqual(['demo.private-key']);
  });

  it('rejects an unknown flag or a bad slug without writing anything', () => {
    const out = mkdtempSync(join(tmpdir(), 'wb-keygen-'));
    for (const args of [
      ['demo', '--Dev', '--out', out],
      ['demo', '--dev=true', '--out', out],
      ['Demo', '--out', out],
      ['ab', '--out', out],
      [],
    ]) {
      const run = keygen(args);
      expect(run.status).toBe(2);
      expect(run.stderr).toContain('usage');
    }
    expect(readdirSync(out)).toEqual([]);
  });
});

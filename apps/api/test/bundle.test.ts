// The deployed function is one file made by tools/ops/bundle-api.ts. These tests prove what that
// file is allowed to contain and that it answers on its own, outside the test runner, the way the
// runbook says it does when the database is unreachable or a secret is missing
// (docs/learn/07-bundling-the-function.md).
import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleApi } from '../../../tools/ops/bundle-api.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const ENTRY = join(root, 'netlify/functions/api.mts');
// The bytes of "development-pepper-not-for-prod!", 32 of them; the same value apps/api/dev.ts uses.
const DEV_PEPPER = 'ZGV2ZWxvcG1lbnQtcGVwcGVyLW5vdC1mb3ItcHJvZCE=';

/** Every module specifier a file imports or re-exports, static and dynamic, types included. */
function specifiersOf(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const found: string[] = [];
  for (const m of text.matchAll(/^\s*(?:import|export)\b[^'"]*?from\s+['"]([^'"]+)['"]/gm))
    found.push(m[1]!);
  for (const m of text.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) found.push(m[1]!);
  for (const m of text.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) found.push(m[1]!);
  return found;
}

/** Resolves a workspace package specifier (`@wb/<name>` or `@wb/<name>/<entry>`) through its package.json exports. */
function resolveWorkspace(specifier: string): string {
  const [, name, ...rest] = specifier.split('/');
  const dir = join(root, 'packages', name!);
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
    exports: Record<string, string>;
  };
  const entry = rest.length === 0 ? '.' : `./${rest.join('/')}`;
  const target = manifest.exports[entry];
  if (!target) throw new Error(`${specifier}: no export "${entry}" in ${name}/package.json`);
  return resolve(dir, target);
}

/** Walks the static import graph from the function entry. Returns the repository files reached and the bare package specifiers seen. */
function importGraph(entry: string): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    for (const spec of specifiersOf(file)) {
      if (spec.startsWith('.')) queue.push(resolve(dirname(file), spec));
      else if (spec.startsWith('@wb/')) queue.push(resolveWorkspace(spec));
      else packages.add(spec);
    }
  }
  return { files, packages };
}

describe('the function import graph', () => {
  const graph = importGraph(ENTRY);
  const relative = [...graph.files].map((f) => f.slice(root.length));

  it('reaches the app, the contracts and the Neon connector', () => {
    expect(relative).toContain('apps/api/src/app.ts');
    expect(relative).toContain('packages/contracts/src/index.ts');
    expect(relative).toContain('packages/db/src/neon.ts');
    for (const file of graph.files) expect(existsSync(file), `${file} exists`).toBe(true);
  });

  it('never reaches PGlite or the tools-only connector', () => {
    expect(relative).not.toContain('packages/db/src/connect.ts');
    const pglite = [...graph.packages].filter((p) => p.includes('pglite'));
    expect(pglite).toEqual([]);
  });

  it('never reaches the crypto package (the API never sees plain text)', () => {
    expect(relative.filter((f) => f.startsWith('packages/crypto/'))).toEqual([]);
    expect([...graph.packages].filter((p) => p === '@wb/crypto' || p === 'tweetnacl')).toEqual([]);
  });
});

describe('the bundled function', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'wb-bundle-'));
  const runner = join(outDir, 'run.mjs');
  let text = '';

  beforeAll(async () => {
    const file = await bundleApi({ outDir, commitRef: 'abc1234def5678' });
    text = readFileSync(file, 'utf8');
    // Runs the bundle in plain Node, no test runner: one request, the status and body as JSON.
    writeFileSync(
      runner,
      [
        "const mod = await import('./api.mjs');",
        'const [path, method = "GET"] = process.argv.slice(2);',
        "const init = method === 'GET' ? {} : { method, body: '{}', headers: { 'content-type': 'application/json' } };",
        'const res = await mod.default(new Request(`http://localhost${path}`, init));',
        'console.log(JSON.stringify({ status: res.status, body: await res.json() }));',
      ].join('\n'),
    );
  }, 60_000);

  /** The environment the bundle runs with: the test runner's, minus the two secrets, plus what the case sets. */
  function run(path: string, vars: Record<string, string>, method = 'GET') {
    const env = { ...process.env, ...vars };
    for (const name of ['DATABASE_URL', 'WB_PEPPER']) if (!(name in vars)) delete env[name];
    const out = execFileSync(process.execPath, [runner, path, method], {
      encoding: 'utf8',
      timeout: 30_000,
      env,
      stdio: ['ignore', 'pipe', 'pipe'], // the function logs its reason to stderr; keep the test output clean
    });
    return JSON.parse(out.trim().split('\n').pop()!) as {
      status: number;
      body: Record<string, unknown>;
    };
  }

  it('is one file that carries neither PGlite nor the crypto package', () => {
    expect(text).not.toMatch(/pglite/i);
    expect(text).not.toMatch(/tweetnacl|@wb\/crypto|crypto_box/);
  });

  it('answers health with 503, ok false and the baked-in version when the database is unreachable', () => {
    const { status, body } = run('/api/health', {
      DATABASE_URL: 'postgres://wb:nobody@db.invalid/neondb', // .invalid never resolves (RFC 2606)
      WB_PEPPER: DEV_PEPPER,
    });
    expect(status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.dbReachable).toBe(false);
    expect(body.version).toBe('abc1234');
  }, 30_000);

  it('answers every path with 503 SERVER_NOT_CONFIGURED when DATABASE_URL is not set', () => {
    const health = run('/api/health', { WB_PEPPER: DEV_PEPPER });
    expect(health.status).toBe(503);
    expect(health.body.error).toBe('SERVER_NOT_CONFIGURED');
    expect(health.body.ok).toBeUndefined(); // the function answers, not the app
    const join = run('/api/rural-manufacturing/join', { WB_PEPPER: DEV_PEPPER }, 'POST');
    expect(join.status).toBe(503);
    expect(join.body.error).toBe('SERVER_NOT_CONFIGURED');
  }, 30_000);

  it('answers 503 SERVER_NOT_CONFIGURED when the pepper is missing or not 32 bytes', () => {
    const url = { DATABASE_URL: 'postgres://wb:nobody@db.invalid/neondb' };
    expect(run('/api/health', url).body.error).toBe('SERVER_NOT_CONFIGURED');
    expect(run('/api/health', { ...url, WB_PEPPER: 'dG9vIHNob3J0' }).body.error).toBe(
      'SERVER_NOT_CONFIGURED',
    );
  }, 30_000);
});

// Generate a pepper: 32 random bytes in base64, the key of the keyed hash that stores codes
// (ADR 0002). One per deploy context, set as WB_PEPPER in Netlify and kept in the vault.
//
//   node tools/ops/pepper.ts <name>              writes .secrets/<name>.pepper (mode 600), prints nothing secret
//   node tools/ops/pepper.ts <name> --out <dir>  writes somewhere else (used by the tests)
//
// Never printed: copy it with `pbcopy < .secrets/<name>.pepper`, paste into Netlify and the vault,
// then delete the file. Losing a pepper makes every stored code unmatchable, so it is backed up
// like a private key. An existing file is never overwritten: move it away first if you mean to
// replace the pepper, and remember that every code stored under the old one stops matching.

import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const USAGE = 'usage: node tools/ops/pepper.ts <name> [--out <dir>]';
function fail(message: string, exitCode: number): never {
  console.error(message);
  process.exit(exitCode);
}

// ---- arguments: anything unexpected is an error ----

const args = process.argv.slice(2);
const name = args.shift();
let outDir: string | undefined;
while (args.length > 0) {
  const flag = args.shift();
  if (flag === '--out' && args.length > 0) outDir = resolve(args.shift()!);
  else fail(`unknown argument "${flag}"\n${USAGE}`, 2);
}
if (!name || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) fail(USAGE, 2);

const dir = outDir ?? fileURLToPath(new URL('../../.secrets/', import.meta.url));
const file = join(dir, `${name}.pepper`);
const pepper = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
mkdirSync(dir, { recursive: true, mode: 0o700 });
chmodSync(dir, 0o700); // mkdir's mode applies only when it creates the directory
try {
  // 'wx' is O_CREAT | O_EXCL: create the file, fail if anything already exists at that path,
  // symlinks included. No check-then-write gap.
  writeFileSync(file, pepper + '\n', { mode: 0o600, flag: 'wx' });
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
    fail(
      `refusing to overwrite ${file}; move it away first if you really mean to replace the pepper`,
      1,
    );
  }
  throw error;
}
chmodSync(file, 0o600);
console.log(`pepper written to ${file} (not shown)`);
console.log(
  'next: pbcopy < that file; paste as WB_PEPPER in Netlify for the right context and into the vault; then rm the file',
);

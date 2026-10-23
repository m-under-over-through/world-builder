// Generate the key pair for a workshop.
//
//   node tools/workshop/keygen.ts <slug>              production key -> .secrets/<slug>.private-key
//   node tools/workshop/keygen.ts <slug> --dev        development key -> .secrets/dev-<slug>.private-key
//   ... --out <dir>                                   write somewhere else (used by the tests)
//
// The private key is written to a file only you can read (mode 600), created exclusively so an
// existing file or a planted symlink is refused, and it is never printed: it never ends up in a
// terminal log or a chat transcript. The public key and fingerprint are printed; paste them into
// workshops/<slug>/workshop.json. Procedure: docs/learn/01-sealed-boxes.md.

import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { slugLikeSchema } from '../../packages/contracts/src/index.ts';
import { fingerprint, generateKeyPair } from '../../packages/crypto/src/index.ts';

const USAGE = 'usage: node tools/workshop/keygen.ts <slug> [--dev] [--out <dir>]';

function fail(message: string, exitCode: number): never {
  console.error(message);
  process.exit(exitCode);
}

// ---- arguments: anything unexpected is an error, so a typo cannot silently make a production key ----

const args = process.argv.slice(2);
const slug = args.shift();
let dev = false;
let outDir: string | undefined;
while (args.length > 0) {
  const flag = args.shift();
  if (flag === '--dev') dev = true;
  else if (flag === '--out' && args.length > 0) outDir = resolve(args.shift()!);
  else fail(`unknown argument "${flag}"\n${USAGE}`, 2);
}
if (!slug || !slugLikeSchema.min(3).safeParse(slug).success) fail(USAGE, 2);

// ---- where the key goes: next to the repository root, not wherever the command was run from ----

const dir = outDir ?? fileURLToPath(new URL('../../.secrets/', import.meta.url));
const file = join(dir, `${dev ? 'dev-' : ''}${slug}.private-key`);

const kp = generateKeyPair();
const fp = fingerprint(kp.publicKey);

mkdirSync(dir, { recursive: true, mode: 0o700 });
chmodSync(dir, 0o700); // mkdir's mode applies only when it creates the directory
try {
  // 'wx' is O_CREAT | O_EXCL: create the file, fail if anything already exists at that path,
  // symlinks included. No check-then-write gap.
  writeFileSync(file, kp.privateKey + '\n', { mode: 0o600, flag: 'wx' });
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
    fail(
      `refusing to overwrite ${file}; move it away first if you really mean to replace the key`,
      1,
    );
  }
  throw error;
}
chmodSync(file, 0o600);

console.log(`workshop:        ${slug}${dev ? ' (development key)' : ''}`);
console.log(`public key:      ${kp.publicKey}`);
console.log(`fingerprint:     ${fp}`);
console.log(`private key:     written to ${file} (not shown)`);
console.log('');
console.log('next:');
console.log(`  1. put publicKey and keyFingerprint into workshops/${slug}/workshop.json`);
if (dev) {
  console.log('  2. keep the file; staging and tests use it; it is gitignored');
} else {
  console.log(
    '  2. store the private key in the vault under the workshop name, print two paper copies,',
  );
  console.log('     then delete the file: rm ' + file);
  console.log('  3. run the decrypt drill once the first sealed answer exists');
}

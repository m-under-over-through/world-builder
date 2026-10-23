// Generate the key pair for a workshop.
//
//   node tools/workshop/keygen.ts <slug>            production key, written to .secrets/<slug>.private-key
//   node tools/workshop/keygen.ts <slug> --dev      development key, written to .secrets/dev-<slug>.private-key
//
// The private key is written to a file only you can read (mode 600) and is never printed, so it
// never ends up in a terminal log or a chat transcript. The public key and its fingerprint are
// printed; paste them into workshops/<slug>/workshop.json. Procedure: docs/learn/01-sealed-boxes.md.

import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fingerprint, generateKeyPair } from '../../packages/crypto/src/index.ts';

const [slug, ...flags] = process.argv.slice(2);
if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
  console.error('usage: node tools/workshop/keygen.ts <slug> [--dev]');
  process.exit(2);
}
const dev = flags.includes('--dev');
const dir = join(process.cwd(), '.secrets');
const file = join(dir, `${dev ? 'dev-' : ''}${slug}.private-key`);

if (existsSync(file)) {
  console.error(
    `refusing to overwrite ${file}; move it away first if you really mean to replace the key`,
  );
  process.exit(1);
}

const kp = generateKeyPair();
const fp = fingerprint(kp.publicKey);

mkdirSync(dir, { recursive: true, mode: 0o700 });
writeFileSync(file, kp.privateKey + '\n', { mode: 0o600 });
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

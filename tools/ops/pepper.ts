// Generate a pepper: 32 random bytes in base64, the key of the keyed hash that stores codes
// (ADR 0002). One per deploy context, set as WB_PEPPER in Netlify and kept in the vault.
//
//   node tools/ops/pepper.ts <name>      writes .secrets/<name>.pepper (mode 600), prints nothing secret
//
// Never printed: copy it with `pbcopy < .secrets/<name>.pepper`, paste into Netlify and the vault,
// then delete the file. Losing a pepper makes every stored code unmatchable, so it is backed up
// like a private key.

import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const name = process.argv[2];
if (!name || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || process.argv.length > 3) {
  console.error('usage: node tools/ops/pepper.ts <name>');
  process.exit(2);
}
const dir = fileURLToPath(new URL('../../.secrets/', import.meta.url));
const file = join(dir, `${name}.pepper`);
const pepper = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
mkdirSync(dir, { recursive: true, mode: 0o700 });
chmodSync(dir, 0o700);
try {
  writeFileSync(file, pepper + '\n', { mode: 0o600, flag: 'wx' });
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
    console.error(`refusing to overwrite ${file}`);
    process.exit(1);
  }
  throw error;
}
console.log(`pepper written to ${file} (not shown)`);
console.log(
  'next: pbcopy < that file; paste as WB_PEPPER in Netlify for the right context and into the vault; then rm the file',
);

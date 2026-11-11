// Apply pending database migrations. Runs as the first step of the Netlify build, with the
// context's DATABASE_URL from the environment, so a connection string never needs to touch a
// laptop (ADR 0011). With no DATABASE_URL (a local build, a fork's preview) it does nothing.
//
//   node tools/ops/migrate.ts            no arguments; everything comes from the environment
//
// The value must be the plain connection string, which starts with postgres:// or postgresql://.
// Neon's Connect dialog also hands the string out as a `psql '...'` command and as a
// `DATABASE_URL='...'` line; pasted in one of those shapes, or wrapped in quotes, it is refused
// here, before anything is touched, and never printed (docs/runbook.md, the Netlify entry for this
// message). A string that starts right but does not parse as a URL is refused the same way: Neon's
// driver would otherwise quote it whole, password included, in the build log (packages/db/src/neon.ts).
// Anything on the command line is refused too: a flag this tool does not know could only mean the
// build command changed by mistake.

import { migrateNeonDatabase } from '../../packages/db/src/connect.ts';
import { assertNeonUrl } from '../../packages/db/src/neon.ts';

if (process.argv.length > 2) {
  console.error(
    `unknown argument "${process.argv[2]}"\nusage: node tools/ops/migrate.ts (no arguments; DATABASE_URL from the environment)`,
  );
  process.exit(2);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.log('migrate: DATABASE_URL not set, nothing to do');
  process.exit(0);
}
try {
  assertNeonUrl(url);
} catch {
  console.error('migrate: expected a postgres:// URL in this context');
  console.error(
    'migrate: DATABASE_URL must be the plain connection string: nothing in front of postgresql://, no quotes around it',
  );
  process.exit(1);
}
await migrateNeonDatabase(url);
console.log('migrate: database is up to date');

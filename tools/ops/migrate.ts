// Apply pending database migrations. Runs as the first step of the Netlify build, with the
// context's DATABASE_URL from the environment, so a connection string never needs to touch a
// laptop (ADR 0011). With no DATABASE_URL (a local build, a fork's preview) it does nothing.
//
//   node tools/ops/migrate.ts

import { migrateNeonDatabase } from '../../packages/db/src/index.ts';

const url = process.env.DATABASE_URL;
if (!url) {
  console.log('migrate: DATABASE_URL not set, nothing to do');
  process.exit(0);
}
if (!url.startsWith('postgres')) {
  console.error('migrate: expected a postgres:// URL in this context');
  process.exit(1);
}
await migrateNeonDatabase(url);
console.log('migrate: database is up to date');

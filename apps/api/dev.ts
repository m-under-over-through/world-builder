// A local server for the whole stack with no accounts: Postgres in a folder under .secrets/,
// the workshop folder loaded, wave-1 open, a fixed development pepper.
//
//   node apps/api/dev.ts            # API on http://localhost:8788
//
// The client's Vite dev server proxies /api to this. Nothing here is used in deployment.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { deckSchema, workshopConfigSchema } from '@wb/contracts';
import { connect, ensureWave, setWorkshopStatus, syncWorkshop } from '@wb/db';
import { createApp } from './src/app.ts';

const root = new URL('../../', import.meta.url);
const DEV_PEPPER = 'ZGV2ZWxvcG1lbnQtcGVwcGVyLW5vdC1mb3ItcHJvZCE='; // the bytes of "development-pepper-not-for-prod!", 32 of them; never used in deployment
const dbUrl = 'pglite://' + fileURLToPath(new URL('.secrets/local-db', root));

const db = await connect(dbUrl);
for (const slug of ['rural-manufacturing']) {
  const folder = new URL(`workshops/${slug}/`, root);
  const config = workshopConfigSchema.parse(
    JSON.parse(readFileSync(new URL('workshop.json', folder), 'utf8')),
  );
  const staging = JSON.parse(readFileSync(new URL('workshop.staging.json', folder), 'utf8'));
  const deck = deckSchema.parse(JSON.parse(readFileSync(new URL('deck.json', folder), 'utf8')));
  // Locally, seal to the development key so the export tool can open answers with .secrets/dev-<slug>.private-key.
  const { id } = await syncWorkshop(db, config, deck, {
    publicKey: staging.publicKey,
    keyFingerprint: staging.keyFingerprint,
  });
  await setWorkshopStatus(db, slug, 'open');
  await ensureWave(db, id, 'wave-1', 'local');
}

const app = createApp({ db, pepper: DEV_PEPPER, version: 'local' });
serve({ fetch: app.fetch, port: 8788 }, (info) => {
  console.log(
    `API listening on http://localhost:${info.port}/api/health (database in .secrets/local-db)`,
  );
});

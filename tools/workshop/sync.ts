// Load every workshop folder into the database (ADR 0004): settings, deck version, the public key
// for this deploy context, and the first wave. Upserts by slug, so it is safe to run on every
// deploy; counts and statuses that are already closed are never touched. Runs as the second step
// of the Netlify build after migrate.ts; with no DATABASE_URL it does nothing.
//
//   node tools/workshop/sync.ts

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  deckSchema,
  workshopStagingSchema,
  workshopConfigSchema,
} from '../../packages/contracts/src/index.ts';
import { connect } from '../../packages/db/src/connect.ts';
import {
  ensureWave,
  findWorkshop,
  setWorkshopStatus,
  syncWorkshop,
} from '../../packages/db/src/index.ts';

const url = process.env.DATABASE_URL;
if (!url) {
  console.log('sync: DATABASE_URL not set, nothing to do');
  process.exit(0);
}
// Production seals to the key in workshop.json; every other context to the staging key, so the
// public key the client embeds (VITE_WB_ENV) and the one the database records always agree.
const env = process.env.VITE_WB_ENV ?? process.env.WB_ENV ?? 'staging';

const root = fileURLToPath(new URL('../../', import.meta.url));
const db = await connect(url);
const folders = readdirSync(`${root}workshops`, { withFileTypes: true }).filter(
  (d) => d.isDirectory() && !d.name.startsWith('_'),
);
for (const folder of folders) {
  const dir = `${root}workshops/${folder.name}/`;
  const config = workshopConfigSchema.parse(
    JSON.parse(readFileSync(`${dir}workshop.json`, 'utf8')),
  );
  const deck = deckSchema.parse(JSON.parse(readFileSync(`${dir}deck.json`, 'utf8')));
  const stagingFile = `${dir}workshop.staging.json`;
  const staging =
    env !== 'production' && existsSync(stagingFile)
      ? workshopStagingSchema.parse(JSON.parse(readFileSync(stagingFile, 'utf8')))
      : null;
  const keys = staging ?? config;
  const opensDay = staging?.opensDay ?? config.opensDay;
  const { id } = await syncWorkshop(db, config, deck, {
    publicKey: keys.publicKey,
    keyFingerprint: keys.keyFingerprint,
    opensDay,
  });
  const row = await findWorkshop(db, config.slug);
  if (row && (row.status === 'draft' || row.status === 'open'))
    await setWorkshopStatus(db, config.slug, 'open');
  await ensureWave(db, id, 'wave-1', 'newsletter 1');
  console.log(
    `sync: ${config.slug} (${env}, key ${keys.keyFingerprint}, opens ${opensDay}) ${row?.status ?? 'new'} -> ${row && row.status !== 'draft' && row.status !== 'open' ? row.status : 'open'}`,
  );
}
process.exit(0);

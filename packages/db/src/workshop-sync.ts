import { eq } from 'drizzle-orm';
import type { WorkshopConfig, Deck } from '@wb/contracts';
import type { Db } from './connect.ts';
import { waves, workshops } from './schema.ts';

/**
 * A workshop is a folder in the repository (ADR 0004); the database holds a copy of its settings
 * so the API never reads the repository at runtime. `syncWorkshop` upserts by slug, which is what
 * the `workshop sync` tool runs after a deploy. Status is managed separately (open, close...).
 */
export async function syncWorkshop(
  db: Db,
  config: WorkshopConfig,
  deck: Deck,
  options: { publicKey?: string; keyFingerprint?: string } = {},
): Promise<{ id: string }> {
  const values = {
    slug: config.slug,
    name: config.name,
    publicKey: options.publicKey ?? config.publicKey,
    keyFingerprint: options.keyFingerprint ?? config.keyFingerprint,
    deckVersion: deck.version,
    warmupsPerSession: config.warmupsPerSession,
    checkpointsPerSession: config.checkpointsPerSession,
    invitesPerParticipant: config.invitesPerParticipant,
    cap: config.cap,
    opensDay: config.opensDay,
    closesDay: config.closesDay,
    deleteDay: config.deleteDay,
  };
  const [row] = await db
    .insert(workshops)
    .values(values)
    .onConflictDoUpdate({ target: workshops.slug, set: values })
    .returning({ id: workshops.id });
  return { id: row!.id };
}

export async function setWorkshopStatus(
  db: Db,
  slug: string,
  status: 'draft' | 'open' | 'closed' | 'exported' | 'deleted',
) {
  await db.update(workshops).set({ status }).where(eq(workshops.slug, slug));
}

/** Creates a wave if it does not exist. Counts are never reset. */
export async function ensureWave(
  db: Db,
  workshopId: string,
  wave: string,
  label: string,
): Promise<void> {
  await db
    .insert(waves)
    .values({ workshopId, wave, label })
    .onConflictDoNothing({ target: [waves.workshopId, waves.wave] });
}

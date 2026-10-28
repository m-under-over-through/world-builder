import { readFileSync } from 'node:fs';
import { deckSchema, workshopConfigSchema } from '@wb/contracts';
import { connect, ensureWave, setWorkshopStatus, syncWorkshop, type Db } from '../src/index.ts';

/** A fresh in-memory Postgres with the migrations applied. One per test keeps tests independent. */
export async function freshDb(): Promise<Db> {
  return connect('pglite://memory');
}

const folder = new URL('../../../workshops/rural-manufacturing/', import.meta.url);
export const realWorkshop = workshopConfigSchema.parse(
  JSON.parse(readFileSync(new URL('workshop.json', folder), 'utf8')),
);
export const realDeck = deckSchema.parse(
  JSON.parse(readFileSync(new URL('deck.json', folder), 'utf8')),
);

/** Loads the real workshop folder under a slug, opens it, and adds wave-1. Returns the workshop row id. */
export async function seedWorkshop(
  db: Db,
  slug = realWorkshop.slug,
  overrides: Partial<typeof realWorkshop> = {},
): Promise<string> {
  const { id } = await syncWorkshop(db, { ...realWorkshop, ...overrides, slug }, realDeck);
  await setWorkshopStatus(db, slug, 'open');
  await ensureWave(db, id, 'wave-1', 'first newsletter');
  return id;
}

export const DAY = '2026-11-16';
export const uuid = () => crypto.randomUUID();
/** A stand-in for a code or token hash; the API makes real ones. */
export const hash = (s: string) => s.padEnd(64, '0');

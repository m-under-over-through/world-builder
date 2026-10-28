import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { syncWorkshop, workshops } from '../src/index.ts';
import { freshDb, realDeck, realWorkshop } from './helpers.ts';

describe('workshop sync and the opening day', () => {
  it('stores an earlier opening day when the sync passes one, and the folder day when it does not', async () => {
    const db = await freshDb();
    await syncWorkshop(db, realWorkshop, realDeck, { opensDay: '2026-10-28' });
    const [early] = await db.select().from(workshops).where(eq(workshops.slug, realWorkshop.slug));
    expect(early?.opensDay).toBe('2026-10-28');
    expect(early?.closesDay).toBe(realWorkshop.closesDay);
    // A later sync without the override puts the real day back: the folder is the source of truth.
    await syncWorkshop(db, realWorkshop, realDeck);
    const [real] = await db.select().from(workshops).where(eq(workshops.slug, realWorkshop.slug));
    expect(real?.opensDay).toBe(realWorkshop.opensDay);
  });
});

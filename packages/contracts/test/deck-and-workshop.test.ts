import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deckSchema, workshopConfigSchema } from '../src/index.ts';

const validWorkshop = {
  slug: 'example',
  name: 'Example',
  organizer: 'Someone',
  purpose: 'Testing',
  warmupsPerSession: 3,
  checkpointsPerSession: 1,
  invitesPerParticipant: 3,
  cap: 150,
  opensDay: '2026-11-16',
  closesDay: '2026-12-06',
  deleteDay: '2027-02-05',
  publicKey: 'A'.repeat(43) + '=',
  keyFingerprint: 'ab12-cd34-ef56-7890',
};

describe('deck', () => {
  it('rejects duplicate card ids', () => {
    const deck = {
      version: '0.1',
      cards: [
        { id: 'a', set: 'warmup', text: 'A?' },
        { id: 'a', set: 'checkpoint', text: 'A again?' },
      ],
    };
    const result = deckSchema.safeParse(deck);
    expect(result.success).toBe(false);
  });

  it('needs at least one warm-up and one checkpoint', () => {
    const onlyWarmups = {
      version: '0.1',
      cards: [
        { id: 'a', set: 'warmup', text: 'A?' },
        { id: 'b', set: 'warmup', text: 'B?' },
      ],
    };
    expect(deckSchema.safeParse(onlyWarmups).success).toBe(false);
  });
});

describe('workshop config', () => {
  it('accepts a well-formed config', () => {
    expect(workshopConfigSchema.safeParse(validWorkshop).success).toBe(true);
  });

  it('requires open <= close < delete', () => {
    expect(
      workshopConfigSchema.safeParse({ ...validWorkshop, closesDay: '2026-11-15' }).success,
    ).toBe(false);
    expect(
      workshopConfigSchema.safeParse({ ...validWorkshop, deleteDay: '2026-12-06' }).success,
    ).toBe(false);
  });

  it('requires at least one card per session', () => {
    expect(
      workshopConfigSchema.safeParse({
        ...validWorkshop,
        warmupsPerSession: 0,
        checkpointsPerSession: 0,
      }).success,
    ).toBe(false);
  });

  it('requires a 32-byte base64 public key and a grouped fingerprint', () => {
    expect(
      workshopConfigSchema.safeParse({ ...validWorkshop, publicKey: 'not-a-key' }).success,
    ).toBe(false);
    expect(
      workshopConfigSchema.safeParse({ ...validWorkshop, keyFingerprint: 'ab12cd34ef567890' })
        .success,
    ).toBe(false);
  });
});

describe('the first workshop folder', () => {
  const dir = new URL('../../../workshops/rural-manufacturing/', import.meta.url);
  const read = (name: string) => JSON.parse(readFileSync(new URL(name, dir), 'utf8'));

  it('has a valid deck.json', () => {
    const result = deckSchema.safeParse(read('deck.json'));
    expect(result.error?.issues ?? []).toEqual([]);
    expect(result.success).toBe(true);
  });

  it('has a valid workshop.json', () => {
    const result = workshopConfigSchema.safeParse(read('workshop.json'));
    expect(result.error?.issues ?? []).toEqual([]);
    expect(result.success).toBe(true);
  });
});

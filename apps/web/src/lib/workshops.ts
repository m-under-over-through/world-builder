import {
  deckSchema,
  stagingKeysSchema,
  workshopConfigSchema,
  type Deck,
  type WorkshopConfig,
} from '@wb/contracts';

/**
 * Every workshop folder is bundled at build time (ADR 0004): the settings, the deck, and the
 * public key answers are sealed to. Which key depends on the deploy context: production builds
 * use the key in workshop.json; staging and local builds use workshop.staging.json, so drills
 * open with the development private key and the production key never leaves the vault.
 */
const configs = import.meta.glob('../../../../workshops/*/workshop.json', {
  eager: true,
  import: 'default',
});
const stagings = import.meta.glob('../../../../workshops/*/workshop.staging.json', {
  eager: true,
  import: 'default',
});
const decks = import.meta.glob('../../../../workshops/*/deck.json', {
  eager: true,
  import: 'default',
});

export const ENV: 'production' | 'staging' | 'local' =
  (import.meta.env.VITE_WB_ENV as 'production' | 'staging') ?? 'local';
export const VERSION: string = import.meta.env.VITE_COMMIT_REF?.slice(0, 7) ?? 'local';

export interface Workshop {
  config: WorkshopConfig;
  deck: Deck;
  publicKey: string;
  keyFingerprint: string;
}

const bySlug = new Map<string, Workshop>();
for (const [path, raw] of Object.entries(configs)) {
  const slug = path.split('/').at(-2)!;
  const config = workshopConfigSchema.parse(raw);
  const deck = deckSchema.parse(decks[path.replace('workshop.json', 'deck.json')]);
  const stagingRaw = stagings[path.replace('workshop.json', 'workshop.staging.json')];
  const staging = stagingRaw ? stagingKeysSchema.parse(stagingRaw) : null;
  const keys = ENV === 'production' || !staging ? config : staging;
  bySlug.set(slug, {
    config,
    deck,
    publicKey: keys.publicKey,
    keyFingerprint: keys.keyFingerprint,
  });
}

export function findWorkshop(slug: string): Workshop | undefined {
  return bySlug.get(slug);
}

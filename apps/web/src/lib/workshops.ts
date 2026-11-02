import {
  deckSchema,
  workshopStagingSchema,
  workshopConfigSchema,
  type Deck,
  type WorkshopConfig,
} from '@wb/contracts';
import { Copy } from './copy.ts';

/**
 * Every workshop folder is bundled at build time (ADR 0004): the settings, the deck, the copy, and
 * the public key answers are sealed to. Which key depends on the deploy context: production builds
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
// The words, as text (`?raw`), parsed once here (lib/copy.ts); a component only looks blocks up.
const copies = import.meta.glob('../../../../workshops/*/copy.md', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>;

export const ENV: 'production' | 'staging' | 'local' =
  (import.meta.env.VITE_WB_ENV as 'production' | 'staging') ?? 'local';
export const VERSION: string = import.meta.env.VITE_COMMIT_REF?.slice(0, 7) ?? 'local';

export interface Workshop {
  config: WorkshopConfig;
  deck: Deck;
  copy: Copy;
  publicKey: string;
  keyFingerprint: string;
  /** The day this deploy context opens: the folder's day, or the earlier one workshop.staging.json names outside production. */
  opensDay: string;
}

const bySlug = new Map<string, Workshop>();
for (const [path, raw] of Object.entries(configs)) {
  const slug = path.split('/').at(-2)!;
  const config = workshopConfigSchema.parse(raw);
  const deck = deckSchema.parse(decks[path.replace('workshop.json', 'deck.json')]);
  const copy = Copy.parse(copies[path.replace('workshop.json', 'copy.md')] ?? '');
  const stagingRaw = stagings[path.replace('workshop.json', 'workshop.staging.json')];
  const staging = stagingRaw ? workshopStagingSchema.parse(stagingRaw) : null;
  const keys = ENV === 'production' || !staging ? config : staging;
  bySlug.set(slug, {
    config,
    deck,
    copy,
    publicKey: keys.publicKey,
    keyFingerprint: keys.keyFingerprint,
    opensDay: (ENV !== 'production' && staging?.opensDay) || config.opensDay,
  });
}

export function findWorkshop(slug: string): Workshop | undefined {
  return bySlug.get(slug);
}

/**
 * The words to use before a workshop is known: "Loading…" and "This address is not a workshop".
 * They are the same in every workshop folder, so the first folder's copy serves; a deploy with no
 * workshop folder at all shows the visible missing-block markers instead.
 */
export function defaultCopy(): Copy {
  const first = [...bySlug.keys()].sort()[0];
  return first ? bySlug.get(first)!.copy : new Copy([]);
}

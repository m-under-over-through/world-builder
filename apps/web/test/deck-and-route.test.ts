import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deckSchema, workshopConfigSchema } from '@wb/contracts';
import { codePoints, sessionCards, truncateCodePoints } from '../src/lib/deck.ts';
import { countsAsOpen, parseArrival, parseRoute } from '../src/lib/route.ts';

const folder = new URL('../../../workshops/rural-manufacturing/', import.meta.url);
const config = workshopConfigSchema.parse(
  JSON.parse(readFileSync(new URL('workshop.json', folder), 'utf8')),
);
const deck = deckSchema.parse(JSON.parse(readFileSync(new URL('deck.json', folder), 'utf8')));

describe('session cards', () => {
  it('gives W warm-ups then C checkpoints from the workshop settings', () => {
    const cards = sessionCards(deck, config, new Set());
    expect(cards).toHaveLength(config.warmupsPerSession + config.checkpointsPerSession);
    expect(cards.slice(0, config.warmupsPerSession).every((c) => c.set === 'warmup')).toBe(true);
    expect(cards.slice(config.warmupsPerSession).every((c) => c.set === 'checkpoint')).toBe(true);
  });

  it('prefers cards not yet answered and cycles back when a set is exhausted', () => {
    const warmups = deck.cards.filter((c) => c.set === 'warmup').map((c) => c.id);
    const second = sessionCards(deck, config, new Set(warmups.slice(0, 3)));
    expect(second.slice(0, 3).map((c) => c.id)).toEqual(
      warmups.slice(3, 6).concat(warmups.slice(0, Math.max(0, 3 - (warmups.length - 3)))),
    );
    const exhausted = sessionCards(deck, config, new Set(warmups));
    expect(exhausted.slice(0, 3).map((c) => c.id)).toEqual(warmups.slice(0, 3));
  });
});

describe('answers are measured in code points', () => {
  it('counts an emoji as one and never cuts one in half', () => {
    expect(codePoints('ab\u{1F3ED}')).toBe(3);
    expect(truncateCodePoints('ab\u{1F3ED}cd', 3)).toBe('ab\u{1F3ED}');
    expect(truncateCodePoints('ab\u{1F3ED}cd', 2)).toBe('ab');
  });
});

describe('routes', () => {
  it('reads the slug, a wave link, an invite link, and the panel', () => {
    expect(parseRoute('/rural-manufacturing/')).toEqual({ slug: 'rural-manufacturing' });
    expect(parseRoute('/rural-manufacturing/join/wave-1')).toEqual({
      slug: 'rural-manufacturing',
      wave: 'wave-1',
    });
    expect(parseRoute('/rural-manufacturing/join/i/abcDEF123_-abcDEF123_-')).toEqual({
      slug: 'rural-manufacturing',
      invite: 'abcDEF123_-abcDEF123_-',
    });
    expect(parseRoute('/rural-manufacturing/panel')).toEqual({
      slug: 'rural-manufacturing',
      page: 'panel',
    });
    expect(parseRoute('/')).toBeNull();
  });
});

describe('a wave open is counted once per device', () => {
  it('counts on a device with no stored arrival, and not on a reload or a later visit', () => {
    expect(countsAsOpen({}, 'wave-1')).toBe(true);
    expect(countsAsOpen({ wave: 'wave-1' }, 'wave-1')).toBe(false);
  });

  it('counts again for another wave, or after arriving through an invite', () => {
    expect(countsAsOpen({ wave: 'wave-1' }, 'wave-2')).toBe(true);
    expect(countsAsOpen({ invite: 'abcDEF123_-abcDEF123_-' }, 'wave-1')).toBe(true);
  });

  it('reads the stored arrival back, and reads anything else as no arrival', () => {
    expect(parseArrival(JSON.stringify({ wave: 'wave-1' }))).toEqual({ wave: 'wave-1' });
    expect(parseArrival(JSON.stringify({ invite: 'tok' }))).toEqual({ invite: 'tok' });
    expect(parseArrival(undefined)).toEqual({});
    expect(parseArrival('not json')).toEqual({});
    expect(parseArrival('"a string"')).toEqual({});
    expect(parseArrival(JSON.stringify({ wave: 7, invite: '' }))).toEqual({});
  });
});

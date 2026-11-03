import { describe, expect, it } from 'vitest';
import { countsAsOpen, pageHref, parseArrival, parseRoute } from '../src/lib/route.ts';

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

  it('reads the pages a participant can open directly: continue, about, and the older panel and trust', () => {
    expect(parseRoute('/rural-manufacturing/continue')?.page).toBe('continue');
    expect(parseRoute('/rural-manufacturing/about')?.page).toBe('about');
    expect(parseRoute('/rural-manufacturing/trust')?.page).toBe('trust');
    expect(parseRoute('/rural-manufacturing/terms')?.page).toBe('terms');
    expect(parseRoute('/rural-manufacturing/privacy')?.page).toBe('privacy');
    expect(parseRoute('/rural-manufacturing/elsewhere')).toEqual({ slug: 'rural-manufacturing' });
  });

  it('writes the address of a page, and never anything else', () => {
    expect(pageHref('rural-manufacturing', 'continue')).toBe('/rural-manufacturing/continue');
    expect(pageHref('rural-manufacturing', 'about')).toBe('/rural-manufacturing/about');
    expect(pageHref('rural-manufacturing')).toBe('/rural-manufacturing/');
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

import { describe, expect, it } from 'vitest';
import { installDue, readDismissals } from '../src/lib/install.ts';
import { API_PATH, pwaOptions } from '../pwa.ts';

describe('the install prompt is due', () => {
  it('on a platform with steps, until dismissed twice, and never in an installed app', () => {
    expect(installDue({ platform: 'Android', dismissals: 0, installed: false })).toBe(true);
    expect(installDue({ platform: 'Android', dismissals: 1, installed: false })).toBe(true);
    expect(installDue({ platform: 'Android', dismissals: 2, installed: false })).toBe(false);
    expect(installDue({ platform: 'Android', dismissals: 0, installed: true })).toBe(false);
    expect(installDue({ platform: null, dismissals: 0, installed: false })).toBe(false);
  });

  it('reads the stored count, and anything else as none', () => {
    expect(readDismissals(undefined)).toBe(0);
    expect(readDismissals('2')).toBe(2);
    expect(readDismissals('two')).toBe(0);
  });
});

describe('the installable app', () => {
  it('starts at the root, which the client sends on to the last workshop', () => {
    const manifest = pwaOptions.manifest as { start_url: string; scope: string; display: string };
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
  });

  it('never caches the API: no runtime caching, and no client page for an /api address', () => {
    const workbox = pwaOptions.workbox!;
    expect(workbox.runtimeCaching).toEqual([]);
    expect(workbox.navigateFallback).toBe('/index.html');
    expect(workbox.navigateFallbackDenylist).toEqual([API_PATH]);
    expect(API_PATH.test('/api/rural-manufacturing/sync')).toBe(true);
    expect(API_PATH.test('/api/health')).toBe(true);
    expect(API_PATH.test('/rural-manufacturing/join/wave-1')).toBe(false);
    expect(workbox.globPatterns!.every((p) => !p.includes('api'))).toBe(true);
  });

  it('is registered from a module, not an inline script, so the Content Security Policy holds', () => {
    expect(pwaOptions.injectRegister).toBeNull();
  });
});

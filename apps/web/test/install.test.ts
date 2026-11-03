import { describe, expect, it } from 'vitest';
import { installDue, manifestHref, pointManifest, readDismissals } from '../src/lib/install.ts';
import { API_PATH, pwaOptions, workshopManifest, workshopManifests } from '../pwa.ts';

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
  it('has a root manifest at /, which the client sends on to the last workshop', () => {
    const manifest = pwaOptions.manifest as { start_url: string; scope: string; display: string };
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
  });

  it('has a manifest per workshop that starts and stays in that workshop', () => {
    const manifest = workshopManifest('rural-manufacturing');
    expect(manifest.start_url).toBe('/rural-manufacturing/');
    expect(manifest.scope).toBe('/rural-manufacturing/');
    expect(manifest.id).toBe('/rural-manufacturing/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons).toEqual((pwaOptions.manifest as { icons: unknown }).icons);
    expect(manifestHref('rural-manufacturing')).toBe('/rural-manufacturing/manifest.webmanifest');
  });

  it('writes each workshop manifest into the build at its address', () => {
    const emitted: { fileName?: string; source?: string | Uint8Array }[] = [];
    const plugin = workshopManifests(['a-workshop', 'another']);
    const generateBundle = plugin.generateBundle as (this: unknown) => void;
    generateBundle.call({ emitFile: (file: (typeof emitted)[number]) => emitted.push(file) });
    expect(emitted.map((file) => file.fileName)).toEqual([
      'a-workshop/manifest.webmanifest',
      'another/manifest.webmanifest',
    ]);
    const written = JSON.parse(String(emitted[1]!.source)) as { start_url: string };
    expect(written.start_url).toBe('/another/');
  });

  it('points the page at the manifest of the workshop it opened, adding the link if none', () => {
    document.querySelector('link[rel="manifest"]')?.remove();
    pointManifest(document, '/rural-manufacturing/manifest.webmanifest');
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    expect(link?.getAttribute('href')).toBe('/rural-manufacturing/manifest.webmanifest');
    pointManifest(document, '/another/manifest.webmanifest');
    expect(document.querySelectorAll('link[rel="manifest"]')).toHaveLength(1);
    expect(link?.getAttribute('href')).toBe('/another/manifest.webmanifest');
    link?.remove();
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

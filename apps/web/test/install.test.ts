import { describe, expect, it } from 'vitest';
import { installDue, manifestHref, pointManifest } from '../src/lib/install.ts';
import { reminderCalendar, reminderHref } from '../src/lib/reminder.ts';
import {
  API_PATH,
  pwaOptions,
  REMINDER_PATH,
  workshopManifest,
  workshopManifests,
  workshopReminders,
} from '../pwa.ts';

describe('the install offer is due', () => {
  it('on a platform with steps, and never in an installed app', () => {
    expect(installDue({ platform: 'Android', installed: false })).toBe(true);
    expect(installDue({ platform: 'iPhone and iPad', installed: false })).toBe(true);
    expect(installDue({ platform: 'Android', installed: true })).toBe(false);
    expect(installDue({ platform: null, installed: false })).toBe(false);
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

  it('writes each workshop reminder into the build at its address, with the same bytes the dev server serves', () => {
    const reminder = {
      slug: 'a-workshop',
      base: 'https://example.test',
      opensDay: '2026-11-16',
      closesDay: '2026-12-06',
      summary: 'A few more cards',
      description: 'Open [link]',
    };
    const emitted: { fileName?: string; source?: string | Uint8Array }[] = [];
    const plugin = workshopReminders([reminder]);
    const generateBundle = plugin.generateBundle as (this: unknown) => void;
    generateBundle.call({ emitFile: (file: (typeof emitted)[number]) => emitted.push(file) });
    expect(emitted.map((file) => file.fileName)).toEqual(['a-workshop/reminder.ics']);
    expect(String(emitted[0]!.source)).toBe(reminderCalendar(reminder));
    expect(reminderHref('a-workshop')).toBe('/a-workshop/reminder.ics');
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
    expect(workbox.navigateFallbackDenylist).toContain(API_PATH);
    expect(API_PATH.test('/api/rural-manufacturing/sync')).toBe(true);
    expect(API_PATH.test('/api/health')).toBe(true);
    expect(API_PATH.test('/rural-manufacturing/join/wave-1')).toBe(false);
    expect(workbox.globPatterns!.every((p) => !p.includes('api'))).toBe(true);
  });

  it('keeps the reminder files offline and never answers a tap on one with the client page', () => {
    const workbox = pwaOptions.workbox!;
    expect(workbox.globPatterns!.some((p) => p.includes('ics'))).toBe(true);
    expect(workbox.navigateFallbackDenylist).toContain(REMINDER_PATH);
    expect(REMINDER_PATH.test('/rural-manufacturing/reminder.ics')).toBe(true);
    expect(REMINDER_PATH.test('/rural-manufacturing/')).toBe(false);
  });

  it('is registered from a module, not an inline script, so the Content Security Policy holds', () => {
    expect(pwaOptions.injectRegister).toBeNull();
  });
});

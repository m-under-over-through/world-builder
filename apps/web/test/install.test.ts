import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { installDue, manifestHref, pointManifest } from '../src/lib/install.ts';
import { pageFor, pageHref, slugsOfPages, workshopPage } from '../src/lib/pages.ts';
import { reminderCalendar, reminderHref } from '../src/lib/reminder.ts';
import {
  API_PATH,
  pwaOptions,
  REMINDER_PATH,
  workshopManifest,
  workshopManifests,
  workshopPages,
  workshopReminders,
} from '../pwa.ts';

/** The root page as vite-plugin-pwa writes it into the build, cut down to what matters. */
const ROOT_PAGE =
  '<!doctype html><html><head><link rel="manifest" href="/manifest.webmanifest"><script type="module" src="/assets/index.js"></script></head><body></body></html>';

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

  it("writes a copy of the page per workshop, linking that workshop's manifest and nothing else changed", () => {
    const copy = workshopPage(ROOT_PAGE, 'another');
    expect(copy).toContain('<link rel="manifest" href="/another/manifest.webmanifest">');
    expect(copy).not.toContain('href="/manifest.webmanifest"');
    expect(copy.replace('/another/manifest.webmanifest', '/manifest.webmanifest')).toBe(ROOT_PAGE);
    // A page without the root link is a build to refuse, not an app to install at `/`.
    expect(() => workshopPage('<html></html>', 'another')).toThrow();
    const emitted: { fileName?: string; source?: string | Uint8Array }[] = [];
    const plugin = workshopPages(['a-workshop', 'another']);
    const generateBundle = plugin.generateBundle as (
      this: unknown,
      options: unknown,
      bundle: Record<string, { type: string; source: string }>,
    ) => void;
    generateBundle.call(
      { emitFile: (file: (typeof emitted)[number]) => emitted.push(file) },
      {},
      { 'index.html': { type: 'asset', source: ROOT_PAGE } },
    );
    expect(emitted.map((file) => file.fileName)).toEqual([
      'a-workshop/index.html',
      'another/index.html',
    ]);
    expect(String(emitted[0]!.source)).toContain('/a-workshop/manifest.webmanifest');
    expect(pageHref('a-workshop')).toBe('/a-workshop/index.html');
  });

  it('answers a navigation with the page its address belongs to, and reads the workshops off the kept files', () => {
    const kept = [
      'index.html',
      'rural-manufacturing/index.html',
      'rural-manufacturing/manifest.webmanifest',
      'assets/index.js',
    ];
    expect(slugsOfPages(kept)).toEqual(['rural-manufacturing']);
    const slugs = slugsOfPages(kept);
    expect(pageFor('/rural-manufacturing/', slugs)).toBe('/rural-manufacturing/index.html');
    expect(pageFor('/rural-manufacturing/join/wave-1', slugs)).toBe(
      '/rural-manufacturing/index.html',
    );
    expect(pageFor('/rural-manufacturing/about', slugs)).toBe('/rural-manufacturing/index.html');
    expect(pageFor('/', slugs)).toBe('/index.html');
    expect(pageFor('/another/', slugs)).toBe('/index.html');
    expect(pageFor('/rural-manufacturingx/', slugs)).toBe('/index.html');
  });

  it('is a worker written by hand that keeps the pages, never caches the API, and never answers /api or a calendar file with a page', () => {
    expect(pwaOptions.strategies).toBe('injectManifest');
    expect(pwaOptions.srcDir).toBe('src');
    expect(pwaOptions.filename).toBe('sw.ts');
    const patterns = pwaOptions.injectManifest!.globPatterns!;
    expect(patterns.every((p) => !p.includes('api'))).toBe(true);
    for (const kind of ['html', 'webmanifest', 'ics', 'woff2'])
      expect(patterns.some((p) => p.includes(kind))).toBe(true);
    expect(pwaOptions.workbox).toBeUndefined();
    const worker = readFileSync(join(fileURLToPath(import.meta.url), '../../src/sw.ts'), 'utf8');
    expect(worker).toContain('denylist: [API_PATH, REMINDER_PATH]');
    expect(worker).not.toContain('runtimeCaching');
    expect(worker).not.toContain('NetworkFirst');
    expect(API_PATH.test('/api/rural-manufacturing/sync')).toBe(true);
    expect(API_PATH.test('/api/health')).toBe(true);
    expect(API_PATH.test('/rural-manufacturing/join/wave-1')).toBe(false);
    expect(REMINDER_PATH.test('/rural-manufacturing/reminder.ics')).toBe(true);
    expect(REMINDER_PATH.test('/rural-manufacturing/')).toBe(false);
  });

  it('serves every workshop folder its own page on Netlify, before the catch-all', () => {
    const root = join(fileURLToPath(import.meta.url), '../../../../');
    const rules = readFileSync(join(root, 'apps/web/public/_redirects'), 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.startsWith('#'))
      .map((line) => line.trim().split(/\s+/));
    const catchAll = rules.findIndex((rule) => rule[0] === '/*');
    expect(catchAll).toBeGreaterThan(0);
    const slugs = readdirSync(join(root, 'workshops')).filter((name) => !name.startsWith('.'));
    for (const slug of slugs) {
      const at = rules.findIndex((rule) => rule[0] === `/${slug}/*`);
      expect(at, slug).toBeGreaterThanOrEqual(0);
      expect(at).toBeLessThan(catchAll);
      expect(rules[at]).toEqual([`/${slug}/*`, pageHref(slug), '200']);
    }
    expect(rules[catchAll]).toEqual(['/*', '/index.html', '200']);
  });

  it('is registered from a module, not an inline script, so the Content Security Policy holds', () => {
    expect(pwaOptions.injectRegister).toBeNull();
  });
});

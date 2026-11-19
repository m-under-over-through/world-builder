import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { keepOfflineCopy, WORKER_SCOPE, WORKER_URL } from '../src/lib/offline-copy.ts';

/**
 * An update waits for the next open (ADR 0029): the page registers the service worker and does
 * nothing when a new one takes over. Nothing in the client reloads the page, and nothing of it is
 * loaded later, so a page left open keeps working after a new worker has dropped the old files.
 * What a test DOM cannot show, a real worker replacing another, is in the build log's hand check.
 */

// Anchored on this file; the test DOM's own URL class cannot make a file path, Node's helper can.
const web = join(fileURLToPath(import.meta.url), '../..');

/** Source without its comments: block, line (not the `//` of an address) and HTML comments. */
const withoutComments = (source: string) =>
  source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

/** Every file of the client's source, as path and text. */
function sources(dir = join(web, 'src')): [string, string][] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|js|svelte)$/.test(name)
      ? [[path, readFileSync(path, 'utf8')] as [string, string]]
      : [];
  });
}

/** A stand-in for the browser's worker container. */
function container(register: ServiceWorkerContainer['register']) {
  return {
    register: vi.fn(register),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

afterEach(() => vi.restoreAllMocks());

describe('the offline copy (src/lib/offline-copy.ts)', () => {
  it('registers /sw.js with scope /', () => {
    const worker = container(async () => ({}) as ServiceWorkerRegistration);
    keepOfflineCopy({ serviceWorker: worker });
    expect(worker.register).toHaveBeenCalledTimes(1);
    expect(worker.register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
    expect([WORKER_URL, WORKER_SCOPE]).toEqual(['/sw.js', '/']);
  });

  it('where the browser has no service worker, does nothing and does not throw', () => {
    expect(() => keepOfflineCopy({})).not.toThrow();
    expect(() => keepOfflineCopy(navigator)).not.toThrow();
  });

  it('a registration the browser refuses does not throw and leaves no unhandled rejection', async () => {
    const unhandled: unknown[] = [];
    const listen = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', listen);
    try {
      // A plain function, not a spy: a spy follows the promise it returns, and so would handle
      // the rejection itself and hide the very thing this test looks for.
      let asked = 0;
      const later = {
        register: () => {
          asked++;
          return Promise.reject(new DOMException('refused', 'SecurityError'));
        },
      };
      expect(() => keepOfflineCopy({ serviceWorker: later })).not.toThrow();
      const atOnce = container(() => {
        throw new DOMException('refused', 'SecurityError');
      });
      expect(() => keepOfflineCopy({ serviceWorker: atOnce })).not.toThrow();
      // Long enough for a rejection nobody handled to be reported.
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(unhandled).toEqual([]);
      expect(asked).toBe(1);
    } finally {
      process.off('unhandledRejection', listen);
    }
  });

  it('adds no listener to the worker container, and so never reloads when a new worker takes over', async () => {
    const worker = container(async () => ({}) as ServiceWorkerRegistration);
    const before = Object.keys(worker);
    keepOfflineCopy({ serviceWorker: worker });
    await Promise.resolve();
    expect(worker.addEventListener).not.toHaveBeenCalled();
    // No `oncontrollerchange` or `onmessage` set either.
    expect(Object.keys(worker)).toEqual(before);
  });
});

describe('main.ts and the rest of the client', () => {
  it('main.ts registers the worker through keepOfflineCopy, and no longer through the plugin', () => {
    const main = withoutComments(readFileSync(join(web, 'src/main.ts'), 'utf8'));
    expect(main).toMatch(/import \{ keepOfflineCopy \} from '\.\/lib\/offline-copy\.ts';/);
    expect(main).toMatch(/\bkeepOfflineCopy\(\);/);
    expect(main).not.toContain('virtual:pwa-register');
    expect(main).not.toContain('registerSW');
  });

  it('the client reloads nowhere: no file of src calls a reload; the one reload of the page is in public/boot.js', () => {
    const files = sources();
    expect(files.length).toBeGreaterThan(20);
    for (const [path, text] of files) {
      const code = withoutComments(text);
      expect(code, path).not.toContain('location.reload');
      expect(code, path).not.toMatch(/\.reload\(/);
      // The other ways a page can load itself again (the review of pull request 81).
      expect(code, path).not.toMatch(/history\.go\(/);
      expect(code, path).not.toMatch(/location\.assign\(/);
      expect(code, path).not.toMatch(/location\.href\s*=[^=]/);
    }
    const boot = withoutComments(readFileSync(join(web, 'public/boot.js'), 'utf8'));
    expect(boot.match(/location\.reload\(\)/g)).toHaveLength(1);
  });

  it('no part of the client is loaded later: no file of src has a dynamic import', () => {
    // An open page keeps running the version it was loaded with, after a new worker has taken
    // over and dropped the old files (ADR 0029, point 3). A part fetched later would be one of
    // those dropped files: the old page would ask for it and not find it.
    for (const [path, text] of sources())
      expect(withoutComments(text), path).not.toMatch(/\bimport\s*\(/);
  });
});

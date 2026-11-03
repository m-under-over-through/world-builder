import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The headers file is the checkable half of the trust page (architecture plan, sections 12 and 13):
 * Netlify sends these on every response, the browser enforces them, and anyone can read them. This
 * test reads apps/web/public/_headers and holds it to the plan, so a loosened directive fails the
 * check before it reaches a deploy. The ops repository's weekly scan (scripts/scan-headers.sh)
 * holds the live site to the same rules.
 */
const file = readFileSync(new URL('../../../apps/web/public/_headers', import.meta.url), 'utf8');

/** Netlify's format: a path on its own line, then indented `Name: value` lines under it. */
function parse(text: string): Map<string, Map<string, string>> {
  const rules = new Map<string, Map<string, string>>();
  let path: string | undefined;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      path = line;
      rules.set(path, new Map());
      continue;
    }
    const m = line.trim().match(/^([A-Za-z-]+):\s*(.*)$/);
    expect(m, `a header line under ${path}: ${line}`).not.toBeNull();
    rules.get(path!)!.set(m![1]!.toLowerCase(), m![2]!);
  }
  return rules;
}

const rules = parse(file);
const everything = rules.get('/*')!;
const header = (name: string) => everything.get(name.toLowerCase());

/** `default-src 'self'; img-src 'self' data:` into { 'default-src': ["'self'"], ... }. */
function csp(value: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const part of value.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) out.set(name, sources);
  }
  return out;
}

describe('the security headers file', () => {
  it('has one rule for every path, and no other rule that narrows it: a path may add a content type and nothing else', () => {
    expect([...rules.keys()][0]).toBe('/*');
    expect(everything.size).toBeGreaterThanOrEqual(8);
    // The calendar reminder (ADR 0013) is served as text/calendar from its own path. Netlify
    // applies every matching rule, so the security headers above still reach that file; a path
    // rule may only ever name a content type, never one of them.
    for (const [path, headers] of rules) {
      if (path === '/*') continue;
      expect([...headers.keys()], path).toEqual(['content-type']);
    }
  });

  it('allows scripts, styles, images, fonts, connections, workers and the manifest from this origin only; images may also be data: URLs', () => {
    const policy = csp(header('Content-Security-Policy')!);
    const expectSelf = [
      'default-src',
      'script-src',
      'style-src',
      'font-src',
      'connect-src',
      'manifest-src',
      'worker-src',
      'form-action',
    ];
    for (const d of expectSelf) expect(policy.get(d), d).toEqual(["'self'"]);
    expect(policy.get('img-src')).toEqual(["'self'", 'data:']);
    for (const d of ['frame-ancestors', 'base-uri', 'object-src'])
      expect(policy.get(d), d).toEqual(["'none'"]);
    // Nothing else may appear: no directive the lists above do not name, no other source.
    for (const [name, sources] of policy) {
      expect(
        [...expectSelf, 'img-src', 'frame-ancestors', 'base-uri', 'object-src'],
        name,
      ).toContain(name);
      for (const s of sources) expect(["'self'", "'none'", 'data:'], `${name} ${s}`).toContain(s);
    }
    expect(header('Content-Security-Policy')).not.toMatch(/unsafe|http|\*|nonce|sha256/i);
  });

  it('denies the camera, the microphone and location to the page', () => {
    const policy = new Map(
      header('Permissions-Policy')!
        .split(',')
        .map((p) => p.trim().split('=') as [string, string]),
    );
    for (const feature of ['camera', 'microphone', 'geolocation']) {
      expect(policy.get(feature), feature).toBe('()');
    }
  });

  it('keeps browsers on HTTPS for a year, subdomains included, without asking for the preload list', () => {
    const hsts = header('Strict-Transport-Security')!;
    const directives = hsts.split(';').map((d) => d.trim());
    const maxAge = directives.find((d) => d.startsWith('max-age='));
    expect(Number(maxAge?.slice('max-age='.length))).toBeGreaterThanOrEqual(31536000);
    expect(directives).toContain('includeSubDomains');
    // Decision 6 of 2 November 2026 (docs/briefs/week-2-plan.md): no preload. The preload list
    // takes the whole registrable domain, which is the company's, not this app's.
    expect(directives).not.toContain('preload');
  });

  it('sends no referrer, refuses sniffing and framing, and isolates the origin', () => {
    expect(header('Referrer-Policy')).toBe('no-referrer');
    expect(header('X-Content-Type-Options')).toBe('nosniff');
    expect(header('X-Frame-Options')).toBe('DENY');
    expect(header('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(header('Cross-Origin-Resource-Policy')).toBe('same-origin');
    // The third of the trio, found missing by the first ZAP scan (ops repository, runbook/scans.md).
    // The app loads nothing cross-origin, so requiring it changes nothing a participant sees.
    expect(header('Cross-Origin-Embedder-Policy')).toBe('require-corp');
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { Session } from '@wb/contracts';
import App from '../src/App.svelte';
import About from '../src/screens/About.svelte';
import Card from '../src/screens/Card.svelte';
import Welcome from '../src/screens/Welcome.svelte';
import { currentCardId, replaySession } from '../src/lib/session.ts';
import { AppState } from '../src/lib/state.svelte.ts';
import { WorkshopStore } from '../src/lib/store.ts';
import { findWorkshop } from '../src/lib/workshops.ts';
import { freshIndexedDb, stubRoutes } from './helpers.ts';

/**
 * The accessibility pass of week 3 (design/DESIGN.md, Accessibility; WCAG 2.1 AA; build log,
 * 11 November 2026). What a test DOM can see is checked on the rendered screens: headings,
 * focus, names, alerts, reading order. What it cannot see, colour and motion and size, is
 * checked in the stylesheet itself: the contrast is computed from the tokens on :root, and the
 * reduced-motion block is read rule by rule. The rest is for real phones (docs/device-tests.md).
 */
const SLUG = 'rural-manufacturing';
const workshop = findWorkshop(SLUG)!;
const copy = workshop.copy;
const SESSION: Session = {
  id: '00000000-0000-4000-8000-000000000001',
  sessionNo: 1,
  startedDay: '2026-11-16',
  deckVersion: workshop.deck.version,
  seed: '0123456789abcdef',
};

beforeEach(freshIndexedDb);
afterEach(() => vi.unstubAllGlobals());

// ---------- the stylesheet, read as rules ----------

// Anchored on this file; the test DOM's own URL class cannot make a file path, Node's helper can.
const web = join(fileURLToPath(import.meta.url), '../..');
const css = readFileSync(join(web, 'src/app.css'), 'utf8');
const indexHtml = readFileSync(join(web, 'index.html'), 'utf8');

interface Rule {
  /** The @media the rule sits in, or null at the top level. */
  media: string | null;
  selectors: string[];
  body: Record<string, string>;
}

/** The style rules of a stylesheet, without comments, @font-face or @keyframes. */
function parseCss(source: string): Rule[] {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: Rule[] = [];
  const heads: string[] = [];
  let buffer = '';
  for (const ch of text) {
    if (ch === '{') {
      heads.push(buffer.trim());
      buffer = '';
    } else if (ch === '}') {
      const head = heads.pop() ?? '';
      const inKeyframes = heads.some((h) => h.startsWith('@keyframes'));
      if (buffer.trim() && !head.startsWith('@') && !inKeyframes) {
        const body: Record<string, string> = {};
        for (const line of buffer.split(';')) {
          const at = line.indexOf(':');
          if (at > 0) body[line.slice(0, at).trim()] = line.slice(at + 1).trim();
        }
        rules.push({
          media: heads.find((h) => h.startsWith('@media')) ?? null,
          selectors: head.split(',').map((s) => s.trim().replace(/\s+/g, ' ')),
          body,
        });
      }
      buffer = '';
    } else buffer += ch;
  }
  return rules;
}

const rules = parseCss(css);
const REDUCE = '@media (prefers-reduced-motion: reduce)';
const topLevel = rules.filter((r) => r.media === null);
const reduced = rules.filter((r) => r.media === REDUCE);

/** The one top-level rule for a selector, as written in the stylesheet. */
function rule(selector: string): Record<string, string> {
  const found = topLevel.filter((r) => r.selectors.includes(selector));
  expect(found, selector).toHaveLength(1);
  return found[0]!.body;
}

const px = (value: string | undefined) => Number.parseFloat(value ?? 'NaN');
/** The first of an `inset` shorthand: how far the hit area reaches above the element. */
const insetTop = (value: string | undefined) => -px(value?.split(/\s+/)[0]);

const root = rule(':root');
const token = (name: string) => root[`--${name}`]!;

// ---------- contrast, from the tokens (WCAG 2.1, relative luminance) ----------

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: Rgb) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
/** A colour laid over another at some opacity, as the browser paints it. */
const over = (top: Rgb, alpha: number, under: Rgb): Rgb =>
  top.map((c, i) => Math.round(c * alpha + under[i]! * (1 - alpha))) as Rgb;

const TINTS = ['sun', 'mint', 'sky', 'lilac'] as const;

describe('the stylesheet: what a test DOM cannot see', () => {
  it('ink and ink-soft are at least 4.5:1 on the ground, on white, on every tint and on the hint inside a card; ink-soft at least 6:1 on a tint', () => {
    const ink = rgb(token('color-ink'));
    const inkSoft = rgb(token('color-ink-soft'));
    const grounds = {
      ground: rgb(token('color-ground')),
      surface: rgb(token('color-surface')),
      ...Object.fromEntries(TINTS.map((t) => [t, rgb(token(`tint-${t}`))])),
    };
    for (const [name, ground] of Object.entries(grounds)) {
      expect(contrast(ink, ground), `ink on ${name}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(inkSoft, ground), `ink-soft on ${name}`).toBeGreaterThanOrEqual(4.5);
    }
    for (const tint of TINTS) {
      const paper = rgb(token(`tint-${tint}`));
      expect(contrast(inkSoft, paper), `ink-soft on ${tint}`).toBeGreaterThanOrEqual(6);
      // The dictation hint inside an open card: white at 72% over the card's tint.
      const hint = over(rgb(token('color-surface')), 0.72, paper);
      expect(contrast(ink, hint), `ink on the hint over ${tint}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('muted is at least 4.5:1 on the ground and on white, and white on ink for the ink pills', () => {
    const muted = rgb(token('color-muted'));
    expect(contrast(muted, rgb(token('color-ground')))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(muted, rgb(token('color-surface')))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(rgb(token('color-surface')), rgb(token('color-ink')))).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it('muted is never drawn on a tint: it is under 4.5:1 on mint, sky and lilac, and no rule for a card gives it, hover included', () => {
    const muted = rgb(token('color-muted'));
    expect(contrast(muted, rgb(token('tint-lilac')))).toBeLessThan(4.5);
    const onACard = rules.filter((r) =>
      r.selectors.some((s) => /(^|\s)\.card\b/.test(s) || /^\.tile(?!\.aside)/.test(s)),
    );
    expect(onACard.length).toBeGreaterThan(10);
    for (const r of onACard)
      expect(r.body['color'], r.selectors.join(', ')).not.toBe('var(--color-muted)');
  });

  it('every control keeps its focus ring: 2px of ink, 3px out, and no rule takes the outline away', () => {
    const ring = rule(':focus-visible');
    expect(ring['outline']).toBe('2px solid var(--color-ink)');
    expect(ring['outline-offset']).toBe('3px');
    for (const r of rules) {
      expect(r.body['outline'] ?? '', r.selectors.join(', ')).not.toMatch(/^(none|0)$/);
      expect(r.body['outline-style'] ?? '', r.selectors.join(', ')).not.toBe('none');
    }
  });

  it('every target is at least 44 pixels to a finger: the controls by their height, the small circles and the links by the pad around them', () => {
    expect(token('tap')).toBe('44px');
    expect(rule('button')['min-height']).toBe('var(--tap)');
    expect(rule('summary')['min-height']).toBe('var(--tap)');
    // The "?" in the header (ADR 0023): a ring of 36 with a pad around it.
    expect(
      px(rule('.about-mark')['height']) + 2 * insetTop(rule('.about-mark::after')['inset']),
    ).toBeGreaterThanOrEqual(44);
    expect(rule('ul.links a')['min-height']).toBe('var(--tap)');
    expect(px(rule('.pill.world')['min-height'])).toBeGreaterThanOrEqual(44);
    // The × on an open card, 32 across, and on the sheet, 36 across, each with a pad around it.
    expect(
      px(rule('.card .close')['height']) + 2 * insetTop(rule('.card .close::after')['inset']),
    ).toBeGreaterThanOrEqual(44);
    expect(
      px(rule('.sheet .close')['height']) + 2 * insetTop(rule('.sheet .close::after')['inset']),
    ).toBeGreaterThanOrEqual(44);
    // "Got it" in the dictation hint, a 36-pixel pill.
    expect(
      px(rule('.card .hint button')['min-height']) +
        2 * insetTop(rule('.card .hint button::after')['inset']),
    ).toBeGreaterThanOrEqual(44);
    // "Prefer to talk?": a 14px line at 1.2, 1px of padding and the 1.5px rule, then the pad.
    const talk = rule('.card .talk');
    const line = px(talk['font-size']) * Number(talk['line-height']) + 1 + 1.5;
    expect(line + 2 * insetTop(rule('.card .talk::before')['inset'])).toBeGreaterThanOrEqual(44);
    // A link in a sentence: DM Sans draws a line's box 1.302 times its size (ascent 0.992,
    // descent 0.310), and the padding above and below adds to what a finger can hit.
    const box = (size: number) => size * 1.302;
    expect(box(17) + 2 * px(rule('p a')['padding-block'])).toBeGreaterThanOrEqual(44);
    expect(box(14) + 2 * px(rule('.remind a')['padding-block'])).toBeGreaterThanOrEqual(44);
  });

  it("the invitation page's two buttons are at least 44 pixels: plain buttons and ink pills, and no rule of the page makes one smaller", async () => {
    stubRoutes({});
    const app = onAScreen({ screen: 'invitations', invitationWave: 'wave-1' });
    renderApp(app);
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: copy.item('Invitation page: buttons', 'new') }));
    const buttons = [
      screen.getByRole('button', { name: copy.item('Invitation page: buttons', 'new') }),
      screen.getByRole('button', { name: copy.item('Invitation page: buttons', 'copy') }),
    ];
    for (const button of buttons) expect(['', 'primary']).toContain(button.className.trim());
    expect(rule('button')['min-height']).toBe('var(--tap)');
    // "button.primary" is in two rules (with ".pill", and on its own); only the second sets a height.
    const primary = topLevel.filter((r) => r.selectors.includes('button.primary'));
    for (const r of primary)
      if (r.body['min-height']) expect(px(r.body['min-height'])).toBeGreaterThanOrEqual(44);
    const ofThePage = (s: string) => s.includes('.invitations') && s.includes('button');
    for (const r of rules.filter((r) => r.selectors.some(ofThePage)))
      for (const property of ['height', 'min-height', 'max-height', 'padding', 'padding-block'])
        expect(r.body[property], `${r.selectors.join(', ')} ${property}`).toBeUndefined();
  });

  it('on a short phone screen "Set aside" and "Write your own story" share one row and the swipe hint is left out, so the row cannot land on the world pill', () => {
    // jsdom lays nothing out, so this pins the rule. The numbers behind it: the stack's floor is
    // 280 pixels and everything else on the screen takes 348 with the three rows under the
    // stack (ADR 0023), so below 628 pixels of height the rows would run into the foot (build
    // log, 18 November 2026).
    const SHORT = '@media (max-height: 630px)';
    const short = (selector: string) =>
      rules.find((r) => r.media === SHORT && r.selectors.includes(selector))?.body;
    const row = short('.app.phone-loop .aside-row');
    expect(row?.['flex-direction']).toBe('row');
    expect(row?.['flex-wrap']).toBe('wrap');
    expect(short('.app.phone-loop .aside-row .swipe-hint')?.['display']).toBe('none');
    // The rule belongs to the phone's card screen only, and makes no control smaller.
    for (const r of rules.filter((r) => r.media === SHORT)) {
      expect(r.selectors.every((s) => s.startsWith('.app.phone-loop '))).toBe(true);
      for (const property of ['height', 'min-height', 'max-height', 'padding', 'font-size'])
        expect(r.body[property], `${r.selectors.join(', ')} ${property}`).toBeUndefined();
    }
    // Above that height nothing changes: a column, with the hint.
    expect(rule('.aside-row')['flex-direction']).toBe('column');
  });

  it('the blank card: "Write your own card", "Save" and "Not now" are at least 44 pixels to a finger, and no rule of the blank card makes a button smaller', async () => {
    renderApp(await onACard());
    const opener = screen.getByRole('button', { name: copy.text('Own card: button') });
    expect(opener.classList.contains('link')).toBe(true);
    expect(rule('button.link')['min-height']).toBe('var(--tap)');
    expect(rule('.own-card .own-actions .save')['height']).toBe('var(--tap)');
    const ofTheBlankCard = (s: string) =>
      s.includes('own-') && /button|\.save|\.not-now|own-open/.test(s);
    for (const r of rules.filter((r) => r.selectors.some(ofTheBlankCard)))
      for (const property of ['min-height', 'max-height', 'padding-block'])
        expect(r.body[property], `${r.selectors.join(', ')} ${property}`).toBeUndefined();
    await userEvent.setup().click(opener);
    const dialog = await screen.findByRole('dialog');
    const notNow = within(dialog).getByRole('button', {
      name: copy.item('Own card: buttons', 'not now'),
    });
    // "Not now" is a plain button: the 44-pixel rule of every button holds for it.
    expect(notNow.className.trim()).toBe('not-now');
    expect(
      within(dialog)
        .getByRole('button', { name: copy.item('Own card: buttons', 'save') })
        .classList.contains('save'),
    ).toBe(true);
  });

  it('with reduced motion asked for, nothing moves: every transition of a place or a size, and every animation that moves, is overridden; the fades stay', () => {
    expect(css).toContain(REDUCE);
    const moving = new Set(
      [...css.matchAll(/@keyframes ([\w-]+)\s*\{([^@]*)/g)]
        .filter(([, , body]) => /transform/.test(body!))
        .map(([, name]) => name!),
    );
    expect([...moving].sort()).toEqual(['card-exit', 'sheet-in', 'sheet-out', 'tile-in']);
    const animates = (body: Record<string, string>) =>
      (body['animation'] ?? body['animation-name'] ?? '').split(/\s+/).some((w) => moving.has(w));
    const transitions = (body: Record<string, string>) =>
      /transform|width|height/.test(body['transition'] ?? body['transition-property'] ?? '');

    const movers = topLevel.filter((r) => animates(r.body) || transitions(r.body));
    expect(movers.length).toBeGreaterThanOrEqual(8);
    for (const mover of movers)
      for (const selector of mover.selectors) {
        const still = reduced.filter((r) => r.selectors.includes(selector));
        expect(still.length, `${selector} in the reduced-motion block`).toBeGreaterThan(0);
        for (const r of still) {
          expect(animates(r.body), selector).toBe(false);
          expect(transitions(r.body), selector).toBe(false);
        }
      }
    // A card set aside does not fly off: it fades where it is.
    expect(
      reduced.find((r) => r.selectors.includes('.card.front.leaving'))?.body['transform'],
    ).toBe('none');
  });

  it('while framed on a phone the open card and the place to write do not scroll, the part around the field does, and the field is never lower than three lines (ADR 0025)', () => {
    for (const box of ['.app.framed .card.open', '.app.framed .own-card.sheet']) {
      expect(rule(box)['overflow'], box).toBe('hidden');
      expect(rule(box)['overflow-y'], box).toBeUndefined();
      const part = rule(`${box} > .scrolls`);
      expect(part['display'], box).toBe('flex');
      expect(part['flex-direction'], box).toBe('column');
      expect(part['flex'], box).toBe('1 1 0');
      expect(part['min-height'], box).toBe('0');
      expect(part['overflow-y'], box).toBe('auto');
      // The part keeps a drag to itself at its ends; the field hands one on to it.
      expect(part['overscroll-behavior'], box).toBe('contain');
      const field = rule(`${box} textarea`);
      expect(field['flex'], box).toBe('1 1 0');
      expect(field['overflow-y'], box).toBe('auto');
      expect(field['overscroll-behavior'], box).toBeUndefined();
    }
    expect(rule('.app.framed .card.open textarea')['min-height']).toBe('3lh');
    // The place to write's field has 12 + 12 of padding and 1.5 + 1.5 of border in its box.
    expect(rule('.own-card textarea')['padding']).toBe('12px 14px');
    expect(rule('.own-card textarea')['border']).toMatch(/^1.5px solid/);
    expect(rule('.app.framed .own-card.sheet textarea')['min-height']).toBe('calc(3lh + 27px)');
    // The strip under the last row while the keyboard is up stays.
    expect(rule('.app.framed.keyboard-up .loop.answering')['padding-bottom']).toBe('52px');
    expect(rule('.app.framed.keyboard-up .own-card.sheet')['padding-bottom']).toBe('52px');
    // Off the phone's frame, and on a laptop, the part that scrolls is no box of its own.
    expect(rule('.scrolls')['display']).toBe('contents');
    for (const r of rules.filter((r) => r.selectors.some((s) => s.includes('.scrolls'))))
      for (const s of r.selectors)
        expect(s, 'only the framed phone').toMatch(/^\.scrolls$|\.framed/);
    // The field no longer grows with its text: nothing reads its height.
    expect(css).not.toContain('--field-text');
  });

  it('on a phone the place to write fades in and out where it stands, and does not slide up (ADR 0025)', () => {
    expect(rule('.own-card.sheet')['animation']).toMatch(/^fade-in /);
    expect(rule('.own-card.sheet.closing')['animation']).toMatch(/^fade-out /);
    // "Your world so far" still rises from the bottom.
    expect(rule('.sheet')['animation']).toMatch(/^sheet-in /);
  });

  it('a finger on the parts of an open card that never move cannot drag it; nothing that holds a field refuses a drag (ADR 0025)', () => {
    for (const selector of [
      '.app.framed .card.open .head',
      '.app.framed .card.open .meta',
      '.app.framed .card.open .actions',
      '.app.framed .scrim',
      '.app.framed .own-card.sheet .own-meta',
      '.app.framed .own-card.sheet .own-actions',
    ])
      expect(rule(selector)['touch-action'], selector).toBe('pinch-zoom');
    // The boxes around a field, by the last part of a selector: a browser takes touch-action from
    // every one of them, so none may refuse a drag up and down.
    const around = new Set(
      'html body .app main .loop .loop.answering .stack .slot .card .card.open .scrolls .sheet .own-card .own-card.sheet textarea'.split(
        ' ',
      ),
    );
    const holdsAField = (s: string) => around.has(s.split(/[\s>]+/).at(-1)!);
    for (const r of rules)
      if (r.body['touch-action'] && r.body['touch-action'] !== 'pan-y')
        for (const s of r.selectors) expect(holdsAField(s), s).toBe(false);
  });

  it('in a frame too low for a head and a foot that stay, the whole card scrolls and every part of it lets a finger drag (ADR 0025)', () => {
    for (const [box, fixed] of [
      ['.app.framed.low .card.open', ['.head', '.meta', '.actions']],
      ['.app.framed.low .own-card.sheet', ['.own-meta', '.own-actions']],
    ] as const) {
      expect(rule(box)['overflow-y'], box).toBe('auto');
      expect(rule(box)['overscroll-behavior'], box).toBe('contain');
      // The part that scrolls is no box of its own there: the card is the one thing that scrolls.
      expect(rule(`${box} > .scrolls`)['display'], box).toBe('contents');
      for (const part of fixed)
        expect(rule(`${box} ${part}`)['touch-action'], `${box} ${part}`).toBe('pan-y');
    }
  });

  it('the dictation hint in the framed card is one row, and the field may be two lines beside it (ADR 0025)', () => {
    const hint = rule('.app.framed .card.open .hint');
    expect(hint['display']).toBe('grid');
    expect(hint['grid-template-columns']).toBe('1fr auto');
    expect(rule('.app.framed .card.open .hint button')['grid-column']).toBe('2');
    expect(rule('.app.framed .card.open .scrolls:has(.hint) textarea')['min-height']).toBe('2lh');
  });

  it('the document says its language', () => {
    expect(indexHtml).toMatch(/<html lang="en">/);
  });
});

// ---------- the screens ----------

/** A state on the first card of a first session, with a store, instant waits and a code. */
async function onACard(patch: Partial<AppState> = {}): Promise<AppState> {
  stubRoutes({});
  const app = new AppState();
  app.workshop = workshop;
  app.copy = copy;
  app.store = new WorkshopStore(SLUG);
  await app.store.set('demoSeen', '2026-11-16');
  await app.store.putSession({ ...SESSION, synced: 0 });
  app.wait = async () => {};
  app.code = '1234567890123456';
  app.history = { sessions: [SESSION], events: [] };
  app.live = replaySession(workshop.deck, workshop.config, SESSION, app.history);
  app.card = workshop.deck.cards.find((c) => c.id === currentCardId(app.live!));
  app.cardNo = 1;
  app.screen = 'card';
  Object.assign(app, patch);
  return app;
}

/** A state on one of the text screens, with nothing stored. */
function onAScreen(patch: Partial<AppState>): AppState {
  const app = new AppState();
  app.workshop = workshop;
  app.copy = copy;
  app.arrival = { wave: 'wave-1' };
  Object.assign(app, patch);
  return app;
}

function renderApp(app: AppState) {
  app.open = async () => {};
  return render(App, { app });
}

/** The levels of the headings on the screen, in document order. */
const levels = () =>
  [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((h) => Number(h.tagName[1]));

/** One h1, first, and never a level skipped on the way down. */
function expectHeadingsInOrder(where: string) {
  const found = levels();
  expect(found[0], `${where}: the first heading`).toBe(1);
  expect(
    found.filter((l) => l === 1),
    `${where}: one h1`,
  ).toHaveLength(1);
  found.forEach((level, i) => {
    if (i > 0)
      expect(level, `${where}: after h${found[i - 1]}`).toBeLessThanOrEqual(found[i - 1]! + 1);
  });
}

const ME = () => ({
  status: 200,
  body: {
    workshop: { slug: SLUG, name: 'x', closesDay: '2026-12-06', deleteDay: '2027-02-05' },
    participant: { createdDay: '2026-11-16', invitesLeft: 3, wave: 'wave-1', sessionsCount: 0 },
    sessions: [],
    events: [],
  },
});

describe('headings', () => {
  it('every text screen has one h1 and no level skipped: the welcome, the page about the app with its fold, the terms, the policy, closed, not a workshop, the invitation page', () => {
    const screens: Partial<AppState>[] = [
      { screen: 'welcome' },
      { screen: 'about', aboutSection: 'now' },
      { screen: 'terms' },
      { screen: 'privacy' },
      { screen: 'closed' },
      { screen: 'no-workshop' },
      { screen: 'invitations' },
    ];
    for (const patch of screens) {
      const { unmount } = renderApp(onAScreen(patch));
      expectHeadingsInOrder(String(patch.screen));
      unmount();
    }
  });

  it('the card screen has a title: the app name in the top bar is its h1, on a phone, with the sheet open, with the hint open, and on a laptop', async () => {
    const name = copy.item('App labels', 'app name');
    const phone = renderApp(await onACard());
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(name);
    expectHeadingsInOrder('the card screen on a phone');
    phone.unmount();

    const sheet = await onACard();
    renderApp(sheet);
    sheet.openWorld();
    await screen.findByRole('dialog');
    expectHeadingsInOrder('the sheet');
    document.body.innerHTML = '';

    const hint = await onACard({ cardState: 'answering', platform: 'Android', hintOpen: true });
    const open = renderApp(hint);
    expectHeadingsInOrder('the open card with the hint');
    open.unmount();

    renderApp(await onACard({ wide: true }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(name);
    expectHeadingsInOrder('the laptop page');
  });

  it('with the blank card open the screen keeps one h1 and no level skipped, on a phone and on a laptop', async () => {
    for (const wide of [false, true]) {
      const app = await onACard({ wide });
      const { unmount } = renderApp(app);
      app.openOwnCard();
      await screen.findByRole('dialog', { name: copy.text('Own card: title') });
      expectHeadingsInOrder(`the blank card ${wide ? 'on a laptop' : 'on a phone'}`);
      unmount();
    }
  });

  it('a tile that opens is a button with a name, at least 44 pixels to a finger; the focus goes into the field and comes back to the tile, or to the world pill on a phone; one h1, no level skipped', async () => {
    // At least 44 pixels: a tile is a button, and its own rule keeps the height of every button.
    expect(rule('button.tile')['min-height']).toBe('var(--tap)');
    for (const r of rules.filter((r) => r.selectors.some((s) => s.includes('button.tile'))))
      expect(r.body['max-height'], r.selectors.join(', ')).toBeUndefined();
    for (const wide of [false, true]) {
      const app = await onACard({ wide });
      app.draft = 'A first answer';
      await app.save();
      const answered = app.world.tiles[0]!;
      const user = userEvent.setup();
      const { unmount } = renderApp(app);
      if (!wide) await user.click(document.getElementById('world-pill')!);
      const tile = await screen.findByRole('button', {
        name: `${answered.area} ${answered.question} A first answer ${copy.item('Your world', 'open answer')}`,
      });
      expect(tile.classList.contains('tile')).toBe(true);
      await user.click(tile);
      const dialog = await screen.findByRole('dialog', { name: answered.question });
      const field = within(dialog).getByRole('textbox', { name: answered.question });
      await waitFor(() => expect(document.activeElement).toBe(field));
      expectHeadingsInOrder(`a tile's place to write ${wide ? 'on a laptop' : 'on a phone'}`);
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      if (wide)
        await waitFor(() =>
          expect((document.activeElement as HTMLElement).dataset['tile']).toBe(answered.cardId),
        );
      else await waitFor(() => expect(document.activeElement?.id).toBe('world-pill'));
      unmount();
    }
  });

  it('on every other screen the app name stays a line, not a heading', () => {
    renderApp(onAScreen({ screen: 'welcome' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(copy.text('Welcome: title'));
    expect(document.querySelector('.topbar h1')).toBeNull();
  });
});

describe('focus', () => {
  it('after "About this app" the focus is on the page\'s title, and after Back on the card screen\'s', async () => {
    const app = await onACard();
    stubRoutes({ [`/api/${SLUG}/me`]: [ME] });
    const user = userEvent.setup();
    renderApp(app);
    await user.click(screen.getByRole('button', { name: copy.item('Buttons', 'about') }));
    const title = await screen.findByRole('heading', {
      level: 1,
      name: copy.item('Titles', 'about'),
    });
    await waitFor(() => expect(document.activeElement).toBe(title));
    await user.click(screen.getAllByRole('button', { name: copy.item('Buttons', 'back') })[0]!);
    await waitFor(() => expect(app.screen).toBe('card'));
    await waitFor(() =>
      expect(document.activeElement?.textContent).toBe(copy.item('App labels', 'app name')),
    );
    expect(document.activeElement?.tagName).toBe('H1');
  });

  it('an open card brought back from the page about the app keeps the focus in its field', async () => {
    const app = await onACard({ cardState: 'answering', draft: 'Half' });
    stubRoutes({ [`/api/${SLUG}/me`]: [ME] });
    const user = userEvent.setup();
    renderApp(app);
    await user.click(screen.getByRole('button', { name: copy.item('Buttons', 'about') }));
    await screen.findByRole('heading', { level: 1, name: copy.item('Titles', 'about') });
    await user.click(screen.getAllByRole('button', { name: copy.item('Buttons', 'back') })[0]!);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox')));
  });

  it('delete in two steps: the question takes the focus, and "Keep my answers" gives it back to the first button', async () => {
    const user = userEvent.setup();
    render(About, { app: onAScreen({ screen: 'about', code: '1234567890123456' }) });
    await user.click(screen.getByRole('button', { name: copy.item('Buttons', 'delete') }));
    const question = screen.getByText(copy.text('Privacy panel: delete confirm'));
    await waitFor(() => expect(document.activeElement).toBe(question));
    await user.click(screen.getByRole('button', { name: copy.item('Buttons', 'keep') }));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: copy.item('Buttons', 'delete') }),
      ),
    );
  });

  it('the thank-you card takes the focus when the last card goes, and reads as a note with its words', async () => {
    const app = await onACard();
    render(Card, { app });
    app.card = undefined;
    app.live = { ...app.live!, deckDone: true };
    const note = await screen.findByRole('note');
    expect(note.textContent?.trim()).toBe(copy.text('Thank you card'));
    await waitFor(() => expect(document.activeElement).toBe(note));
  });

  it('while the sheet is open the page behind it is inert, the line for the screen reader aside; closed, nothing is', async () => {
    const app = await onACard();
    const user = userEvent.setup();
    renderApp(app);
    // Svelte sets `inert` as the element's property, which a browser reflects to the attribute
    // and the test DOM keeps as it is; the property is what both have.
    const inert = (el: Element) => (el as HTMLElement & { inert?: boolean }).inert === true;
    const behind = () => ['header', 'main', 'footer'].map((t) => document.querySelector(t)!);
    for (const el of behind()) expect(inert(el), el.tagName).toBe(false);
    await user.click(
      screen.getByRole('button', { name: (n) => n.startsWith(copy.item('Your world', 'title')) }),
    );
    const dialog = await screen.findByRole('dialog');
    for (const el of behind()) expect(inert(el), el.tagName).toBe(true);
    const live = document.querySelector('[aria-live]')!;
    for (let el: Element | null = live; el; el = el.parentElement) expect(inert(el)).toBe(false);
    for (let el: Element | null = dialog; el; el = el.parentElement) expect(inert(el)).toBe(false);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    for (const el of behind()) expect(inert(el), el.tagName).toBe(false);
  });
});

describe('the blank card (ADR 0022)', () => {
  it('the focus goes into the field on opening, stays inside, and back to the button on closing; Escape closes, as "Not now" does; the page behind is inert meanwhile', async () => {
    for (const wide of [false, true]) {
      const app = await onACard({ wide });
      const user = userEvent.setup();
      const { unmount } = renderApp(app);
      const inert = (el: Element) => (el as HTMLElement & { inert?: boolean }).inert === true;
      const opener = () => screen.getByRole('button', { name: copy.text('Own card: button') });
      await user.click(opener());
      const dialog = await screen.findByRole('dialog', { name: copy.text('Own card: title') });
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      const field = screen.getByRole('textbox', { name: copy.text('Own card: field') });
      await waitFor(() => expect(document.activeElement).toBe(field));
      // A laptop has no foot (ADR 0023).
      const behind = wide ? ['header', 'main'] : ['header', 'main', 'footer'];
      for (const tag of behind) expect(inert(document.querySelector(tag)!), tag).toBe(true);
      await user.type(field, 'Words');
      await user.tab();
      await user.tab();
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(opener()));
      for (const tag of behind) expect(inert(document.querySelector(tag)!), tag).toBe(false);
      await user.click(opener());
      await screen.findByRole('dialog');
      await user.click(
        screen.getByRole('button', { name: copy.item('Own card: buttons', 'not now') }),
      );
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      await waitFor(() => expect(document.activeElement).toBe(opener()));
      expect(app.ownDraft).toBe('Words');
      unmount();
    }
  });

  it('the field is described by the hint and the counter, and a save that fails is an alert', async () => {
    const app = await onACard();
    renderApp(app);
    app.openOwnCard();
    app.ownDraft = 'a lone surrogate \uD83D';
    await screen.findByRole('dialog');
    const field = screen.getByRole('textbox', { name: copy.text('Own card: field') });
    expect(field.getAttribute('aria-describedby')).toBe('own-hint own-count');
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: copy.item('Own card: buttons', 'save') }));
    const alert = await screen.findByRole('alert');
    expect(alert.id).toBe('own-error');
    expect(field.getAttribute('aria-describedby')).toContain('own-error');
  });
});

describe('what a screen reader is told', () => {
  it('a refused join is an alert on the welcome, and the wait for the retry a status', () => {
    const refused = render(Welcome, { app: onAScreen({ error: 'SERVER_ERROR' }) });
    expect(screen.getByRole('alert').textContent).toBe(copy.error('SERVER_ERROR'));
    refused.unmount();
    render(Welcome, { app: onAScreen({ retrying: true, joining: true }) });
    expect(screen.getByRole('status').textContent?.trim()).toBe(
      copy.item('App labels', 'retrying'),
    );
  });

  it('a save that fails is an alert, and the field is described by it as well as by the counter', async () => {
    render(Card, {
      app: await onACard({ cardState: 'answering', draft: 'x', error: 'CLIENT_SEAL_FAILED' }),
    });
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain(copy.error('CLIENT_SEAL_FAILED'));
    const field = screen.getByRole('textbox', { name: (n) => n.length > 0 });
    expect(field.getAttribute('aria-describedby')?.split(' ')).toEqual(['answer-count', alert.id]);
  });

  it('a delete that fails is an alert on the page about the app', () => {
    render(About, {
      app: onAScreen({ screen: 'about', code: '1234567890123456', error: 'SERVER_ERROR' }),
    });
    expect(screen.getByRole('alert').textContent).toBe(copy.error('SERVER_ERROR'));
  });

  it('the onboarding card reads in order: its label, its words, "Got it", then Set aside; the cards behind it are hidden', async () => {
    render(Card, { app: await onACard({ demoFront: true }) });
    const behind = document.querySelectorAll('.slot-1 .card, .slot-2 .card');
    expect(behind.length).toBe(2);
    for (const card of behind) expect(card.getAttribute('aria-hidden')).toBe('true');
    const order = [
      screen.getByText(copy.item('Card labels', 'demo label')),
      screen.getByText(copy.text('Demo card')),
      screen.getByRole('button', { name: copy.item('Buttons', 'got it') }),
      screen.getByRole('button', { name: copy.item('Buttons', 'set aside') }),
    ];
    for (let i = 1; i < order.length; i++)
      expect(
        order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
  });

  it('the welcome reads the consent before its one button', () => {
    render(Welcome, { app: onAScreen({}) });
    const paragraphs = copy.paragraphs('Welcome');
    const last = screen.getByText(paragraphs.at(-1)!);
    const button = screen.getByRole('button', { name: copy.item('Buttons', 'i understand') });
    expect(last.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole('button')).toEqual([button]);
  });
});

describe('the header and the foot (ADR 0023)', () => {
  const about = () => copy.item('Buttons', 'about');
  /** The header's two sides: the lines with the name on the left, then what stands on the right. */
  function sides() {
    const header = document.querySelector('header.topbar')!;
    const [left, right, ...rest] = [...header.children];
    return { header, left: left!, right, rest };
  }

  it('the header has the name on the left and one button on the right, named About this app, on the welcome, the card screen, closed and the invitation page; it opens the about page', async () => {
    const screens: [string, () => Promise<AppState> | AppState][] = [
      ['welcome', () => onAScreen({ screen: 'welcome' })],
      ['the card screen', () => onACard()],
      ['closed', () => onAScreen({ screen: 'closed' })],
      ['the invitation page', () => onAScreen({ screen: 'invitations', invitationWave: 'wave-1' })],
    ];
    for (const [where, make] of screens) {
      const app = await make();
      stubRoutes({ [`/api/${SLUG}/me`]: [ME] });
      const { unmount } = renderApp(app);
      const { left, right, rest } = sides();
      expect(left.classList.contains('lines'), where).toBe(true);
      expect(left.textContent, where).toContain(copy.item('App labels', 'app name'));
      expect(rest, where).toEqual([]);
      const buttons = [...right!.querySelectorAll('button')];
      expect(buttons, where).toHaveLength(1);
      expect(buttons[0]!.getAttribute('aria-label'), where).toBe(about());
      expect(buttons[0]!.textContent?.trim(), where).toBe('?');
      await userEvent.setup().click(screen.getByRole('button', { name: about() }));
      expect(
        await screen.findByRole('heading', { level: 1, name: copy.item('Titles', 'about') }),
        where,
      ).toBeTruthy();
      unmount();
    }
  });

  it('an address that is not a workshop has the name alone: there is no page about a workshop to open', () => {
    renderApp(Object.assign(new AppState(), { screen: 'no-workshop' }));
    expect(sides().right).toBeUndefined();
    expect(screen.queryByRole('button', { name: about() })).toBeNull();
  });

  it('the about page, the terms and the policy show Back and no question mark', () => {
    for (const page of ['about', 'terms', 'privacy'] as const) {
      const { unmount } = renderApp(onAScreen({ screen: page }));
      expect(document.querySelectorAll('header button'), page).toHaveLength(0);
      expect(screen.queryByRole('button', { name: about() }), page).toBeNull();
      expect(screen.getAllByRole('button', { name: copy.item('Buttons', 'back') }).length).toBe(2);
      unmount();
    }
  });

  it("the foot of a phone's card screen is the world pill alone; no other screen has a foot", async () => {
    const phone = renderApp(await onACard());
    const foot = document.querySelector('footer.foot')!;
    const buttons = [...foot.querySelectorAll('button')];
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.classList.contains('world')).toBe(true);
    expect(foot.textContent).not.toContain(about());
    phone.unmount();

    const laptop = renderApp(await onACard({ wide: true }));
    expect(document.querySelector('footer.foot')).toBeNull();
    laptop.unmount();
    for (const patch of [
      { screen: 'welcome' },
      { screen: 'closed' },
      { screen: 'about' },
      { screen: 'terms' },
      { screen: 'privacy' },
      { screen: 'invitations', invitationWave: 'wave-1' },
    ] as Partial<AppState>[]) {
      const { unmount } = renderApp(onAScreen(patch));
      expect(document.querySelector('footer.foot'), String(patch.screen)).toBeNull();
      unmount();
    }
  });
});

describe('the card screen keeps air (ADR 0023)', () => {
  /** The comment right above a rule, as written. */
  const commentAbove = (selector: string) => {
    const at = css.indexOf(`\n${selector} {`);
    const before = css.slice(0, at);
    return before.slice(before.lastIndexOf('/*'));
  };

  it("the stack's budget in the stylesheet matches the sum in its comment, and the parts are the stylesheet's own numbers", () => {
    const comment = commentAbove('.stack');
    const sum = comment.match(/((?:\d+ \+ )+\d+) = (\d+)/)!;
    const parts = sum[1]!.split(' + ').map(Number);
    const total = Number(sum[2]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
    expect(rule('.stack')['height']).toContain(`100dvh - ${total}px`);
    // The parts, in the order the comment gives them.
    const [safeTop, header, above, gap, rows, below, foot] = parts as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    expect(token('space-safe-top')).toContain(`+ ${safeTop}px`);
    expect(rule('.topbar')['height']).toBe(`${header}px`);
    const loop = rule('.loop')['padding']!.split(/\s+/);
    expect(loop[0]).toBe(`${above}px`);
    expect(loop.at(-1)).toBe(`${below}px`);
    expect(token('space-stack-gap')).toBe(`${gap}px`);
    // The three rows: Set aside, 8, the swipe hint, 8, Write your own story.
    expect(rows).toBe(44 + 8 + 16 + 8 + 44);
    expect(rule('.aside-row')['gap']).toBe('8px');
    // The foot: 8 above the pill, the pill, 10 under it (and the safe area).
    expect(rule('.foot')['padding']).toBe(
      '8px var(--space-page-x) calc(10px + var(--space-safe-bottom))',
    );
    expect(foot).toBe(8 + px(rule('.pill.world')['height']) + 10);
    // 16 of air over the highest painted edge: slot-2 reaches 52 up, less the 6% its scale takes
    // off a stack of at least 280, plus at most 8 for its 3 degrees on a card 326 wide.
    const reach = 52 - 0.06 * 280 + 0.44 * 326 * Math.sin((3 * Math.PI) / 180);
    expect(above - reach).toBeGreaterThanOrEqual(16);
  });

  it('the short-screen rule still holds: its line is where the three rows stop fitting at the floor, and one row fits at 553', () => {
    const comment = commentAbove('.stack');
    const total = Number(comment.match(/= (\d+)/)![1]);
    const floor = px(rule('.stack')['height']!.match(/clamp\(\s*(\d+)px/)![1]);
    const line = rules.find((r) => r.media?.startsWith('@media (max-height:'))!.media!;
    const threshold = px(line.match(/max-height: (\d+)px/)![1]);
    expect(threshold).toBeGreaterThanOrEqual(total + floor);
    // One row of 44 where there were 120.
    expect(total - (44 + 8 + 16 + 8 + 44) + 44 + floor).toBeLessThanOrEqual(553);
  });
});

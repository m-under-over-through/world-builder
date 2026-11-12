import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
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
    expect(rule('.foot .about')['min-height']).toBe('var(--tap)');
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

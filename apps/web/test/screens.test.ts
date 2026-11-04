import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import About from '../src/screens/About.svelte';
import Card from '../src/screens/Card.svelte';
import Closed from '../src/screens/Closed.svelte';
import NotAWorkshop from '../src/screens/NotAWorkshop.svelte';
import TextPage from '../src/screens/TextPage.svelte';
import Welcome from '../src/screens/Welcome.svelte';
import { fill, TRUST_BLOCKS } from '../src/lib/copy.ts';
import { currentCardId, replaySession, type LiveSession } from '../src/lib/session.ts';
import { AppState, tintOf } from '../src/lib/state.svelte.ts';
import { findWorkshop } from '../src/lib/workshops.ts';

/** A code, held by the state; no screen shows it (ADR 0018). */
const CODE = '1234567890123456';
const SHOWN_CODE = '1234 5678 9012 3456';

/**
 * Every screen renders on its own from a state a test sets up by hand, with the words of
 * copy.md read through the same loader the app uses. Behaviour across screens (routes, the
 * API, the store) is in app.test.ts; here each screen only has to show what it is given.
 */
const workshop = findWorkshop('rural-manufacturing')!;
const copy = workshop.copy;

function state(patch: Partial<AppState> = {}): AppState {
  const app = new AppState();
  app.workshop = workshop;
  app.copy = copy;
  Object.assign(app, patch);
  return app;
}

/** A first session with nothing done, and its first card on the screen. */
function onACard(patch: Partial<AppState> = {}): AppState {
  const live: LiveSession = replaySession(
    workshop.deck,
    workshop.config,
    {
      id: '00000000-0000-4000-8000-000000000001',
      sessionNo: 1,
      startedDay: '2026-11-16',
      deckVersion: workshop.deck.version,
      seed: '0123456789abcdef',
    },
    { sessions: [], events: [] },
  );
  const card = workshop.deck.cards.find((c) => c.id === currentCardId(live));
  return state({ live, card, cardNo: 1, ...patch });
}

describe('the screens render the words of copy.md', () => {
  it('not a workshop', () => {
    render(NotAWorkshop, { app: state() });
    expect(screen.getByText(copy.text('Not a workshop'))).toBeTruthy();
  });

  const iUnderstand = () =>
    screen.queryByRole('button', { name: copy.item('Buttons', 'i understand') });

  it('welcome, arrived through a link without a value: the one page before the cards, with the fanned cards as decoration, the title, the purpose, the paragraph, and "I understand" as its one button', () => {
    render(Welcome, { app: state({ arrival: { wave: 'wave-1' } }) });
    expect(
      screen.getByRole('heading', { level: 1, name: copy.text('Welcome: title') }),
    ).toBeTruthy();
    expect(screen.getByText(copy.text('Welcome: purpose'))).toBeTruthy();
    expect(screen.getByText(copy.text('Welcome'))).toBeTruthy();
    const button = iUnderstand()!;
    expect(button.classList.contains('primary')).toBe(true);
    expect(button.classList.contains('wide')).toBe(true);
    // The screen has one button: the consent, under the paragraph that states it.
    expect(screen.getAllByRole('button')).toHaveLength(1);
    const text = document.body.textContent!;
    expect(text.indexOf(copy.text('Welcome'))).toBeLessThan(text.indexOf(button.textContent!));
    const fan = document.querySelector('.fan')!;
    expect(fan.getAttribute('aria-hidden')).toBe('true');
    expect(fan.children).toHaveLength(4);
    expect(screen.queryByText(copy.text('Welcome: your link'))).toBeNull();
    expect(screen.queryByText(copy.text('Welcome: no link'))).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('welcome, the title and the purpose come from copy.md, not from workshop.json', () => {
    const renamed = { ...workshop, config: { ...workshop.config, name: 'x', purpose: 'y' } };
    render(Welcome, { app: state({ workshop: renamed, arrival: { wave: 'wave-1' } }) });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(copy.text('Welcome: title'));
    expect(screen.getByText(copy.text('Welcome: purpose'))).toBeTruthy();
  });

  it('welcome, arrived through a link with a value: "This link is yours" under the paragraph, and "I understand"', () => {
    render(Welcome, { app: state({ linkCode: CODE }) });
    expect(screen.getByText(copy.text('Welcome: your link'))).toBeTruthy();
    expect(iUnderstand()).toBeTruthy();
    expect(document.body.textContent).not.toContain(CODE);
  });

  it('welcome, arrived through an invite: "I understand" as well', () => {
    render(Welcome, { app: state({ arrival: { invite: 'abcDEF123_-abcDEF123_-' } }) });
    expect(iUnderstand()).toBeTruthy();
  });

  it('welcome, no link: the paragraph, "open the link you were sent" under it, and no button at all', () => {
    render(Welcome, { app: state() });
    expect(screen.getByText(copy.text('Welcome'))).toBeTruthy();
    expect(screen.getByText(copy.text('Welcome: no link'))).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('welcome, a refused join: its wording under the paragraph, never the code, and "I understand" again', () => {
    for (const code of ['RATE_LIMITED', 'SERVER_ERROR', 'JOIN_WAVE_UNKNOWN'] as const) {
      const { unmount } = render(Welcome, {
        app: state({ arrival: { wave: 'wave-1' }, error: code }),
      });
      expect(screen.getByText(copy.error(code))).toBeTruthy();
      expect(screen.queryByText(code)).toBeNull();
      expect(screen.queryByText(copy.item('App labels', 'retrying'))).toBeNull();
      expect(iUnderstand()).toBeTruthy();
      unmount();
    }
  });

  it('welcome after the stored code was refused: one quiet line, not a box, and only then', () => {
    const { unmount } = render(Welcome, { app: state({ codeRefused: true }) });
    const line = screen.getByText(copy.text('Welcome: link not accepted'));
    expect(line.getAttribute('role')).toBe('status');
    expect(line.classList.contains('warning')).toBe(false);
    expect(document.querySelector('.warning')).toBeNull();
    unmount();
    render(Welcome, { app: state() });
    expect(screen.queryByText(copy.text('Welcome: link not accepted'))).toBeNull();
  });

  it('welcome while a refused join waits for its retry: the "trying again" line, and "I understand" off', () => {
    render(Welcome, {
      app: state({ arrival: { wave: 'wave-1' }, retrying: true, joining: true }),
    });
    expect(screen.getByText(copy.item('App labels', 'retrying'))).toBeTruthy();
    expect((iUnderstand() as HTMLButtonElement).disabled).toBe(true);
  });

  it('the card, fresh: one button with the area as its label, the question, and the pen with "Write an answer"; Set aside and the swipe hint under it; no field', () => {
    const app = onACard();
    render(Card, { app });
    const front = screen.getByRole('button', { name: (n) => n.includes(app.card!.text) });
    expect(front.classList.contains('card')).toBe(true);
    expect(front.querySelector('.label')!.textContent).toBe(app.card!.area);
    expect(front.querySelector('.affordance')!.textContent!.trim()).toBe(
      copy.item('Card labels', 'write an answer'),
    );
    expect(front.querySelector('.affordance svg')!.getAttribute('aria-hidden')).toBe('true');
    // No numbers anywhere (ADR 0019): not "01 of 4", not "01".
    expect(front.textContent).not.toMatch(/\d+ of \d+|\b0\d\b/);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('button', { name: copy.item('Buttons', 'set aside') })).toBeTruthy();
    expect(screen.getByText(copy.item('Card labels', 'swipe hint'))).toBeTruthy();
    // The two cards behind are decoration.
    expect(document.querySelectorAll('.card.back[aria-hidden="true"]')).toHaveLength(2);
  });

  it('the card, answering: the question as the label of the field, the counter alone under it and described, × and Save, and no Set aside', () => {
    const app = onACard({ cardState: 'answering' });
    render(Card, { app });
    const field = screen.getByRole('textbox', { name: app.card!.text });
    expect(field.getAttribute('aria-describedby')).toBe('answer-count');
    // The nudge left the open card (ADR 0019): the row under the field holds the counter only.
    const meta = document.querySelector('.card.open .meta')!;
    expect([...meta.children].map((c) => c.id)).toEqual(['answer-count']);
    expect(document.getElementById('answer-nudge')).toBeNull();
    expect(document.querySelector('.card.open .label')!.textContent).toBe(app.card!.area);
    expect(
      screen.getByRole('button', { name: copy.item('Card labels', 'close without saving') }),
    ).toBeTruthy();
    const save = screen.getByRole('button', {
      name: copy.item('Buttons', 'save'),
    }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(screen.queryByRole('button', { name: copy.item('Buttons', 'set aside') })).toBeNull();
    expect(screen.queryByText(copy.item('Card labels', 'swipe hint'))).toBeNull();
  });

  it('the card keeps the draft the state holds', () => {
    render(Card, { app: onACard({ cardState: 'answering', draft: 'Half an answer' }) });
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Half an answer');
    expect(
      (screen.getByRole('button', { name: copy.item('Buttons', 'save') }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it('the card, saving: Save reads "Saving…" and is off, as is the field', () => {
    render(Card, { app: onACard({ cardState: 'saving', draft: 'An answer' }) });
    const save = screen.getByRole('button', {
      name: copy.item('Card states', 'saving'),
    }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(true);
  });

  it('the onboarding card: the tinted front of the stack, "Try a card" as its label, its words, "Got it" as an ink pill; the first card waits behind it in its tint, not a button', () => {
    const app = onACard({ demoFront: true });
    render(Card, { app });
    const demo = document.querySelector('.card.demo')!;
    expect(demo.closest('.slot')!.classList.contains('slot-0')).toBe(true);
    expect(tintOf(0)).toBe('lilac');
    expect((demo.closest('.slot') as HTMLElement).style.getPropertyValue('--tint')).toBe(
      'var(--tint-lilac)',
    );
    expect(demo.querySelector('.label')!.textContent).toBe(copy.item('Card labels', 'demo label'));
    expect(demo.querySelector('.demo-words')!.textContent).toBe(copy.text('Demo card'));
    const gotIt = screen.getByRole('button', { name: copy.item('Buttons', 'got it') });
    expect(gotIt.classList.contains('pill')).toBe(true);
    expect(demo.contains(gotIt)).toBe(true);
    // The first card is behind, in slot 1 and in its own tint, decoration until the onboarding card goes.
    const behind = document.querySelector('.slot-1')! as HTMLElement;
    expect(behind.style.getPropertyValue('--tint')).toBe('var(--tint-sun)');
    expect(behind.querySelector('.card.back')!.getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByRole('button', { name: (n) => n.includes(app.card!.text) })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    // Set aside stays under the stack: it sends the onboarding card away, as a swipe does.
    expect(screen.getByRole('button', { name: copy.item('Buttons', 'set aside') })).toBeTruthy();
  });

  it('the open card with the dictation hint open: its title once, the line for this platform, and "Got it"', () => {
    render(Card, { app: onACard({ cardState: 'answering', platform: 'Windows', hintOpen: true }) });
    expect(
      screen.getByRole('heading', { name: copy.item('Titles', 'dictation hint') }),
    ).toBeTruthy();
    expect(screen.getAllByText(copy.item('Titles', 'dictation hint'))).toHaveLength(1);
    expect(screen.getByText(copy.item('Dictation hint', 'Windows'))).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.item('Buttons', 'got it') })).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: copy.item('Buttons', 'prefer to talk') }),
    ).toBeNull();
  });

  it('the open card with the hint closed: "Prefer to talk?" on a platform that has dictation', () => {
    render(Card, {
      app: onACard({ cardState: 'answering', platform: 'Android', hintOpen: false }),
    });
    expect(
      screen.getByRole('button', { name: copy.item('Buttons', 'prefer to talk') }),
    ).toBeTruthy();
    expect(screen.queryByText(copy.item('Dictation hint', 'Android'))).toBeNull();
  });

  it('the open card on a platform with no dictation: no hint and no "Prefer to talk?"', () => {
    render(Card, { app: onACard({ cardState: 'answering', platform: null, hintOpen: true }) });
    expect(
      screen.queryByRole('button', { name: copy.item('Buttons', 'prefer to talk') }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: copy.item('Buttons', 'got it') })).toBeNull();
  });

  it('the open card with a sealing failure: the CLIENT_SEAL_FAILED wording', () => {
    render(Card, { app: onACard({ cardState: 'answering', error: 'CLIENT_SEAL_FAILED' }) });
    expect(screen.getByText(copy.error('CLIENT_SEAL_FAILED'), { exact: false })).toBeTruthy();
  });

  it('"Your world so far" in the laptop column: the "Remind me" line at its foot, under the tiles and the set-aside cards, with the link to the calendar file', () => {
    render(Card, { app: onACard({ wide: true }) });
    const world = screen.getByRole('region', { name: copy.item('Your world', 'title') });
    const remind = screen.getByRole('link', { name: copy.item('Buttons', 'remind me') });
    expect(remind.getAttribute('href')).toBe('/rural-manufacturing/reminder.ics');
    expect(world.contains(remind)).toBe(true);
    const line = remind.closest('p')!;
    expect(line.classList.contains('remind')).toBe(true);
    expect(line.textContent).toContain(copy.text('Remind me'));
    expect(world.lastElementChild).toBe(line);
    // Said once on the page, and the stack beside it does not say it.
    expect(screen.getAllByText(copy.text('Remind me'), { exact: false })).toHaveLength(1);
  });

  it('closed: the words, and nothing else on the screen itself', () => {
    render(Closed, { app: state() });
    expect(screen.getByText(copy.text('Closed'))).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('the page about the app: Back at the top, what this is, the plain sentences, the technical details folded, delete, Back, the foot', () => {
    render(About, { app: state({ screen: 'about', code: CODE }) });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: copy.item('Titles', 'about') })).toBeTruthy();
    const text = document.body.textContent!.replace(/\s+/g, ' ');
    const order = [
      copy.text('About: what this is'),
      copy.text('Remind me'),
      copy.text('About: in short'),
      copy.item('Titles', 'technical details'),
      copy.item('Titles', 'trust page'),
      copy.item('Titles', 'privacy panel'),
      copy.text('About: delete'),
      copy.item('Trust page links', 'terms'),
    ].map((s) => text.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // The trust page, the facts and the diagnostics are one closed fold; delete and the foot are outside it.
    const details = document.querySelector('details.technical') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.querySelector('summary')!.textContent!.trim()).toBe(
      copy.item('Titles', 'technical details'),
    );
    expect(details.contains(document.getElementById('about-protected'))).toBe(true);
    expect(details.contains(document.getElementById('about-now'))).toBe(true);
    expect(details.contains(document.getElementById('about-delete'))).toBe(false);
    expect(details.contains(document.querySelector('footer.page-foot'))).toBe(false);
    // Back twice: a ghost pill above the title, and the one at the bottom.
    const backs = screen.getAllByRole('button', { name: copy.item('Buttons', 'back') });
    expect(backs).toHaveLength(2);
    expect(backs[0]!.classList.contains('back-pill')).toBe(true);
    expect(
      backs[0]!.compareDocumentPosition(screen.getByRole('heading', { level: 1 })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // "Remind me" moved here from the session end (ADR 0017), under "what this is".
    const remind = screen.getByRole('link', { name: copy.item('Buttons', 'remind me') });
    expect(remind.getAttribute('href')).toBe('/rural-manufacturing/reminder.ics');
  });

  it('the page about the app: how answers are protected, the six paragraphs in order, the fingerprint and the source filled in, the links', () => {
    render(About, { app: state({ screen: 'about' }) });
    const text = document.body.textContent!.replace(/\s+/g, ' ');
    const slots = {
      'key fingerprint': workshop.keyFingerprint,
      source: copy.item('Trust page variables', 'source'),
    };
    const positions = TRUST_BLOCKS.map((block) =>
      text.indexOf(fill(copy.paragraphs(block)[0]!, slots).slice(0, 40)),
    );
    expect(positions.every((i) => i >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(text).toContain(workshop.keyFingerprint);
    expect(text).not.toContain('[key fingerprint]');
    expect(text).not.toContain('[source]');
    const source = screen.getByRole('link', {
      name: copy.item('Trust page links', 'source'),
    }) as HTMLAnchorElement;
    expect(source.href).toContain(copy.item('Trust page variables', 'source'));
    expect(
      (
        screen.getByRole('link', {
          name: copy.item('Trust page links', 'webbkoll'),
        }) as HTMLAnchorElement
      ).href,
    ).toBe(copy.item('Trust page variables', 'webbkoll'));
    expect(
      (
        screen.getByRole('link', {
          name: copy.item('Trust page links', 'blacklight'),
        }) as HTMLAnchorElement
      ).href,
    ).toBe(copy.item('Trust page variables', 'blacklight'));
    expect(
      screen.getByRole('button', { name: copy.item('Trust page links', 'terms') }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: copy.item('Trust page links', 'privacy policy') }),
    ).toBeTruthy();
  });

  it('the terms and the privacy policy: every paragraph, the lead-ins in bold, no stars on the screen', () => {
    for (const [page, block] of [
      ['terms', 'Terms'],
      ['privacy', 'Privacy policy'],
    ] as const) {
      const { unmount } = render(TextPage, { app: state({ screen: page }) });
      expect(
        screen.getByText(copy.item('Titles', page === 'terms' ? 'terms' : 'privacy policy')),
      ).toBeTruthy();
      expect(document.querySelectorAll('p').length).toBe(copy.paragraphs(block).length);
      expect(document.body.textContent).not.toContain('**');
      expect(document.querySelectorAll('strong').length).toBeGreaterThan(3);
      // Back above the title, and Back at the bottom.
      const backs = screen.getAllByRole('button', { name: copy.item('Buttons', 'back') });
      expect(backs).toHaveLength(2);
      expect(backs[0]!.classList.contains('back-pill')).toBe(true);
      expect(document.querySelector('.top-back + h1')).toBeTruthy();
      unmount();
    }
  });

  it('the page about the app without a code: every fact, nothing stored, no delete', () => {
    render(About, { app: state() });
    for (const key of [
      'cookies',
      'hosts',
      'permissions',
      'key',
      'stored',
      'waiting',
      'version',
    ] as const)
      expect(screen.getByText(copy.item('Privacy panel', key))).toBeTruthy();
    expect(screen.getByText(copy.item('Privacy panel', 'nothing stored'))).toBeTruthy();
    expect(screen.queryByRole('button', { name: copy.item('Buttons', 'delete') })).toBeNull();
    expect(screen.queryByText(copy.text('About: delete'))).toBeNull();
  });

  it('the page about the app with a code: the code nowhere on it (ADR 0018), the delete line and button, the last error', () => {
    render(About, {
      app: state({
        code: CODE,
        lastError: 'CLIENT_SYNC_FAILED',
        sync: {
          lastResult: 'error',
          lastError: 'CLIENT_SYNC_FAILED',
          outboxSize: 2,
          outboxSessions: 1,
        },
      }),
    });
    expect(document.body.textContent).not.toContain(CODE);
    expect(document.body.textContent).not.toContain(SHOWN_CODE);
    expect(document.getElementById('about-code')).toBeNull();
    expect(screen.getByText(copy.text('About: delete'))).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.item('Buttons', 'delete') })).toBeTruthy();
    expect(screen.getByText('CLIENT_SYNC_FAILED')).toBeTruthy();
    expect(screen.getByText(copy.error('CLIENT_SYNC_FAILED'), { exact: false })).toBeTruthy();
    expect(
      screen.getByText(
        fill(copy.item('Privacy panel', 'outbox summary'), { events: 2, sessions: 1 }),
      ),
    ).toBeTruthy();
    // One accent button at most: none here, until the delete is confirmed.
    expect(document.querySelectorAll('button.primary')).toHaveLength(0);
  });

  const ME = {
    workshop: {
      slug: 'rural-manufacturing',
      name: 'x',
      closesDay: '2026-12-06',
      deleteDay: '2027-02-05',
    },
    participant: { createdDay: '2026-11-16', invitesLeft: 3, wave: 'wave-1', sessionsCount: 1 },
    sessions: [
      {
        id: '00000000-0000-4000-8000-000000000001',
        sessionNo: 1,
        startedDay: '2026-11-16',
        deckVersion: '0.1',
        seed: '0123456789abcdef',
      },
    ],
    events: [
      {
        id: '10000000-0000-4000-8000-000000000001',
        sessionId: '00000000-0000-4000-8000-000000000001',
        cardId: 'cool',
        seq: 0,
        kind: 'shown' as const,
        createdDay: '2026-11-16',
        deckVersion: '0.1',
      },
      {
        id: '10000000-0000-4000-8000-000000000002',
        sessionId: '00000000-0000-4000-8000-000000000001',
        cardId: 'cool',
        seq: 1,
        kind: 'answered' as const,
        body: 'v1.' + 'Q'.repeat(80),
        createdDay: '2026-11-16',
        deckVersion: '0.1',
      },
      {
        id: '10000000-0000-4000-8000-000000000003',
        sessionId: '00000000-0000-4000-8000-000000000001',
        cardId: 'on-tv',
        seq: 2,
        kind: 'deferred' as const,
        createdDay: '2026-11-17',
        deckVersion: '0.1',
      },
    ],
  };

  it('the page about the app: what we hold, row by row and in plain words, the sealed body shown as sealed', () => {
    render(About, { app: state({ code: CODE, me: ME, lastSyncDay: '2026-11-17' }) });
    const panel = copy.sections.get('Privacy panel')!.items;
    expect(
      screen.getByText(fill(panel['stored summary']!, { sessions: 1, events: 3 }), {
        exact: false,
      }),
    ).toBeTruthy();
    expect(screen.getByText(fill(panel['session row']!, { n: 1, day: '2026-11-16' }))).toBeTruthy();
    const text = document.body.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain(
      fill(panel['event row']!, {
        kind: copy.item('Event kinds', 'deferred'),
        card: 'on-tv',
        seq: 2,
        day: '2026-11-17',
        version: '0.1',
      }),
    );
    expect(text).toContain(fill(panel['sealed body']!, { chars: 83 }));
    expect(text).not.toContain('QQQQ');
    expect(text).toContain(`${panel['joined']} 2026-11-16`);
    expect(text).toContain(`${panel['came through']} wave-1`);
    expect(text).toContain(`${panel['invites left']} 3`);
    expect(text).toContain(fill(panel['last sync day']!, { day: '2026-11-17' }));
    expect(screen.getByText(copy.text('Privacy panel: caveat'))).toBeTruthy();
    // No field for a code on this page, and no second copy of the plan: said once above.
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('the page about the app links to the source at the running version, twice: with the checks and with the version', () => {
    render(About, { app: state() });
    const links = screen.getAllByRole('link') as HTMLAnchorElement[];
    const source = copy.item('Trust page variables', 'source');
    expect(links.filter((a) => a.href.startsWith(source))).toHaveLength(2);
  });

  it('the page about the app, a code the server could not be asked about: "could not be read"', () => {
    render(About, { app: state({ code: CODE, me: null }) });
    expect(screen.getByText(copy.item('Privacy panel', 'not reachable'))).toBeTruthy();
  });

  it('the page about the app opened at /trust or /panel: the fold is open; at /about it is closed', () => {
    for (const [section, open] of [
      ['protected', true],
      ['now', true],
      [null, false],
    ] as const) {
      const { unmount } = render(About, { app: state({ aboutSection: section }) });
      expect((document.querySelector('details.technical') as HTMLDetailsElement).open).toBe(open);
      unmount();
    }
  });

  it("the page about the app: the microphone row says, beside its value, that dictation is the keyboard's own", () => {
    render(About, { app: state() });
    const row = screen.getByText(copy.item('Privacy panel', 'permissions')).closest('div')!;
    const value = row.querySelector('dd')!;
    expect(value.textContent).toContain(copy.item('Privacy panel', 'permissions value'));
    expect(value.querySelector('.note')!.textContent).toBe(
      copy.item('Privacy panel', 'permissions note'),
    );
  });

  it('the page about the app: the delete button reads "Delete everything and start over", and the terms and the policy are quiet links in the foot', () => {
    render(About, { app: state({ code: CODE }) });
    expect(screen.getByRole('button', { name: copy.item('Buttons', 'delete') }).textContent).toBe(
      'Delete everything and start over',
    );
    const foot = document.querySelector('footer.page-foot')!;
    expect([...foot.querySelectorAll('button.link')].map((b) => b.textContent)).toEqual([
      copy.item('Trust page links', 'terms'),
      copy.item('Trust page links', 'privacy policy'),
    ]);
  });

  it('the page about the app, delete in two steps: the question with "yes" and "keep" only after the first tap', () => {
    const { unmount } = render(About, { app: state({ code: CODE }) });
    expect(screen.queryByText(copy.text('Privacy panel: delete confirm'))).toBeNull();
    expect(screen.queryByRole('button', { name: copy.item('Buttons', 'yes delete') })).toBeNull();
    unmount();
    render(About, { app: state({ code: CODE, confirmingDelete: true }) });
    expect(screen.getByText(copy.text('Privacy panel: delete confirm'))).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.item('Buttons', 'yes delete') })).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.item('Buttons', 'keep') })).toBeTruthy();
    expect(screen.queryByRole('button', { name: copy.item('Buttons', 'delete') })).toBeNull();
  });
});

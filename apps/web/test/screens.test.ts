import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import About from '../src/screens/About.svelte';
import Card from '../src/screens/Card.svelte';
import Closed from '../src/screens/Closed.svelte';
import DemoCard from '../src/screens/DemoCard.svelte';
import EnterCode from '../src/screens/EnterCode.svelte';
import Intro from '../src/screens/Intro.svelte';
import NotAWorkshop from '../src/screens/NotAWorkshop.svelte';
import SessionEnd from '../src/screens/SessionEnd.svelte';
import TextPage from '../src/screens/TextPage.svelte';
import Welcome from '../src/screens/Welcome.svelte';
import { fill, TRUST_BLOCKS } from '../src/lib/copy.ts';
import { currentCardId, replaySession, type LiveSession } from '../src/lib/session.ts';
import { AppState } from '../src/lib/state.svelte.ts';
import { findWorkshop } from '../src/lib/workshops.ts';

/** A code as the screens show it: four groups of four. */
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

  it('welcome, arrived through a link: the "New here" button, and under it one quiet line with the "I have a code" link', () => {
    render(Welcome, { app: state({ arrival: { wave: 'wave-1' } }) });
    const newHere = screen.getByRole('button', { name: copy.item('Buttons', 'new here') });
    expect(newHere.classList.contains('primary')).toBe(true);
    expect(screen.getByText(copy.text('Welcome: new here'))).toBeTruthy();
    const haveACode = screen.getByRole('button', { name: copy.item('Buttons', 'i have a code') });
    // A text link, not a second button, in the line that introduces it.
    expect(haveACode.classList.contains('link')).toBe(true);
    expect(haveACode.closest('p')?.textContent).toContain(copy.text('Welcome: I have a code'));
    expect(
      newHere.compareDocumentPosition(haveACode) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByText(copy.text('Welcome: no link'))).toBeNull();
    // The screen has one button in the accent.
    expect(document.querySelectorAll('button.primary')).toHaveLength(1);
  });

  it('welcome, arrived through an invite: "New here" as well', () => {
    render(Welcome, { app: state({ arrival: { invite: 'abcDEF123_-abcDEF123_-' } }) });
    expect(screen.getByRole('button', { name: copy.item('Buttons', 'new here') })).toBeTruthy();
  });

  it('welcome, no link: "open the link you were sent" instead of "New here", and still "I have a code"', () => {
    render(Welcome, { app: state() });
    expect(screen.getByText(copy.text('Welcome: no link'))).toBeTruthy();
    expect(screen.queryByText(copy.text('Welcome: new here'))).toBeNull();
    expect(screen.queryByRole('button', { name: copy.item('Buttons', 'new here') })).toBeNull();
    expect(
      screen.getByRole('button', { name: copy.item('Buttons', 'i have a code') }),
    ).toBeTruthy();
    expect(screen.getByText(copy.text('Welcome: I have a code'), { exact: false })).toBeTruthy();
  });

  it('enter code, with the too-short line and an error line in their wording', () => {
    render(EnterCode, { app: state({ tooShort: true, error: 'AUTH_CODE_UNKNOWN' }) });
    expect(screen.getByText(copy.text('Enter code'))).toBeTruthy();
    expect(screen.getByText(copy.text('Enter code: too short'))).toBeTruthy();
    expect(screen.getByText(copy.error('AUTH_CODE_UNKNOWN'))).toBeTruthy();
    expect(screen.getByRole('textbox')).toBeTruthy();
  });

  it('intro 1 and intro 2: the copy, Next and Back', () => {
    render(Intro, { app: state({ screen: 'intro-1' }) });
    expect(screen.getByText(copy.text('Intro 1'))).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.item('Buttons', 'next') })).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.item('Buttons', 'back') })).toBeTruthy();
    render(Intro, { app: state({ screen: 'intro-2' }) });
    expect(screen.getByText(copy.text('Intro 2'))).toBeTruthy();
  });

  it('intro 3, consent: the draft, "I understand", Back, and an error in its wording', () => {
    render(Intro, { app: state({ screen: 'consent', error: 'RATE_LIMITED' }) });
    expect(screen.getByText(copy.text('Intro 3, consent'))).toBeTruthy();
    expect(screen.getByText(copy.error('RATE_LIMITED'))).toBeTruthy();
    expect(screen.queryByText(copy.item('App labels', 'retrying'))).toBeNull();
    expect(screen.getByRole('button', { name: copy.item('Buttons', 'i understand') })).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.item('Buttons', 'back') })).toBeTruthy();
  });

  it('intro 3, consent: SERVER_ERROR and JOIN_WAVE_UNKNOWN in their wording, never as codes', () => {
    for (const code of ['SERVER_ERROR', 'JOIN_WAVE_UNKNOWN'] as const) {
      const { unmount } = render(Intro, { app: state({ screen: 'consent', error: code }) });
      expect(screen.getByText(copy.error(code))).toBeTruthy();
      expect(screen.queryByText(code)).toBeNull();
      unmount();
    }
  });

  it('welcome after the stored code was refused: one quiet line, not a box, and only then', () => {
    const { unmount } = render(Welcome, { app: state({ codeRefused: true }) });
    const line = screen.getByText(copy.text('Welcome: code not accepted'));
    expect(line.getAttribute('role')).toBe('status');
    expect(line.classList.contains('warning')).toBe(false);
    expect(document.querySelector('.warning')).toBeNull();
    unmount();
    render(Welcome, { app: state() });
    expect(screen.queryByText(copy.text('Welcome: code not accepted'))).toBeNull();
  });

  it('intro 3 while a refused join waits for its retry: the "trying again" line', () => {
    render(Intro, { app: state({ screen: 'consent', retrying: true, joining: true }) });
    expect(screen.getByText(copy.item('App labels', 'retrying'))).toBeTruthy();
  });

  it('the card keeps the draft the state holds', () => {
    render(Card, { app: onACard({ draft: 'Half an answer' }) });
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Half an answer');
  });

  it('the demo card: the explanation and "Got it"', () => {
    render(DemoCard, { app: state({ screen: 'demo' }) });
    expect(screen.getByText(copy.text('Demo card'))).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.item('Buttons', 'got it') })).toBeTruthy();
  });

  it('the card with the dictation hint open: its title once, the line for this platform, and "Got it"', () => {
    render(Card, { app: onACard({ platform: 'Windows', hintOpen: true }) });
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

  it('the card with the hint closed: "Prefer to talk?" on a platform that has dictation', () => {
    render(Card, { app: onACard({ platform: 'Android', hintOpen: false }) });
    expect(
      screen.getByRole('button', { name: copy.item('Buttons', 'prefer to talk') }),
    ).toBeTruthy();
    expect(screen.queryByText(copy.item('Dictation hint', 'Android'))).toBeNull();
  });

  it('the card on a platform with no dictation: no hint and no "Prefer to talk?"', () => {
    render(Card, { app: onACard({ platform: null, hintOpen: true }) });
    expect(
      screen.queryByRole('button', { name: copy.item('Buttons', 'prefer to talk') }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: copy.item('Buttons', 'got it') })).toBeNull();
  });

  it('the card, fresh: the question, the nudge, the position, Save and Set aside, and no state line', () => {
    const app = onACard();
    render(Card, { app });
    expect(screen.getByText(app.card!.text)).toBeTruthy();
    expect(screen.getByText(copy.text('Card nudge'), { exact: false })).toBeTruthy();
    expect(
      screen.getByText(fill(copy.item('Card labels', 'position'), { n: 1, total: 4 })),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.item('Buttons', 'set aside') })).toBeTruthy();
    for (const key of ['saving', 'saved', 'synced', 'offline', 'sync problem'] as const)
      expect(screen.queryByText(copy.item('Card states', key))).toBeNull();
  });

  it('the card in each state after Save: its line, with the field and the buttons off', () => {
    for (const key of ['saving', 'saved', 'synced', 'offline', 'sync problem'] as const) {
      const { unmount } = render(Card, { app: onACard({ cardState: key, draft: '' }) });
      expect(screen.getByText(copy.item('Card states', key))).toBeTruthy();
      expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(true);
      expect(
        (
          screen.getByRole('button', {
            name: copy.item('Buttons', 'set aside'),
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      unmount();
    }
  });

  it('the card with a sealing failure: the CLIENT_SEAL_FAILED wording', () => {
    render(Card, { app: onACard({ error: 'CLIENT_SEAL_FAILED' }) });
    expect(screen.getByText(copy.error('CLIENT_SEAL_FAILED'), { exact: false })).toBeTruthy();
  });

  /** The session end of a first session, on a phone, with the install offer due. */
  function atTheEnd(patch: Partial<AppState> = {}): AppState {
    const app = onACard({ code: CODE, card: undefined, installOffered: true, ...patch });
    app.platform = patch.platform === undefined ? 'iPhone and iPad' : patch.platform;
    return app;
  }

  it('the end of the first session: one heading, the code in its sentence with Copy, the install offer, the come-back line with "Remind me"', () => {
    render(SessionEnd, { app: atTheEnd() });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: copy.item('Titles', 'session end') })).toBeTruthy();
    const sentence = copy.text('Session end: your code').split('[code]');
    const code = screen.getByText(SHOWN_CODE);
    expect(code.closest('p')?.textContent?.replace(/\s+/g, ' ')).toContain(sentence[0]!.trim());
    expect(screen.getByRole('button', { name: copy.item('Buttons', 'copy') })).toBeTruthy();
    expect(screen.getByText(copy.item('Titles', 'install'))).toBeTruthy();
    expect(
      screen.getByText(copy.item('Install steps', 'iPhone and iPad'), { exact: false }),
    ).toBeTruthy();
    expect(screen.getAllByText(copy.text('Session end: come back'), { exact: false })).toHaveLength(
      1,
    );
    const remind = screen.getByRole('link', { name: copy.item('Buttons', 'remind me') });
    expect(remind.getAttribute('href')).toBe('/rural-manufacturing/reminder.ics');
    // The code comes before the install offer, the come-back line after both (architecture plan 8.1).
    const text = document.body.textContent!;
    expect(text.indexOf(SHOWN_CODE)).toBeLessThan(text.indexOf(copy.item('Titles', 'install')));
    expect(text.indexOf(copy.item('Titles', 'install'))).toBeLessThan(
      text.indexOf(copy.text('Session end: come back')),
    );
  });

  it('the session end never says the same thing twice, and nothing is masked', () => {
    render(SessionEnd, { app: atTheEnd() });
    const text = document.body.textContent!.replace(/\s+/g, ' ');
    const title = copy.item('Titles', 'session end');
    expect(text.split(title)).toHaveLength(2);
    expect(text.split(copy.text('Session end: come back'))).toHaveLength(2);
    expect(text).not.toContain('•');
    expect(screen.queryByText(copy.item('Session end', 'waiting to sync'))).toBeNull();
  });

  it('the install offer: on an iPhone the steps say it asks for the code once, and no "Install" button; on Android with an offer, "Install"', () => {
    const { unmount } = render(SessionEnd, { app: atTheEnd() });
    expect(copy.item('Install steps', 'iPhone and iPad')).toContain('code');
    expect(screen.queryByRole('button', { name: copy.item('Buttons', 'install') })).toBeNull();
    unmount();
    const offer = Object.assign(new Event('beforeinstallprompt'), { prompt: async () => {} });
    render(SessionEnd, { app: atTheEnd({ platform: 'Android', installOffer: offer }) });
    expect(screen.getByRole('button', { name: copy.item('Buttons', 'install') })).toBeTruthy();
    expect(screen.getByText(copy.item('Install steps', 'Android'), { exact: false })).toBeTruthy();
  });

  it('the end of the first session without the offer (installed, or no steps): the code and the come-back line only', () => {
    render(SessionEnd, { app: atTheEnd({ installOffered: false }) });
    expect(screen.getByText(SHOWN_CODE)).toBeTruthy();
    expect(screen.queryByText(copy.item('Titles', 'install'))).toBeNull();
    expect(screen.getByRole('link', { name: copy.item('Buttons', 'remind me') })).toBeTruthy();
  });

  it('the session end with answers waiting: the quiet count in its wording; none when nothing waits', () => {
    const { unmount } = render(SessionEnd, {
      app: atTheEnd({ sync: { lastResult: 'offline', outboxSize: 3, outboxSessions: 0 } }),
    });
    const line = screen.getByText(fill(copy.item('Session end', 'waiting to sync'), { n: 3 }));
    expect(line.classList.contains('muted')).toBe(true);
    unmount();
    render(SessionEnd, { app: atTheEnd() });
    expect(document.body.textContent).not.toContain('waiting to sync');
  });

  it('the end of a later session: thanks, the come-back line once with "Remind me", no code, no offer', () => {
    const app = atTheEnd();
    app.live = { ...app.live!, session: { ...app.live!.session, sessionNo: 2 } };
    render(SessionEnd, { app });
    expect(screen.getByRole('heading', { name: copy.item('Titles', 'session end') })).toBeTruthy();
    expect(screen.getAllByText(copy.text('Session end: come back'), { exact: false })).toHaveLength(
      1,
    );
    expect(screen.getByRole('link', { name: copy.item('Buttons', 'remind me') })).toBeTruthy();
    expect(screen.queryByText(SHOWN_CODE)).toBeNull();
    expect(screen.queryByRole('button', { name: copy.item('Buttons', 'copy') })).toBeNull();
    expect(screen.queryByText(copy.item('Titles', 'install'))).toBeNull();
  });

  it('closed: the words, and nothing else on the screen itself', () => {
    render(Closed, { app: state() });
    expect(screen.getByText(copy.text('Closed'))).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it("the page about the app: its sections in the brief's order, under one title", () => {
    render(About, { app: state({ screen: 'about', code: CODE }) });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: copy.item('Titles', 'about') })).toBeTruthy();
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      copy.item('Titles', 'trust page'),
      copy.item('Privacy panel', 'code'),
      copy.item('Titles', 'privacy panel'),
    ]);
    const text = document.body.textContent!.replace(/\s+/g, ' ');
    const order = [
      copy.text('About: what this is'),
      copy.item('Titles', 'trust page'),
      copy.item('Privacy panel', 'code'),
      SHOWN_CODE,
      copy.item('Titles', 'privacy panel'),
      copy.text('About: delete'),
      copy.item('Trust page links', 'terms'),
    ].map((s) => text.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(document.getElementById('about-protected')).toBeTruthy();
    expect(document.getElementById('about-now')).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.item('Buttons', 'back') })).toBeTruthy();
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
      unmount();
    }
  });

  it('the page about the app without a code: every fact, no code yet, nothing stored, no delete', () => {
    render(About, { app: state() });
    for (const key of [
      'code',
      'cookies',
      'hosts',
      'permissions',
      'key',
      'stored',
      'waiting',
      'version',
    ] as const)
      expect(screen.getByText(copy.item('Privacy panel', key))).toBeTruthy();
    expect(screen.getByText(copy.item('Privacy panel', 'no code yet'))).toBeTruthy();
    expect(screen.getByText(copy.item('Privacy panel', 'nothing stored'))).toBeTruthy();
    expect(screen.queryByRole('button', { name: copy.item('Buttons', 'delete') })).toBeNull();
    expect(screen.queryByText(copy.text('About: delete'))).toBeNull();
    expect(screen.queryByRole('button', { name: copy.item('Buttons', 'copy') })).toBeNull();
  });

  it('the page about the app with a code: the code shown plainly with Copy and no reveal, the delete line and button, the last error', () => {
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
    expect(screen.getByText(SHOWN_CODE)).toBeTruthy();
    expect(document.body.textContent).not.toContain('•');
    expect(screen.getByRole('button', { name: copy.item('Buttons', 'copy') })).toBeTruthy();
    expect(screen.getByText(copy.item('Privacy panel', 'code note'))).toBeTruthy();
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
    // No way in for another code on this page, and no second copy of the plan: said once above.
    expect(
      screen.queryByRole('button', { name: copy.item('Buttons', 'i have a code') }),
    ).toBeNull();
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

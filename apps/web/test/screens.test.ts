import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Card from '../src/screens/Card.svelte';
import Closed from '../src/screens/Closed.svelte';
import DemoCard from '../src/screens/DemoCard.svelte';
import EnterCode from '../src/screens/EnterCode.svelte';
import Intro from '../src/screens/Intro.svelte';
import NotAWorkshop from '../src/screens/NotAWorkshop.svelte';
import PrivacyPanel from '../src/screens/PrivacyPanel.svelte';
import SessionEnd from '../src/screens/SessionEnd.svelte';
import TextPage from '../src/screens/TextPage.svelte';
import Trust from '../src/screens/Trust.svelte';
import Welcome from '../src/screens/Welcome.svelte';
import { fill } from '../src/lib/copy.ts';
import { currentCardId, replaySession, type LiveSession } from '../src/lib/session.ts';
import { AppState, MASKED_CODE } from '../src/lib/state.svelte.ts';
import { findWorkshop } from '../src/lib/workshops.ts';

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
  return state({ live, card, ...patch });
}

describe('the screens render the words of copy.md', () => {
  it('not a workshop', () => {
    render(NotAWorkshop, { app: state() });
    expect(screen.getByText(copy.text('Not a workshop'))).toBeTruthy();
  });

  it('welcome, arrived through a link: "New here" and "I have a code", each with its words', () => {
    render(Welcome, { app: state({ arrival: { wave: 'wave-1' } }) });
    expect(screen.getByRole('button', { name: copy.item('Buttons', 'new here') })).toBeTruthy();
    expect(screen.getByText(copy.text('Welcome: new here'))).toBeTruthy();
    expect(
      screen.getByRole('button', { name: copy.item('Buttons', 'i have a code') }),
    ).toBeTruthy();
    expect(screen.getByText(copy.text('Welcome: I have a code'))).toBeTruthy();
    expect(screen.queryByText(copy.text('Welcome: no link'))).toBeNull();
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
    expect(screen.getByText(copy.text('Welcome: I have a code'))).toBeTruthy();
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

  it('welcome after the stored code was refused: the explanation', () => {
    render(Welcome, { app: state({ codeRefused: true }) });
    expect(screen.getByText(copy.text('Welcome: code not accepted'))).toBeTruthy();
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

  it('the session end, the code step: the masked code, reveal, copy and Next; nothing else yet', () => {
    render(SessionEnd, { app: state({ code: '1234567890123456', endStep: 'code' }) });
    expect(screen.getByText(MASKED_CODE)).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.item('Buttons', 'reveal') })).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.item('Buttons', 'copy') })).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.item('Buttons', 'next') })).toBeTruthy();
    expect(screen.queryByText(copy.item('Session end', 'come back'))).toBeNull();
    expect(screen.queryByText(copy.item('Titles', 'install'))).toBeNull();
  });

  it('the session end, the install step: the steps for this platform, "Not now", and "Install" only with an offer', () => {
    const { unmount } = render(SessionEnd, {
      app: state({ code: '1234567890123456', endStep: 'install', platform: 'iPhone and iPad' }),
    });
    expect(screen.getByText(copy.item('Titles', 'install'))).toBeTruthy();
    expect(
      screen.getByText(copy.item('Install steps', 'iPhone and iPad'), { exact: false }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.item('Buttons', 'not now') })).toBeTruthy();
    expect(screen.queryByRole('button', { name: copy.item('Buttons', 'install') })).toBeNull();
    expect(screen.queryByText(MASKED_CODE)).toBeNull();
    unmount();
    const offer = Object.assign(new Event('beforeinstallprompt'), { prompt: async () => {} });
    render(SessionEnd, {
      app: state({ endStep: 'install', platform: 'Android', installOffer: offer }),
    });
    expect(screen.getByRole('button', { name: copy.item('Buttons', 'install') })).toBeTruthy();
  });

  it('the session end, the last step: come back, all synced, and no code', () => {
    render(SessionEnd, { app: state({ code: '1234567890123456', endStep: 'done' }) });
    expect(screen.getByText(copy.item('Session end', 'come back'))).toBeTruthy();
    expect(screen.getByText(copy.item('Session end', 'all synced'))).toBeTruthy();
    expect(screen.queryByText(MASKED_CODE)).toBeNull();
    expect(screen.queryByText(copy.text('Session end: another session'))).toBeNull();
  });

  it('the session end with answers waiting: the count in its wording', () => {
    render(SessionEnd, {
      app: state({
        code: '1234567890123456',
        sync: { lastResult: 'offline', outboxSize: 3, outboxSessions: 0 },
      }),
    });
    expect(
      screen.getByText(fill(copy.item('Session end', 'waiting to sync'), { n: 3 })),
    ).toBeTruthy();
  });

  it('the end of a later session: its own words, come back, and no code', () => {
    const app = onACard({ code: '1234567890123456', endStep: 'done' });
    app.live = { ...app.live!, session: { ...app.live!.session, sessionNo: 2 } };
    render(SessionEnd, { app });
    expect(screen.getByText(copy.text('Session end: another session'))).toBeTruthy();
    expect(screen.getByText(copy.item('Session end', 'come back'))).toBeTruthy();
    expect(screen.queryByText(MASKED_CODE)).toBeNull();
  });

  it('closed, with the way to the trust page', () => {
    render(Closed, { app: state() });
    expect(screen.getByText(copy.text('Closed'))).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.item('Buttons', 'trust page') })).toBeTruthy();
  });

  it('the trust page: the seven sections in order, the fingerprint and the source filled in, the links', () => {
    render(Trust, { app: state({ screen: 'trust' }) });
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(
      copy.sections.get('Trust page headings')!.items &&
        [
          'what we store',
          'what we never collect',
          'how it is protected',
          'check it yourself',
          'your controls',
          'who, where, until when',
          'the honest limit',
        ].map((k) => copy.item('Trust page headings', k as 'what we store')),
    );
    const text = document.body.textContent!;
    expect(text).toContain(workshop.keyFingerprint);
    expect(text).not.toContain('[key fingerprint]');
    expect(text).not.toContain('[source]');
    expect(text).toContain(copy.item('Trust page variables', 'source'));
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
    expect(screen.getByRole('button', { name: copy.item('Buttons', 'back') })).toBeTruthy();
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

  it('the privacy panel: every row label, no code yet, nothing stored', () => {
    render(PrivacyPanel, { app: state() });
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
  });

  it('the privacy panel with a code: masked, with the delete button and the last error', () => {
    render(PrivacyPanel, {
      app: state({
        code: '1234567890123456',
        lastError: 'CLIENT_SYNC_FAILED',
        sync: {
          lastResult: 'error',
          lastError: 'CLIENT_SYNC_FAILED',
          outboxSize: 2,
          outboxSessions: 1,
        },
      }),
    });
    expect(screen.getByText(MASKED_CODE)).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.item('Buttons', 'delete') })).toBeTruthy();
    expect(screen.getByText('CLIENT_SYNC_FAILED')).toBeTruthy();
    expect(screen.getByText(copy.error('CLIENT_SYNC_FAILED'), { exact: false })).toBeTruthy();
    expect(
      screen.getByText(
        fill(copy.item('Privacy panel', 'outbox summary'), { events: 2, sessions: 1 }),
      ),
    ).toBeTruthy();
    expect(screen.getByText(copy.item('Privacy panel', 'code note'))).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.item('Buttons', 'copy') })).toBeTruthy();
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

  it('the privacy panel: what we store, row by row and in plain words, the sealed body shown as sealed', () => {
    render(PrivacyPanel, {
      app: state({ code: '1234567890123456', me: ME, lastSyncDay: '2026-11-17' }),
    });
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
    expect(screen.getByText(copy.text('Data management plan'))).toBeTruthy();
    expect(screen.getByText(copy.text('Privacy panel: caveat'))).toBeTruthy();
    expect(
      screen.getByRole('button', { name: copy.item('Buttons', 'i have a code') }),
    ).toBeTruthy();
  });

  it('the privacy panel links to the source at the running version', () => {
    render(PrivacyPanel, { app: state() });
    const link = screen.getByRole('link', {
      name: copy.item('Privacy panel', 'source'),
    }) as HTMLAnchorElement;
    expect(link.href).toContain(copy.item('Trust page variables', 'source'));
  });

  it('the privacy panel, a code the server could not be asked about: "could not be read"', () => {
    render(PrivacyPanel, { app: state({ code: '1234567890123456', me: null }) });
    expect(screen.getByText(copy.item('Privacy panel', 'not reachable'))).toBeTruthy();
  });

  it('the privacy panel, delete in two steps: the question with "yes" and "keep" only after the first tap', () => {
    const { unmount } = render(PrivacyPanel, { app: state({ code: '1234567890123456' }) });
    expect(screen.queryByText(copy.text('Privacy panel: delete confirm'))).toBeNull();
    expect(screen.queryByRole('button', { name: copy.item('Buttons', 'yes delete') })).toBeNull();
    unmount();
    render(PrivacyPanel, { app: state({ code: '1234567890123456', confirmingDelete: true }) });
    expect(screen.getByText(copy.text('Privacy panel: delete confirm'))).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.item('Buttons', 'yes delete') })).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.item('Buttons', 'keep') })).toBeTruthy();
    expect(screen.queryByRole('button', { name: copy.item('Buttons', 'delete') })).toBeNull();
  });
});

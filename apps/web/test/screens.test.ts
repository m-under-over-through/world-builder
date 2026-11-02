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
import Welcome from '../src/screens/Welcome.svelte';
import { fill } from '../src/lib/copy.ts';
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

  it('intro 3 while a refused join waits for its retry: the "trying again" line', () => {
    render(Intro, { app: state({ screen: 'consent', retrying: true, joining: true }) });
    expect(screen.getByText(copy.item('App labels', 'retrying'))).toBeTruthy();
  });

  it('the card keeps the draft the state holds', () => {
    const cards = workshop.deck.cards.slice(0, 1);
    render(Card, { app: state({ cards, draft: 'Half an answer' }) });
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Half an answer');
  });

  it('the demo card: the explanation and "Got it"', () => {
    render(DemoCard, { app: state({ screen: 'demo' }) });
    expect(screen.getByText(copy.text('Demo card'))).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.item('Buttons', 'got it') })).toBeTruthy();
  });

  it('the card with the dictation hint open: its title once, the line for this platform, and "Got it"', () => {
    const cards = workshop.deck.cards.slice(0, 1);
    render(Card, { app: state({ cards, platform: 'Windows', hintOpen: true }) });
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
    const cards = workshop.deck.cards.slice(0, 1);
    render(Card, { app: state({ cards, platform: 'Android', hintOpen: false }) });
    expect(
      screen.getByRole('button', { name: copy.item('Buttons', 'prefer to talk') }),
    ).toBeTruthy();
    expect(screen.queryByText(copy.item('Dictation hint', 'Android'))).toBeNull();
  });

  it('the card on a platform with no dictation: no hint and no "Prefer to talk?"', () => {
    const cards = workshop.deck.cards.slice(0, 1);
    render(Card, { app: state({ cards, platform: null, hintOpen: true }) });
    expect(
      screen.queryByRole('button', { name: copy.item('Buttons', 'prefer to talk') }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: copy.item('Buttons', 'got it') })).toBeNull();
  });

  it('the card: the question, the nudge, the position, and the sync line', () => {
    const cards = workshop.deck.cards.slice(0, 2);
    render(Card, { app: state({ cards, index: 1, sync: { lastResult: 'ok', outboxSize: 0 } }) });
    expect(screen.getByText(cards[1]!.text)).toBeTruthy();
    expect(screen.getByText(copy.text('Card nudge'), { exact: false })).toBeTruthy();
    expect(
      screen.getByText(fill(copy.item('Card labels', 'position'), { n: 2, total: 2 })),
    ).toBeTruthy();
    expect(screen.getByText(copy.item('Card states', 'synced'))).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.item('Buttons', 'set aside') })).toBeTruthy();
  });

  it('the card offline: "saved on this device"', () => {
    const cards = workshop.deck.cards.slice(0, 1);
    render(Card, { app: state({ cards, sync: { lastResult: 'offline', outboxSize: 1 } }) });
    expect(screen.getByText(copy.item('Card states', 'offline'))).toBeTruthy();
  });

  it('the card with a sealing failure: the CLIENT_SEAL_FAILED wording', () => {
    const cards = workshop.deck.cards.slice(0, 1);
    render(Card, { app: state({ cards, error: 'CLIENT_SEAL_FAILED' }) });
    expect(screen.getByText(copy.error('CLIENT_SEAL_FAILED'), { exact: false })).toBeTruthy();
  });

  it('the session end: the masked code, reveal and copy, come back, all synced', () => {
    render(SessionEnd, { app: state({ code: '1234567890123456' }) });
    expect(screen.getByText(MASKED_CODE)).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.item('Buttons', 'reveal') })).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.item('Buttons', 'copy') })).toBeTruthy();
    expect(screen.getByText(copy.item('Session end', 'come back'))).toBeTruthy();
    expect(screen.getByText(copy.item('Session end', 'all synced'))).toBeTruthy();
  });

  it('the session end with answers waiting: the count in its wording', () => {
    render(SessionEnd, {
      app: state({ code: '1234567890123456', sync: { lastResult: 'offline', outboxSize: 3 } }),
    });
    expect(
      screen.getByText(fill(copy.item('Session end', 'waiting to sync'), { n: 3 })),
    ).toBeTruthy();
  });

  it('closed', () => {
    render(Closed, { app: state() });
    expect(screen.getByText(copy.text('Closed'))).toBeTruthy();
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
        sync: { lastResult: 'error', lastError: 'CLIENT_SYNC_FAILED', outboxSize: 2 },
      }),
    });
    expect(screen.getByText(MASKED_CODE)).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.item('Buttons', 'delete') })).toBeTruthy();
    expect(screen.getByText('CLIENT_SYNC_FAILED', { exact: false })).toBeTruthy();
  });
});

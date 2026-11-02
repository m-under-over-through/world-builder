import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Card from '../src/screens/Card.svelte';
import Closed from '../src/screens/Closed.svelte';
import Consent from '../src/screens/Consent.svelte';
import EnterCode from '../src/screens/EnterCode.svelte';
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

  it('consent, with an error in its wording', () => {
    render(Consent, { app: state({ error: 'RATE_LIMITED' }) });
    expect(screen.getByText(copy.text('Intro 3, consent'))).toBeTruthy();
    expect(screen.getByText(copy.error('RATE_LIMITED'))).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.item('Buttons', 'i understand') })).toBeTruthy();
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

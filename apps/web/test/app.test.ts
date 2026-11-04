import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { tick } from 'svelte';
import App from '../src/App.svelte';
import { fill } from '../src/lib/copy.ts';
import { AppState, RETRY_FIRST_MS } from '../src/lib/state.svelte.ts';
import { WorkshopStore } from '../src/lib/store.ts';
import { findWorkshop } from '../src/lib/workshops.ts';
import {
  freshIndexedDb,
  JOINED,
  pretendUserAgent,
  restoreUserAgent,
  stubRoutes,
  SYNCED,
} from './helpers.ts';

/**
 * The client rendered in a test DOM, the way a phone would render it: the address decides the
 * route, the device store is an in-memory IndexedDB (test/setup.ts), and the API is a stub that
 * answers what each test says. The words asserted are read from copy.md through the same loader
 * the app uses, so rewording a block never breaks a test; renaming a heading does.
 */
const SLUG = 'rural-manufacturing';
const workshop = findWorkshop(SLUG)!;
const copy = workshop.copy;

type Stub = (path: string, init: RequestInit) => { status: number; body: unknown };

function stubApi(answer: Stub) {
  const calls: { path: string; method: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
      const path = String(input);
      calls.push({ path, method: init.method ?? 'GET' });
      const { status, body } = answer(path, init);
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
  return calls;
}

/**
 * Render the app at an address. Its waits (the beat after "Synced.", the Retry-After) are instant
 * unless a test holds one: `held()` gives a wait that resolves when the test says.
 */
async function open(pathname: string, wait?: AppState['wait']): Promise<AppState> {
  history.replaceState(null, '', pathname);
  const app = new AppState();
  app.wait = wait ?? (async () => {});
  render(App, { app });
  // The card screen on a phone has no heading (the onboarding card is part of the stack), so
  // the open is done when the state has left "loading" and the screen has been drawn.
  await waitFor(() => expect(app.screen).not.toBe('loading'));
  await tick();
  return app;
}

function held(): { wait: AppState['wait']; release: () => void } {
  let release = () => {};
  const wait = () =>
    new Promise<void>((resolve) => {
      release = resolve;
    });
  return { wait, release: () => release() };
}

/** A wait that holds only the first retry of a failed sync, so a test can see the outbox wait; every other wait is instant. */
function heldRetry(): { wait: AppState['wait']; release: () => void } {
  const retry = held();
  return {
    wait: (ms) => (ms === RETRY_FIRST_MS ? retry.wait(ms) : Promise.resolve()),
    release: retry.release,
  };
}

/** Back, at the top of a page above its title (the first) or at its bottom (the last). */
const backs = () => screen.getAllByRole('button', { name: copy.item('Buttons', 'back') });

// A fresh in-memory IndexedDB per test, so nothing one test stored (a code, an arrival) reaches the next.
beforeEach(freshIndexedDb);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  restoreUserAgent();
});

describe('a device with no link and no code', () => {
  it('sees the welcome with "open the link you were sent", and no way to type a code', async () => {
    const calls = stubApi(() => ({ status: 404, body: { error: 'WORKSHOP_UNKNOWN' } }));
    await open(`/${SLUG}/`);
    expect(screen.getByText(copy.text('Welcome: no link'))).toBeTruthy();
    expect(screen.queryByRole('button', { name: copy.item('Buttons', 'i understand') })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(calls).toEqual([]);
  });
});

describe('a device arriving through a wave link', () => {
  it('sees the welcome with "I understand", and the open is counted once', async () => {
    const calls = stubApi(() => ({ status: 200, body: { ok: true } }));
    await open(`/${SLUG}/join/wave-1`);
    expect(
      await screen.findByRole('button', { name: copy.item('Buttons', 'i understand') }),
    ).toBeTruthy();
    expect(calls).toEqual([{ path: `/api/${SLUG}/waves/wave-1/opened`, method: 'POST' }]);
    expect(location.pathname).toBe(`/${SLUG}/join/wave-1`);
  });
});

describe('an address that is not a workshop', () => {
  it('shows the "not a workshop" words from copy.md', async () => {
    stubApi(() => ({ status: 404, body: {} }));
    await open('/nowhere/');
    expect(screen.getByText(copy.text('Not a workshop'))).toBeTruthy();
  });
});

describe('outside the workshop days', () => {
  it('a new arrival before the opening day reads "Not open yet" with the day, and no request is made', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T12:00:00'));
    const calls = stubApi(() => ({ status: 200, body: {} }));
    await open(`/${SLUG}/`);
    const day = new Date(`${workshop.opensDay}T12:00:00`).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    expect(screen.getByText(fill(copy.text('Not open yet'), { day }))).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it('a new arrival after the close day reads the closed words', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2027-01-01T12:00:00'));
    stubApi(() => ({ status: 200, body: {} }));
    await open(`/${SLUG}/`);
    expect(screen.getByText(copy.text('Closed'))).toBeTruthy();
  });
});

describe('the pages a participant can open directly', () => {
  it('an old /continue address lands home: the enter-code page is gone (ADR 0018)', async () => {
    stubApi(() => ({ status: 200, body: {} }));
    await open(`/${SLUG}/continue`);
    expect(screen.getByText(copy.text('Welcome: no link'))).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('/panel lands on the page about the app, with nothing stored, and Back goes where the device lands', async () => {
    const calls = stubApi(() => ({ status: 200, body: {} }));
    const user = userEvent.setup();
    await open(`/${SLUG}/panel`);
    expect(screen.getByRole('heading', { name: copy.item('Titles', 'about') })).toBeTruthy();
    expect(screen.getByText(copy.item('Privacy panel', 'nothing stored'))).toBeTruthy();
    expect(location.pathname).toBe(`/${SLUG}/about`);
    expect(calls).toEqual([]);
    await user.click(backs().at(-1)!);
    expect(await screen.findByText(copy.text('Welcome: no link'))).toBeTruthy();
    expect(location.pathname).toBe(`/${SLUG}/`);
  });

  it('/about opens the page, with the small "About this app" link gone from its foot and the header without a button', async () => {
    stubApi(() => ({ status: 200, body: {} }));
    await open(`/${SLUG}/about`);
    expect(screen.getByRole('heading', { name: copy.item('Titles', 'about') })).toBeTruthy();
    expect(screen.queryByRole('button', { name: copy.item('Buttons', 'about') })).toBeNull();
    expect(document.querySelectorAll('header button')).toHaveLength(0);
  });

  it('/panel with a stored code syncs on open, before Back is tapped', async () => {
    const store = new WorkshopStore(SLUG);
    await store.set('code', '1234567890123456');
    await store.events.put({
      id: '10000000-0000-4000-8000-000000000001',
      sessionId: '00000000-0000-4000-8000-000000000001',
      cardId: 'cool',
      seq: 0,
      kind: 'dismissed',
      createdDay: '2026-11-16',
      deckVersion: '0.1',
      synced: 0,
    });
    store.close();
    const calls = stubRoutes({
      [`/api/${SLUG}/me`]: [
        () => ({
          status: 200,
          body: {
            workshop: {
              slug: SLUG,
              name: 'x',
              closesDay: '2026-12-06',
              deleteDay: '2027-02-05',
            },
            participant: {
              createdDay: '2026-11-16',
              invitesLeft: 3,
              wave: 'wave-1',
              sessionsCount: 1,
            },
            sessions: [],
            events: [],
          },
        }),
      ],
      [`/api/${SLUG}/sync`]: [
        () => ({
          status: 200,
          body: {
            acceptedSessionIds: [],
            acceptedEventIds: ['10000000-0000-4000-8000-000000000001'],
          },
        }),
      ],
    });
    await open(`/${SLUG}/panel`);
    expect(
      screen.getByRole('heading', { name: copy.item('Titles', 'privacy panel') }),
    ).toBeTruthy();
    const paths = calls.map((c) => `${c.method} ${c.path.replace(`/api/${SLUG}`, '')}`);
    expect(paths.slice(0, 2)).toEqual(['GET /me', 'POST /sync']);
    expect(document.body.textContent).toMatch(
      new RegExp(`${copy.item('Diagnostics', 'last sync')}\\s+${copy.item('Diagnostics', 'ok')}`),
    );
  });

  it('/terms opens the terms and /privacy the policy', async () => {
    stubRoutes({});
    const terms = await open(`/${SLUG}/terms`);
    expect(terms.screen).toBe('terms');
    expect(screen.getByText(copy.item('Titles', 'terms'))).toBeTruthy();
    document.body.innerHTML = '';
    const policy = await open(`/${SLUG}/privacy`);
    expect(policy.screen).toBe('privacy');
    expect(screen.getByText(copy.item('Titles', 'privacy policy'))).toBeTruthy();
  });

  it('Back from /trust opened directly lands where the device lands', async () => {
    stubRoutes({});
    const user = userEvent.setup();
    await open(`/${SLUG}/trust`);
    expect(screen.getByRole('heading', { name: copy.item('Titles', 'trust page') })).toBeTruthy();
    await user.click(backs().at(-1)!);
    expect(await screen.findByText(copy.text('Welcome: no link'))).toBeTruthy();
    expect(location.pathname).toBe(`/${SLUG}/`);
  });

  it('the foot of the welcome is one link, "About this app"; the terms and the policy open from the page, and Back returns step by step', async () => {
    stubRoutes({});
    const user = userEvent.setup();
    await open(`/${SLUG}/join/wave-1`);
    expect(document.querySelectorAll('footer button')).toHaveLength(1);
    expect(
      screen.queryByRole('button', { name: copy.item('Trust page links', 'terms') }),
    ).toBeNull();
    await user.click(screen.getByRole('button', { name: copy.item('Buttons', 'about') }));
    expect(await screen.findByRole('heading', { name: copy.item('Titles', 'about') })).toBeTruthy();
    expect(location.pathname).toBe(`/${SLUG}/about`);
    await user.click(screen.getByRole('button', { name: copy.item('Trust page links', 'terms') }));
    expect(await screen.findByText(copy.item('Titles', 'terms'))).toBeTruthy();
    expect(location.pathname).toBe(`/${SLUG}/terms`);
    await user.click(backs().at(-1)!);
    expect(await screen.findByRole('heading', { name: copy.item('Titles', 'about') })).toBeTruthy();
    expect(location.pathname).toBe(`/${SLUG}/about`);
    await user.click(
      screen.getByRole('button', { name: copy.item('Trust page links', 'privacy policy') }),
    );
    expect(await screen.findByText(copy.item('Titles', 'privacy policy'))).toBeTruthy();
    expect(location.pathname).toBe(`/${SLUG}/privacy`);
    await user.click(backs().at(-1)!);
    expect(await screen.findByRole('heading', { name: copy.item('Titles', 'about') })).toBeTruthy();
    await user.click(backs()[0]!);
    expect(
      await screen.findByRole('button', { name: copy.item('Buttons', 'i understand') }),
    ).toBeTruthy();
    expect(location.pathname).toBe(`/${SLUG}/join/wave-1`);
  });

  it('Back at the top of the page, above its title, goes where the Back at the bottom goes', async () => {
    stubRoutes({});
    const user = userEvent.setup();
    await open(`/${SLUG}/join/wave-1`);
    await user.click(screen.getByRole('button', { name: copy.item('Buttons', 'about') }));
    expect(await screen.findByRole('heading', { name: copy.item('Titles', 'about') })).toBeTruthy();
    const top = backs()[0]!;
    expect(top.closest('.top-back')!.nextElementSibling!.tagName).toBe('H1');
    await user.click(top);
    expect(
      await screen.findByRole('button', { name: copy.item('Buttons', 'i understand') }),
    ).toBeTruthy();
    expect(location.pathname).toBe(`/${SLUG}/join/wave-1`);
  });

  it('the page about the app opened from the welcome goes back to the welcome', async () => {
    stubApi(() => ({ status: 200, body: {} }));
    const user = userEvent.setup();
    await open(`/${SLUG}/`);
    await user.click(screen.getByRole('button', { name: copy.item('Buttons', 'about') }));
    expect(await screen.findByRole('heading', { name: copy.item('Titles', 'about') })).toBeTruthy();
    await user.click(backs().at(-1)!);
    expect(await screen.findByText(copy.text('Welcome: no link'))).toBeTruthy();
  });

  it('no screen says "privacy" in a button or a heading', async () => {
    stubRoutes({});
    await open(`/${SLUG}/join/wave-1`);
    const words = [...document.querySelectorAll('button, h1, h2, header')].map(
      (e) => e.textContent ?? '',
    );
    expect(words.some((w) => /privacy/i.test(w))).toBe(false);
  });
});

describe('the first session', () => {
  /** The welcome, then "I understand": the consent, on the one page before the cards (ADR 0019). */
  async function throughTheIntro(
    user: ReturnType<typeof userEvent.setup>,
    wait?: AppState['wait'],
  ) {
    const app = await open(`/${SLUG}/join/wave-1`, wait);
    expect(await screen.findByText(copy.text('Welcome'))).toBeTruthy();
    await user.click(screen.getByRole('button', { name: copy.item('Buttons', 'i understand') }));
    return app;
  }

  /** The front card of the stack, opened: the field is in it. */
  async function openTheCard(user: ReturnType<typeof userEvent.setup>) {
    await user.click(
      await screen.findByRole('button', {
        name: (name) => name.includes(copy.item('Card labels', 'write an answer')),
      }),
    );
    return screen.findByRole('textbox');
  }

  it('the welcome is the one page before the cards: no intro screens, no Next; "I understand" joins and the cards come', async () => {
    const calls = stubRoutes({ [`/api/${SLUG}/join`]: [JOINED] });
    const user = userEvent.setup();
    const app = await open(`/${SLUG}/join/wave-1`);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(copy.text('Welcome: title'));
    expect(screen.queryByRole('button', { name: /next/i })).toBeNull();
    await user.click(screen.getByRole('button', { name: copy.item('Buttons', 'i understand') }));
    await waitFor(() => expect(app.screen).toBe('card'));
    expect(calls.filter((c) => c.path.endsWith('/join'))).toHaveLength(1);
    expect(app.code).toMatch(/^\d{16}$/);
    expect(await new WorkshopStore(SLUG).get('consent')).toBeTruthy();
  });

  it('"I understand", then the onboarding card in front of the stack, then the first card, which opens with the hint', async () => {
    pretendUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0.0.0');
    const calls = stubRoutes({ [`/api/${SLUG}/join`]: [JOINED], [`/api/${SLUG}/sync`]: [SYNCED] });
    const user = userEvent.setup();
    const app = await throughTheIntro(user);
    expect(await screen.findByText(copy.text('Demo card'))).toBeTruthy();
    expect(app.screen).toBe('card');
    expect(calls.filter((c) => c.path.endsWith('/join'))).toHaveLength(1);
    // The first card waits behind it: not yet a button.
    const first = app.card!;
    expect(screen.queryByRole('button', { name: (n) => n.includes(first.text) })).toBeNull();
    await user.click(screen.getByRole('button', { name: copy.item('Buttons', 'got it') }));
    // The first card comes to the front, with no toast.
    expect(await screen.findByRole('button', { name: (n) => n.includes(first.text) })).toBeTruthy();
    expect(screen.queryByText(copy.text('Demo card'))).toBeNull();
    expect(document.querySelector('[role="status"]')).toBeNull();
    // The stack: no field until the card is opened, and no hint either.
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByText(copy.item('Dictation hint', 'Windows'))).toBeNull();
    await openTheCard(user);
    expect(await screen.findByText(copy.item('Dictation hint', 'Windows'))).toBeTruthy();
    // The open hint says "Prefer to talk?" once, as its title; the line under it does not repeat it.
    expect(screen.getAllByText(copy.item('Titles', 'dictation hint'))).toHaveLength(1);
    expect(
      screen.getByRole('heading', { name: copy.item('Titles', 'dictation hint') }),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: copy.item('Buttons', 'got it') }));
    expect(screen.queryByText(copy.item('Dictation hint', 'Windows'))).toBeNull();
    await user.click(screen.getByRole('button', { name: copy.item('Buttons', 'prefer to talk') }));
    expect(screen.getByText(copy.item('Dictation hint', 'Windows'))).toBeTruthy();
  });

  it('a browser the app does not know gets no hint and no "Prefer to talk?" (the pretended platform of the last test is gone)', async () => {
    stubRoutes({ [`/api/${SLUG}/join`]: [JOINED], [`/api/${SLUG}/sync`]: [SYNCED] });
    const user = userEvent.setup();
    await throughTheIntro(user);
    await user.click(await screen.findByRole('button', { name: copy.item('Buttons', 'got it') }));
    expect(await openTheCard(user)).toBeTruthy();
    expect(screen.queryByText(copy.item('Dictation hint', 'Windows'))).toBeNull();
    expect(
      screen.queryByRole('button', { name: copy.item('Buttons', 'prefer to talk') }),
    ).toBeNull();
  });

  it('the answer being written survives "About this app" and Back', async () => {
    stubRoutes({ [`/api/${SLUG}/join`]: [JOINED], [`/api/${SLUG}/sync`]: [SYNCED] });
    const user = userEvent.setup();
    await throughTheIntro(user);
    await user.click(await screen.findByRole('button', { name: copy.item('Buttons', 'got it') }));
    await user.type(await openTheCard(user), 'Half an answer');
    await user.click(screen.getByRole('button', { name: copy.item('Buttons', 'about') }));
    expect(await screen.findByRole('heading', { name: copy.item('Titles', 'about') })).toBeTruthy();
    await user.click(backs().at(-1)!);
    expect(((await screen.findByRole('textbox')) as HTMLTextAreaElement).value).toBe(
      'Half an answer',
    );
  });

  it('a taken code is retried once, silently, with a fresh code', async () => {
    const calls = stubRoutes({
      [`/api/${SLUG}/join`]: [() => ({ status: 409, body: { error: 'JOIN_CODE_TAKEN' } }), JOINED],
      [`/api/${SLUG}/sync`]: [SYNCED],
    });
    const user = userEvent.setup();
    await throughTheIntro(user);
    expect(await screen.findByText(copy.text('Demo card'))).toBeTruthy();
    const joins = calls.filter((c) => c.path.endsWith('/join'));
    expect(joins).toHaveLength(2);
    expect((joins[0]!.body as { code: string }).code).not.toBe(
      (joins[1]!.body as { code: string }).code,
    );
    expect(screen.queryByText(copy.error('JOIN_CODE_TAKEN'))).toBeNull();
  });

  it('a second taken code is shown in its wording', async () => {
    const taken = () => ({ status: 409, body: { error: 'JOIN_CODE_TAKEN' } });
    stubRoutes({ [`/api/${SLUG}/join`]: [taken, taken] });
    const user = userEvent.setup();
    await throughTheIntro(user);
    expect(await screen.findByText(copy.error('JOIN_CODE_TAKEN'))).toBeTruthy();
  });

  it('a full wave is shown in its wording on the welcome', async () => {
    stubRoutes({
      [`/api/${SLUG}/join`]: [() => ({ status: 403, body: { error: 'JOIN_WAVE_FULL' } })],
    });
    const user = userEvent.setup();
    await throughTheIntro(user);
    expect(await screen.findByText(copy.error('JOIN_WAVE_FULL'))).toBeTruthy();
    expect(screen.queryByText('JOIN_WAVE_FULL')).toBeNull();
  });

  it('a workshop closed at join shows the closed screen, with the page about the app at its foot', async () => {
    stubRoutes({
      [`/api/${SLUG}/join`]: [() => ({ status: 403, body: { error: 'WORKSHOP_CLOSED' } })],
    });
    const user = userEvent.setup();
    await throughTheIntro(user);
    expect(await screen.findByText(copy.text('Closed'))).toBeTruthy();
    expect(screen.getByRole('button', { name: copy.item('Buttons', 'about') })).toBeTruthy();
  });

  it('a join refused for the minute (RATE_LIMITED) is retried once after Retry-After, and a second refusal is shown', async () => {
    const limited = () => ({
      status: 429,
      body: { error: 'RATE_LIMITED' },
      headers: { 'retry-after': '1' },
    });
    const calls = stubRoutes({ [`/api/${SLUG}/join`]: [limited, limited] });
    const user = userEvent.setup();
    const { wait, release } = held();
    await throughTheIntro(user, wait);
    expect(await screen.findByText(copy.item('App labels', 'retrying'))).toBeTruthy();
    expect(calls.filter((c) => c.path.endsWith('/join'))).toHaveLength(1);
    release();
    expect(await screen.findByText(copy.error('RATE_LIMITED'))).toBeTruthy();
    expect(calls.filter((c) => c.path.endsWith('/join'))).toHaveLength(2);
    expect(screen.queryByText(copy.item('App labels', 'retrying'))).toBeNull();
  });

  it('offline, the join is queued, the session starts, and the join goes out with the first sync', async () => {
    const calls = stubRoutes({
      [`/api/${SLUG}/join`]: [() => 'offline', JOINED],
      [`/api/${SLUG}/sync`]: [SYNCED],
    });
    const user = userEvent.setup();
    await throughTheIntro(user);
    expect(await screen.findByText(copy.text('Demo card'))).toBeTruthy();
    await user.click(screen.getByRole('button', { name: copy.item('Buttons', 'got it') }));
    await user.click(
      await screen.findByRole('button', { name: copy.item('Buttons', 'set aside') }),
    );
    await waitFor(() => expect(calls.some((c) => c.path.endsWith('/sync'))).toBe(true));
    const paths = calls.map((c) => c.path.replace(`/api/${SLUG}`, ''));
    expect(paths).toEqual(['/waves/wave-1/opened', '/join', '/join', '/sync']);
    expect((calls[1]!.body as { code: string }).code).toBe(
      (calls[2]!.body as { code: string }).code,
    );
  });
});

describe('the page about the app', () => {
  async function withACode() {
    const store = new WorkshopStore(SLUG);
    await store.set('code', '1234567890123456');
    store.close();
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

  it('"Delete everything I sent" asks first, "Keep my answers" sends nothing, "Yes" deletes and wipes the device', async () => {
    await withACode();
    const calls = stubRoutes({ [`/api/${SLUG}/me`]: [ME] });
    const user = userEvent.setup();
    const gone: string[] = [];
    const app = await open(`/${SLUG}/panel`);
    app.go = (href) => gone.push(href);
    await user.click(screen.getByRole('button', { name: copy.item('Buttons', 'delete') }));
    expect(await screen.findByText(copy.text('Privacy panel: delete confirm'))).toBeTruthy();
    await user.click(screen.getByRole('button', { name: copy.item('Buttons', 'keep') }));
    await waitFor(() =>
      expect(screen.queryByText(copy.text('Privacy panel: delete confirm'))).toBeNull(),
    );
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: copy.item('Buttons', 'delete') }));
    await user.click(
      await screen.findByRole('button', { name: copy.item('Buttons', 'yes delete') }),
    );
    await waitFor(() => expect(gone).toEqual([`/${SLUG}/`]));
    expect(calls.filter((c) => c.method === 'DELETE').map((c) => c.path)).toEqual([
      `/api/${SLUG}/me`,
    ]);
    const store = new WorkshopStore(SLUG);
    expect(await store.get('code')).toBeUndefined();
    store.close();
  });

  it('delete is two taps from a card: "About this app" at the foot, then the delete button; the third is the confirmation', async () => {
    await withACode();
    stubRoutes({ [`/api/${SLUG}/me`]: [ME, ME] });
    const user = userEvent.setup();
    const gone: string[] = [];
    const app = await open(`/${SLUG}/join/wave-1`);
    app.go = (href) => gone.push(href);
    expect(app.screen).toBe('card');
    await user.click(screen.getByRole('button', { name: copy.item('Buttons', 'about') }));
    await user.click(await screen.findByRole('button', { name: copy.item('Buttons', 'delete') }));
    await user.click(
      await screen.findByRole('button', { name: copy.item('Buttons', 'yes delete') }),
    );
    await waitFor(() => expect(gone).toEqual([`/${SLUG}/`]));
  });

  it('the last error of a failed sync is shown in the diagnostics with its one line', async () => {
    await withACode();
    stubRoutes({
      [`/api/${SLUG}/me`]: [() => ({ status: 500, body: { error: 'SERVER_ERROR' } })],
    });
    await open(`/${SLUG}/panel`);
    expect(screen.getByText('SERVER_ERROR')).toBeTruthy();
    expect(screen.getByText(copy.error('SERVER_ERROR'), { exact: false })).toBeTruthy();
    expect(screen.getByText(copy.item('Privacy panel', 'not reachable'))).toBeTruthy();
  });

  it('the page about the app shows no code, with a code stored', async () => {
    await withACode();
    stubRoutes({ [`/api/${SLUG}/me`]: [ME] });
    await open(`/${SLUG}/panel`);
    expect(document.body.textContent).not.toContain('1234567890123456');
    expect(document.body.textContent).not.toContain('1234 5678 9012 3456');
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('the core loop', () => {
  /** The front card: one button, named by its label, the question and the affordance. */
  const frontCard = () =>
    screen.findByRole('button', {
      name: (name) => name.includes(copy.item('Card labels', 'write an answer')),
    });

  async function toTheFirstCard(user: ReturnType<typeof userEvent.setup>, wait?: AppState['wait']) {
    const app = await open(`/${SLUG}/join/wave-1`, wait);
    await user.click(
      await screen.findByRole('button', { name: copy.item('Buttons', 'i understand') }),
    );
    await user.click(await screen.findByRole('button', { name: copy.item('Buttons', 'got it') }));
    await frontCard();
    return app;
  }

  /** Open the front card, type, Save. */
  async function answer(user: ReturnType<typeof userEvent.setup>, text: string) {
    await user.click(await frontCard());
    await user.type(await screen.findByRole('textbox'), text);
    await user.click(screen.getByRole('button', { name: copy.item('Buttons', 'save') }));
  }

  it('Save: the answered card leaves and the next is the front at once, with no toast and no status line; the answer syncs in the background', async () => {
    stubRoutes({ [`/api/${SLUG}/join`]: [JOINED], [`/api/${SLUG}/sync`]: [SYNCED, SYNCED] });
    const user = userEvent.setup();
    const app = await toTheFirstCard(user);
    const first = app.card!;
    await answer(user, 'An answer');
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: (n) => n.includes(first.text) })).toBeNull(),
    );
    expect(await frontCard()).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    await waitFor(() => expect(app.sync.lastResult).toBe('ok'));
    expect(document.querySelector('[role="status"], .toast, .toast-slot')).toBeNull();
    expect(app.live!.answered.has(first.id)).toBe(true);
    expect(app.world.tiles.map((t) => t.answer)).toEqual(['An answer']);
  });

  it('offline, nothing is said: the card leaves as ever, and the answer waits in the outbox for the retry', async () => {
    stubRoutes({ [`/api/${SLUG}/join`]: [JOINED], [`/api/${SLUG}/sync`]: [() => 'offline'] });
    const user = userEvent.setup();
    const { wait, release } = heldRetry();
    const app = await toTheFirstCard(user, wait);
    const first = app.card!;
    await answer(user, 'An answer');
    await waitFor(() => expect(app.sync.lastResult).toBe('offline'));
    expect(app.sync.outboxSize).toBeGreaterThan(0);
    expect((await frontCard()).textContent).not.toContain(first.text);
    expect(document.querySelector('[role="status"]')).toBeNull();
    release();
    await waitFor(() => expect(app.sync.lastResult).toBe('ok'));
  });

  it('Set aside by the button: no toast, the next card is the front with its area as the label, and the card is listed under "Set aside"', async () => {
    stubRoutes({ [`/api/${SLUG}/join`]: [JOINED] });
    const user = userEvent.setup();
    const app = await toTheFirstCard(user);
    const first = app.card!;
    await user.click(screen.getByRole('button', { name: copy.item('Buttons', 'set aside') }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: (n) => n.includes(first.text) })).toBeNull(),
    );
    expect(document.querySelector('[role="status"]')).toBeNull();
    expect(app.live!.plan.queue).not.toContain(first.id);
    expect(app.live!.dismissed.has(first.id)).toBe(true);
    const next = app.card!;
    expect((await frontCard()).querySelector('.label')!.textContent).toBe(next.area);
    expect(app.world.aside.map((c) => c.cardId)).toEqual([first.id]);
  });

  it('the foot of "Your world so far" on a phone carries the "Remind me" line, with the link to the calendar file', async () => {
    stubRoutes({ [`/api/${SLUG}/join`]: [JOINED] });
    const user = userEvent.setup();
    await toTheFirstCard(user);
    await user.click(
      screen.getByRole('button', { name: fill(copy.item('Your world', 'pill label'), { n: 0 }) }),
    );
    const dialog = await screen.findByRole('dialog');
    const remind = screen.getByRole('link', { name: copy.item('Buttons', 'remind me') });
    expect(dialog.contains(remind)).toBe(true);
    expect(remind.getAttribute('href')).toBe(`/${SLUG}/reminder.ics`);
    expect(remind.closest('p')!.textContent).toContain(copy.text('Remind me'));
    // Under the tiles and the set-aside cards: the last thing in the sheet's body.
    expect(dialog.querySelector('.sheet-body')!.lastElementChild).toBe(remind.closest('p'));
  });

  it('a swipe sets the card aside as the button does', async () => {
    stubRoutes({ [`/api/${SLUG}/join`]: [JOINED] });
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduced-motion'),
    }));
    const user = userEvent.setup();
    const app = await toTheFirstCard(user);
    const first = app.card!;
    const card = await frontCard();
    for (const [type, x] of [
      ['pointerdown', 200],
      ['pointermove', 100],
      ['pointermove', 20],
      ['pointerup', 20],
    ] as const)
      card.dispatchEvent(
        new PointerEvent(type, { clientX: x, clientY: 100, pointerId: 1, bubbles: true }),
      );
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: (n) => n.includes(first.text) })).toBeNull(),
    );
    expect(app.live!.dismissed.has(first.id)).toBe(true);
  });
});

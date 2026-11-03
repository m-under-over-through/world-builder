import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentCardId, replaySession } from '../src/lib/session.ts';
import { AppState } from '../src/lib/state.svelte.ts';
import { WorkshopStore } from '../src/lib/store.ts';
import { findWorkshop } from '../src/lib/workshops.ts';
import { freshIndexedDb, JOINED, stubRoutes, SYNCED } from './helpers.ts';

/**
 * The state on its own, without a screen: the rules that are easier to see on the functions than
 * through the rendered app (what a sealing failure becomes, how long a refused join waits).
 */
const SLUG = 'rural-manufacturing';
const workshop = findWorkshop(SLUG)!;
/** The device's database behind a state, for a test to read the rows. */
const db = (app: AppState) => app.store as WorkshopStore;

beforeEach(freshIndexedDb);
afterEach(() => vi.unstubAllGlobals());

async function opened(pathname: string): Promise<AppState> {
  history.replaceState(null, '', pathname);
  const app = new AppState();
  app.wait = async () => {};
  await app.open(pathname);
  return app;
}

/** A state on the first card of a fresh first session, the demo card seen, with a store but no code. */
async function onACard(): Promise<AppState> {
  const app = new AppState();
  app.workshop = workshop;
  app.copy = workshop.copy;
  app.store = new WorkshopStore(SLUG);
  await app.store.set('demoSeen', '2026-11-16');
  app.wait = async () => {};
  app.live = replaySession(
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
  app.card = workshop.deck.cards.find((c) => c.id === currentCardId(app.live!));
  return app;
}

describe('saving an answer', () => {
  it('a sealing failure is shown as CLIENT_SEAL_FAILED, never as the crypto code, and the draft stays', async () => {
    stubRoutes({});
    const app = await onACard();
    app.draft = 'a lone surrogate \uD83D cannot be encoded';
    expect(await app.save()).toBe(false);
    expect(app.error).toBe('CLIENT_SEAL_FAILED');
    expect(app.cardState).toBe('fresh');
    expect(app.draft).toBe('a lone surrogate \uD83D cannot be encoded');
    expect(await db(app).events.count()).toBe(0);
  });

  it('a saved answer clears the draft, marks the card answered, and the next card comes', async () => {
    stubRoutes({ [`/api/${SLUG}/sync`]: [SYNCED] });
    const app = await onACard();
    app.code = '1234567890123456';
    const first = app.card!;
    app.draft = 'An answer';
    expect(await app.save()).toBe(true);
    expect(app.draft).toBe('');
    expect(app.live!.answered.has(first.id)).toBe(true);
    expect(app.card!.id).not.toBe(first.id);
    expect(app.position).toEqual({ n: 2, total: 4 });
    const kinds = (await db(app).events.toArray()).sort((a, b) => a.seq - b.seq).map((e) => e.kind);
    expect(kinds).toEqual(['answered', 'shown']);
  });
});

describe('a join refused for the minute', () => {
  it('waits as many seconds as Retry-After says, once, then joins', async () => {
    const calls = stubRoutes({
      [`/api/${SLUG}/join`]: [
        () => ({ status: 429, body: { error: 'RATE_LIMITED' }, headers: { 'retry-after': '7' } }),
        JOINED,
      ],
      [`/api/${SLUG}/sync`]: [SYNCED],
    });
    const app = await opened(`/${SLUG}/join/wave-1`);
    const waits: number[] = [];
    app.wait = async (ms) => {
      waits.push(ms);
    };
    await app.join();
    expect(waits).toEqual([7000]);
    expect(calls.filter((c) => c.path.endsWith('/join'))).toHaveLength(2);
    expect(app.error).toBe('');
    expect(app.code).toMatch(/^\d{16}$/);
    expect(app.screen).toBe('demo');
  });

  it('never waits more than a minute, whatever the header says', async () => {
    stubRoutes({
      [`/api/${SLUG}/join`]: [
        () => ({ status: 429, body: { error: 'RATE_LIMITED' }, headers: { 'retry-after': '600' } }),
        JOINED,
      ],
      [`/api/${SLUG}/sync`]: [SYNCED],
    });
    const app = await opened(`/${SLUG}/join/wave-1`);
    const waits: number[] = [];
    app.wait = async (ms) => {
      waits.push(ms);
    };
    await app.join();
    expect(waits).toEqual([60_000]);
  });

  it('without a readable Retry-After, waits the default', async () => {
    stubRoutes({
      [`/api/${SLUG}/join`]: [() => ({ status: 429, body: { error: 'RATE_LIMITED' } }), JOINED],
      [`/api/${SLUG}/sync`]: [SYNCED],
    });
    const app = await opened(`/${SLUG}/join/wave-1`);
    const waits: number[] = [];
    app.wait = async (ms) => {
      waits.push(ms);
    };
    await app.join();
    expect(waits).toEqual([5000]);
  });

  it('a second refusal is shown in its wording and the wait is not repeated', async () => {
    const limited = () => ({
      status: 429,
      body: { error: 'RATE_LIMITED' },
      headers: { 'retry-after': '2' },
    });
    const calls = stubRoutes({ [`/api/${SLUG}/join`]: [limited, limited, limited] });
    const app = await opened(`/${SLUG}/join/wave-1`);
    const waits: number[] = [];
    app.wait = async (ms) => {
      waits.push(ms);
    };
    await app.join();
    expect(waits).toEqual([2000]);
    expect(calls.filter((c) => c.path.endsWith('/join'))).toHaveLength(2);
    expect(app.error).toBe('RATE_LIMITED');
    expect(app.retrying).toBe(false);
    expect(app.code).toBe('');
  });
});

describe('a session on the deck engine', () => {
  async function joined(): Promise<AppState> {
    const app = await opened(`/${SLUG}/join/wave-1`);
    await app.join();
    expect(app.screen).toBe('demo');
    await app.dismissDemo();
    expect(app.screen).toBe('card');
    return app;
  }

  it('records shown on display, dismissed then deferred on two set-asides, and ends when the engine says', async () => {
    stubRoutes({ [`/api/${SLUG}/join`]: [JOINED] });
    const app = await joined();
    const first = app.card!.id;
    await app.setAside();
    expect(app.card!.id).not.toBe(first);
    for (let i = 0; i < 3; i++) {
      expect(app.card!.id).not.toBe(first);
      app.draft = `Answer ${i}`;
      expect(await app.save()).toBe(true);
    }
    expect(app.screen).toBe('card');
    expect(app.card!.id).toBe(first);
    expect(app.position).toEqual({ n: 4, total: 4 });
    await app.setAside();
    expect(app.screen).toBe('session-end');
    expect(app.card).toBeUndefined();
    const events = (await db(app).events.toArray()).sort((a, b) => a.seq - b.seq);
    expect(events.map((e) => e.seq)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    // The set-aside card coming round again is not shown a second time (review finding a).
    expect(events.map((e) => `${e.kind}${e.cardId === first ? '*' : ''}`)).toEqual([
      'shown*',
      'dismissed*',
      'shown',
      'answered',
      'shown',
      'answered',
      'shown',
      'answered',
      'deferred*',
    ]);
    expect(events.every((e) => e.sessionId === app.live!.session.id)).toBe(true);
    expect(await db(app).sessions.count()).toBe(1);
  });

  it('a reload mid-session resumes the same card from the seed and the events, with no new session row', async () => {
    stubRoutes({ [`/api/${SLUG}/join`]: [JOINED] });
    const app = await joined();
    const first = app.card!.id;
    await app.setAside();
    const second = app.card!.id;
    const again = await opened(`/${SLUG}/join/wave-1`);
    expect(again.screen).toBe('card');
    expect(again.card!.id).toBe(second);
    expect(again.live!.session.id).toBe(app.live!.session.id);
    expect(again.live!.plan.queue).toEqual(app.live!.plan.queue);
    expect(again.live!.dismissed.has(first)).toBe(true);
    expect(again.hintOpen).toBe(false);
    expect(await db(again).sessions.count()).toBe(1);
    const kinds = (await db(again).events.toArray())
      .sort((a, b) => a.seq - b.seq)
      .map((e) => e.kind);
    // The resumed card was shown in this session already: no second `shown` (review finding a).
    expect(kinds).toEqual(['shown', 'dismissed', 'shown']);
  });

  it('after the session end, the next open starts session 2 with the deferred card first', async () => {
    stubRoutes({ [`/api/${SLUG}/join`]: [JOINED] });
    const app = await joined();
    const first = app.card!.id;
    await app.setAside();
    for (let i = 0; i < 3; i++) {
      app.draft = `Answer ${i}`;
      await app.save();
    }
    await app.setAside();
    expect(app.screen).toBe('session-end');
    const next = await opened(`/${SLUG}/join/wave-1`);
    expect(next.screen).toBe('card');
    expect(next.sessionNo).toBe(2);
    expect(next.card!.id).toBe(first);
    expect(next.hintOpen).toBe(false);
    expect(await db(next).sessions.count()).toBe(2);
  });

  it("a second device with the same code continues the session from the server's rows", async () => {
    const session = {
      id: '00000000-0000-4000-8000-000000000009',
      sessionNo: 1,
      startedDay: '2026-11-16',
      deckVersion: workshop.deck.version,
      seed: '0123456789abcdef',
    };
    const first = await (async () => {
      const { replaySession, currentCardId } = await import('../src/lib/session.ts');
      const live = replaySession(workshop.deck, workshop.config, session, {
        sessions: [],
        events: [],
      });
      return currentCardId(live)!;
    })();
    stubRoutes({
      [`/api/${SLUG}/me`]: [
        () => ({
          status: 200,
          body: {
            workshop: { slug: SLUG, name: 'x', closesDay: '2026-12-06', deleteDay: '2027-02-05' },
            participant: {
              createdDay: '2026-11-16',
              invitesLeft: 3,
              wave: 'wave-1',
              sessionsCount: 1,
            },
            sessions: [session],
            events: [
              {
                id: '10000000-0000-4000-8000-000000000001',
                sessionId: session.id,
                cardId: first,
                seq: 0,
                kind: 'answered',
                body: 'v1.' + 'A'.repeat(64),
                createdDay: '2026-11-16',
                deckVersion: workshop.deck.version,
              },
            ],
          },
        }),
      ],
    });
    const app = await opened(`/${SLUG}/continue`);
    await app.continueWithCode('1234 5678 9012 3456');
    // No demo card: the session is under way, and the demo is for a first session with nothing done.
    expect(app.screen).toBe('card');
    expect(app.sessionNo).toBe(1);
    expect(app.live!.session.id).toBe(session.id);
    expect(app.card!.id).not.toBe(first);
    expect(app.position).toEqual({ n: 2, total: 4 });
    expect(await db(app).sessions.count()).toBe(0);
  });
});

describe('the session end', () => {
  async function toTheEnd(app: AppState): Promise<void> {
    while (app.screen === 'card') {
      app.draft = 'An answer';
      await app.save();
    }
    expect(app.screen).toBe('session-end');
  }

  it('session 1 on a phone: the code, then the install prompt, then "come back"', async () => {
    stubRoutes({ [`/api/${SLUG}/join`]: [JOINED] });
    const app = await opened(`/${SLUG}/join/wave-1`);
    app.platform = 'Android';
    await app.join();
    await app.dismissDemo();
    await toTheEnd(app);
    expect(app.endStep).toBe('code');
    await app.nextFromCode();
    expect(app.endStep).toBe('install');
    await app.dismissInstall();
    expect(app.endStep).toBe('done');
    expect(await app.store!.get('installDismissals')).toBe('1');
  });

  it('the install prompt comes once more after one "Not now", and never after two', async () => {
    stubRoutes({ [`/api/${SLUG}/join`]: [JOINED] });
    const app = await opened(`/${SLUG}/join/wave-1`);
    app.platform = 'Android';
    await app.join();
    await app.dismissDemo();
    await toTheEnd(app);
    await app.nextFromCode();
    await app.dismissInstall();

    const second = await opened(`/${SLUG}/join/wave-1`);
    second.platform = 'Android';
    expect(second.sessionNo).toBe(2);
    await toTheEnd(second);
    expect(second.endStep).toBe('install');
    await second.dismissInstall();
    expect(await second.store!.get('installDismissals')).toBe('2');

    const third = await opened(`/${SLUG}/join/wave-1`);
    third.platform = 'Android';
    expect(third.sessionNo).toBe(3);
    await toTheEnd(third);
    expect(third.endStep).toBe('done');
  });

  it('a platform without steps, or an app already installed, goes from the code to "come back"', async () => {
    stubRoutes({ [`/api/${SLUG}/join`]: [JOINED] });
    const app = await opened(`/${SLUG}/join/wave-1`);
    app.platform = null;
    await app.join();
    await app.dismissDemo();
    await toTheEnd(app);
    expect(app.endStep).toBe('code');
    await app.nextFromCode();
    expect(app.endStep).toBe('done');

    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('standalone') }));
    const installed = await opened(`/${SLUG}/join/wave-1`);
    installed.platform = 'iPhone and iPad';
    await toTheEnd(installed);
    expect(installed.endStep).toBe('done');
  });

  it('"Install" uses the browser\'s offer once and lands on "come back"', async () => {
    stubRoutes({});
    const app = new AppState();
    app.workshop = workshop;
    app.copy = workshop.copy;
    app.store = new WorkshopStore(SLUG);
    let prompted = 0;
    app.installOffer = Object.assign(new Event('beforeinstallprompt'), {
      prompt: async () => {
        prompted++;
      },
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    });
    app.endStep = 'install';
    await app.install();
    expect(prompted).toBe(1);
    expect(app.installOffer).toBeNull();
    expect(app.endStep).toBe('done');
  });
});

describe('the installed app opens at the root', () => {
  it('goes on to the workshop this device last opened, and says "not a workshop" when there is none', async () => {
    stubRoutes({});
    localStorage.removeItem('wb:lastWorkshop');
    const first = await opened('/');
    expect(first.screen).toBe('no-workshop');

    const visited = await opened(`/${SLUG}/join/wave-1`);
    expect(visited.screen).toBe('welcome');
    expect(localStorage.getItem('wb:lastWorkshop')).toBe(SLUG);

    const gone: string[] = [];
    history.replaceState(null, '', '/');
    const app = new AppState();
    app.go = (href) => gone.push(href);
    await app.open('/');
    expect(gone).toEqual([`/${SLUG}/`]);
    expect(app.screen).toBe('loading');
  });
});

describe('the address bar', () => {
  it('remembers the wave link as the home address and restores it from the panel', async () => {
    stubRoutes({});
    const app = await opened(`/${SLUG}/join/wave-1`);
    expect(app.screen).toBe('welcome');
    await app.navigate('continue');
    expect(location.pathname).toBe(`/${SLUG}/continue`);
    await app.openPanel();
    await app.closePanel();
    expect(app.screen).toBe('enter-code');
    expect(location.pathname).toBe(`/${SLUG}/continue`);
    await app.navigate();
    expect(app.screen).toBe('welcome');
    expect(location.pathname).toBe(`/${SLUG}/join/wave-1`);
  });
});

describe('failure behaviour', () => {
  const ME = {
    workshop: { slug: SLUG, name: 'x', closesDay: '2026-12-06', deleteDay: '2027-02-05' },
    participant: { createdDay: '2026-11-16', invitesLeft: 3, wave: 'wave-1', sessionsCount: 0 },
    sessions: [],
    events: [],
  };

  async function storedCode() {
    const store = new WorkshopStore(SLUG);
    await store.set('code', '1234567890123456');
    store.close();
  }

  it('AUTH_CODE_UNKNOWN on a stored code forgets the code and shows the welcome with the explanation', async () => {
    await storedCode();
    stubRoutes({
      [`/api/${SLUG}/me`]: [() => ({ status: 401, body: { error: 'AUTH_CODE_UNKNOWN' } })],
    });
    const app = await opened(`/${SLUG}/join/wave-1`);
    expect(app.screen).toBe('welcome');
    expect(app.codeRefused).toBe(true);
    expect(app.code).toBe('');
    expect(await app.store!.get('code')).toBeUndefined();
    expect(app.lastError).toBe('AUTH_CODE_UNKNOWN');
  });

  it('but never while a join is still queued: the code stays and the session goes on', async () => {
    await storedCode();
    const store = new WorkshopStore(SLUG);
    await store.set('pendingJoin', JSON.stringify({ code: '1234567890123456', wave: 'wave-1' }));
    store.close();
    stubRoutes({
      [`/api/${SLUG}/join`]: [() => 'offline'],
      [`/api/${SLUG}/me`]: [() => ({ status: 401, body: { error: 'AUTH_CODE_UNKNOWN' } })],
    });
    const app = await opened(`/${SLUG}/join/wave-1`);
    expect(app.code).toBe('1234567890123456');
    expect(app.codeRefused).toBe(false);
    expect(['card', 'demo']).toContain(app.screen);
  });

  it('WORKSHOP_CLOSED from a sync shows the closed screen', async () => {
    await storedCode();
    const store = new WorkshopStore(SLUG);
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
    stubRoutes({
      [`/api/${SLUG}/me`]: [() => ({ status: 200, body: ME })],
      [`/api/${SLUG}/sync`]: [() => ({ status: 403, body: { error: 'WORKSHOP_CLOSED' } })],
    });
    const app = await opened(`/${SLUG}/join/wave-1`);
    expect(app.screen).toBe('closed');
    expect(app.lastError).toBe('WORKSHOP_CLOSED');
  });

  it('a sync that fails is tried again on a timer with backoff until the outbox is empty', async () => {
    const calls = stubRoutes({
      [`/api/${SLUG}/join`]: [JOINED],
      [`/api/${SLUG}/sync`]: [() => 'offline', () => 'offline', SYNCED],
    });
    const app = await opened(`/${SLUG}/join/wave-1`);
    const waits: number[] = [];
    app.wait = async (ms) => {
      waits.push(ms);
    };
    await app.join();
    await app.dismissDemo();
    await app.setAside();
    await vi.waitFor(() => expect(app.sync.lastResult).toBe('ok'));
    expect(waits).toEqual([5000, 10000]);
    expect(calls.filter((c) => c.path.endsWith('/sync'))).toHaveLength(3);
  });

  it('the "online" event sends the outbox at once', async () => {
    stubRoutes({
      [`/api/${SLUG}/join`]: [JOINED],
      [`/api/${SLUG}/sync`]: [() => 'offline', SYNCED],
    });
    const app = await opened(`/${SLUG}/join/wave-1`);
    let held = () => {};
    app.wait = () =>
      new Promise<void>((resolve) => {
        held = resolve;
      });
    await app.join();
    await app.dismissDemo();
    await app.setAside();
    await vi.waitFor(() => expect(app.sync.lastResult).toBe('offline'));
    await app.reconnected();
    expect(app.sync.lastResult).toBe('ok');
    held();
  });

  it('a browser that refuses storage still runs one session in memory, warns, and keeps nothing', async () => {
    const broken = {
      open: () => {
        throw new Error('storage refused');
      },
    };
    vi.stubGlobal('indexedDB', broken);
    const Dexie = (await import('dexie')).default;
    Dexie.dependencies.indexedDB = broken as unknown as IDBFactory;
    stubRoutes({ [`/api/${SLUG}/join`]: [JOINED], [`/api/${SLUG}/sync`]: [SYNCED, SYNCED] });
    const app = await opened(`/${SLUG}/join/wave-1`);
    expect(app.storageUnavailable).toBe(true);
    expect(app.lastError).toBe('CLIENT_STORAGE_UNAVAILABLE');
    expect(app.screen).toBe('welcome');
    await app.join();
    await app.dismissDemo();
    expect(app.screen).toBe('card');
    app.draft = 'An answer';
    expect(await app.save()).toBe(true);
    expect(app.sync.lastResult).toBe('ok');
    while (app.screen === 'card') await app.setAside();
    expect(app.screen).toBe('session-end');
    expect(app.endStep).toBe('code');
    freshIndexedDb();
    const again = await opened(`/${SLUG}/join/wave-1`);
    expect(again.code).toBe('');
  });

  it('"delete everything about me" also forgets the last workshop', async () => {
    await storedCode();
    stubRoutes({ [`/api/${SLUG}/me`]: [() => ({ status: 200, body: ME })] });
    const app = await opened(`/${SLUG}/join/wave-1`);
    expect(localStorage.getItem('wb:lastWorkshop')).toBe(SLUG);
    app.go = () => {};
    app.askDelete();
    await app.deleteMe();
    expect(localStorage.getItem('wb:lastWorkshop')).toBeNull();
  });
});

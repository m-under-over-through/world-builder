import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentCardId, replaySession } from '../src/lib/session.ts';
import { AppState, TOAST_MS } from '../src/lib/state.svelte.ts';
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

/** Open the app at an address; `hash` is the part after `#`, which the app reads from the address bar. */
async function opened(pathname: string, hash = ''): Promise<AppState> {
  history.replaceState(null, '', pathname + hash);
  const app = new AppState();
  app.wait = async () => {};
  await app.open(pathname);
  return app;
}

/** A link's value, and the code it makes (test/identity.test.ts pins the rule). */
const LINK_VALUE = 'test-link-value-0001';
const LINK_CODE = '9173841926745943';

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

  it('the draft stays when the open card is closed with ×, and goes with the answer once saved', async () => {
    stubRoutes({ [`/api/${SLUG}/sync`]: [SYNCED] });
    const app = await onACard();
    app.code = '1234567890123456';
    app.openCard();
    expect(app.cardState).toBe('answering');
    app.draft = 'Half';
    app.closeCard();
    expect(app.cardState).toBe('fresh');
    expect(app.draft).toBe('Half');
    app.openCard();
    app.draft = 'Whole';
    expect(await app.save()).toBe(true);
    expect(app.draft).toBe('');
    expect(app.cardState).toBe('fresh');
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

  it('records shown on display, dismissed then deferred on two set-asides, and starts the next round when the engine says this one is over', async () => {
    stubRoutes({ [`/api/${SLUG}/join`]: [JOINED] });
    const app = await joined();
    const first = app.card!.id;
    const roundOne = app.live!.session.id;
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
    // No screen between rounds (ADR 0017): the stack goes on with round 2.
    expect(app.screen).toBe('card');
    expect(app.sessionNo).toBe(2);
    expect(app.card).toBeDefined();
    const events = (await db(app).events.toArray())
      .filter((e) => e.sessionId === roundOne)
      .sort((a, b) => a.seq - b.seq);
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
    expect(await db(app).sessions.count()).toBe(2);
  });

  it('a reload mid-round resumes the same card from the seed and the events, with no new session row', async () => {
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

  it("a round's end starts the next round at once in the same open, with the deferred card first and sessionNo 2; a reload resumes it", async () => {
    stubRoutes({ [`/api/${SLUG}/join`]: [JOINED] });
    const app = await joined();
    const first = app.card!.id;
    const roundOne = app.live!.session.id;
    await app.setAside();
    for (let i = 0; i < 3; i++) {
      app.draft = `Answer ${i}`;
      await app.save();
    }
    await app.setAside();
    expect(app.screen).toBe('card');
    expect(app.sessionNo).toBe(2);
    expect(app.live!.session.id).not.toBe(roundOne);
    expect(app.card!.id).toBe(first);
    expect(app.cardNo).toBe(1);
    // The demo card and the hint belong to the first round of the first open only.
    expect(app.hintOpen).toBe(false);
    expect(await db(app).sessions.count()).toBe(2);
    const roundTwo = (await db(app).events.toArray()).filter(
      (e) => e.sessionId === app.live!.session.id,
    );
    expect(roundTwo.map((e) => `${e.kind}:${e.seq}`)).toEqual(['shown:0']);
    // The world keeps round 1's answers; round 2 has nothing set aside yet.
    expect(app.world.tiles).toHaveLength(3);
    expect(app.world.chips).toEqual([]);

    const again = await opened(`/${SLUG}/join/wave-1`);
    expect(again.screen).toBe('card');
    expect(again.sessionNo).toBe(2);
    expect(again.live!.session.id).toBe(app.live!.session.id);
    expect(again.card!.id).toBe(first);
    expect(await db(again).sessions.count()).toBe(2);
  });

  /** A state with its own small deck and counts, a store with the demo seen, a code, and no screen yet. */
  async function withDeck(
    cards: typeof workshop.deck.cards,
    warmupsPerSession: number,
    checkpointsPerSession: number,
  ): Promise<AppState> {
    const app = new AppState();
    app.workshop = {
      ...workshop,
      deck: { ...workshop.deck, cards },
      config: { ...workshop.config, warmupsPerSession, checkpointsPerSession },
    };
    app.copy = workshop.copy;
    app.store = new WorkshopStore(SLUG);
    await app.store.set('demoSeen', '2026-11-16');
    app.code = '1234567890123456';
    app.wait = async () => {};
    return app;
  }

  it('with every card answered, the next round brings the answered cards round again: the deck has no end', async () => {
    stubRoutes({});
    const warmup = workshop.deck.cards.find((c) => c.set === 'warmup')!;
    const checkpoint = workshop.deck.cards.find((c) => c.set === 'checkpoint')!;
    const app = await withDeck([warmup, checkpoint], 1, 1);
    await app.enterSession();
    for (const round of [1, 2, 3]) {
      expect(app.screen).toBe('card');
      expect(app.sessionNo).toBe(round);
      expect(app.card!.id).toBe(warmup.id);
      app.draft = `Warm-up, round ${round}`;
      await app.save();
      expect(app.card!.id).toBe(checkpoint.id);
      app.draft = `Checkpoint, round ${round}`;
      await app.save();
    }
    expect(app.sessionNo).toBe(4);
    expect(app.card!.id).toBe(warmup.id);
    // Every answer of every round is in the world, round by round.
    expect(app.world.tiles.map((t) => t.sessionNo)).toEqual([1, 1, 2, 2, 3, 3]);
    expect(await db(app).sessions.count()).toBe(4);
  });

  it('a workshop that plans no cards shows an empty stack and starts no round after round', async () => {
    stubRoutes({});
    const app = await withDeck(workshop.deck.cards, 0, 0);
    await app.enterSession();
    expect(app.screen).toBe('card');
    expect(app.card).toBeUndefined();
    await app.enterSession();
    expect(app.card).toBeUndefined();
    expect(await db(app).sessions.count()).toBe(1);
  });

  it("a second device opening the same link continues the session from the server's rows, with no intro", async () => {
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
    const app = await opened(`/${SLUG}/join/wave-1`, `#p=${LINK_VALUE}`);
    expect(app.code).toBe(LINK_CODE);
    // No welcome, no intro, no demo card: the session is under way, and the demo is for a first session with nothing done.
    expect(app.screen).toBe('card');
    expect(app.sessionNo).toBe(1);
    expect(app.live!.session.id).toBe(session.id);
    expect(app.card!.id).not.toBe(first);
    expect(app.position).toEqual({ n: 2, total: 4 });
    expect(await db(app).sessions.count()).toBe(0);
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
  it('remembers the wave link as the home address and restores it from the page about the app', async () => {
    stubRoutes({});
    const app = await opened(`/${SLUG}/join/wave-1`);
    expect(app.screen).toBe('welcome');
    await app.openAbout();
    expect(app.screen).toBe('about');
    expect(location.pathname).toBe(`/${SLUG}/about`);
    await app.back();
    expect(app.screen).toBe('welcome');
    expect(location.pathname).toBe(`/${SLUG}/join/wave-1`);
    await app.navigate('terms');
    expect(location.pathname).toBe(`/${SLUG}/terms`);
    await app.navigate();
    expect(app.screen).toBe('welcome');
    expect(location.pathname).toBe(`/${SLUG}/join/wave-1`);
  });
});

describe('identity by the link (ADR 0018)', () => {
  const UNKNOWN = () => ({ status: 401, body: { error: 'AUTH_CODE_UNKNOWN' } });
  const TAKEN = () => ({ status: 409, body: { error: 'JOIN_CODE_TAKEN' } });
  const ME = () => ({
    status: 200,
    body: {
      workshop: { slug: SLUG, name: 'x', closesDay: '2026-12-06', deleteDay: '2027-02-05' },
      participant: { createdDay: '2026-11-16', invitesLeft: 3, wave: 'wave-1', sessionsCount: 0 },
      sessions: [],
      events: [],
    },
  });

  it('a link with a value: the fragment leaves the address, the welcome says the link is theirs, and the join carries the code the value makes', async () => {
    const calls = stubRoutes({ [`/api/${SLUG}/me`]: [UNKNOWN], [`/api/${SLUG}/join`]: [JOINED] });
    const app = await opened(`/${SLUG}/join/wave-1`, `#p=${LINK_VALUE}`);
    expect(location.hash).toBe('');
    expect(location.pathname).toBe(`/${SLUG}/join/wave-1`);
    expect(app.screen).toBe('welcome');
    expect(app.linkCode).toBe(LINK_CODE);
    expect(app.code).toBe('');
    // A new participant is not a failure: no line about a refused link, nothing in the diagnostics.
    expect(app.codeRefused).toBe(false);
    expect(app.lastError).toBe('');
    // A reload during the intro, with the value gone from the address, still has the code.
    expect(await app.store!.get('linkCode')).toBe(LINK_CODE);
    await app.join();
    const joins = calls.filter((c) => c.path.endsWith('/join'));
    expect(joins.map((c) => c.body)).toEqual([{ code: LINK_CODE, wave: 'wave-1' }]);
    expect(app.code).toBe(LINK_CODE);
    expect(app.linkCode).toBe('');
    expect(await app.store!.get('code')).toBe(LINK_CODE);
    expect(await app.store!.get('linkCode')).toBeUndefined();
    expect(app.screen).toBe('demo');
  });

  it('the value never leaves the device: no request path, body or header carries it, and the store keeps only the code', async () => {
    const calls = stubRoutes({ [`/api/${SLUG}/me`]: [UNKNOWN], [`/api/${SLUG}/join`]: [JOINED] });
    const app = await opened(`/${SLUG}/join/wave-1`, `#p=${LINK_VALUE}`);
    await app.join();
    await app.dismissDemo();
    app.draft = 'An answer';
    expect(await app.save()).toBe(true);
    await app.openAbout();
    expect(calls.some((c) => c.path.endsWith('/sync'))).toBe(true);
    for (const call of calls) {
      expect(call.path).not.toContain(LINK_VALUE);
      expect(JSON.stringify(call.body ?? null)).not.toContain(LINK_VALUE);
      expect(JSON.stringify(call.headers)).not.toContain(LINK_VALUE);
      if (call.headers['authorization'])
        expect(call.headers['authorization']).toBe(`Code ${LINK_CODE}`);
    }
    expect(JSON.stringify(await db(app).settings.toArray())).not.toContain(LINK_VALUE);
    expect(location.href).not.toContain(LINK_VALUE);
  });

  it('a second open with the same value on a fresh device is the same participant: JOIN_CODE_TAKEN continues with that code, once', async () => {
    // GET /me did not answer on open, so the device could not tell; the join says it.
    const calls = stubRoutes({
      [`/api/${SLUG}/me`]: [() => 'offline', ME],
      [`/api/${SLUG}/join`]: [TAKEN],
    });
    const app = await opened(`/${SLUG}/join/wave-1`, `#p=${LINK_VALUE}`);
    expect(app.screen).toBe('welcome');
    await app.join();
    expect(calls.filter((c) => c.path.endsWith('/join'))).toHaveLength(1);
    expect(app.error).toBe('');
    expect(app.code).toBe(LINK_CODE);
    expect(await app.store!.get('code')).toBe(LINK_CODE);
    expect(app.me).not.toBeNull();
    expect(['demo', 'card']).toContain(app.screen);
  });

  it("a known participant's link opens straight to the cards: no welcome, no intro", async () => {
    const calls = stubRoutes({ [`/api/${SLUG}/me`]: [ME] });
    const app = await opened(`/${SLUG}/join/wave-1`, `#p=${LINK_VALUE}`);
    expect(app.code).toBe(LINK_CODE);
    expect(['demo', 'card']).toContain(app.screen);
    expect(calls.filter((c) => c.path.endsWith('/join'))).toHaveLength(0);
    expect(calls.find((c) => c.path.endsWith('/me'))!.headers['authorization']).toBe(
      `Code ${LINK_CODE}`,
    );
  });

  it('the link does not win while the old outbox cannot go out: nothing is wiped, the old code stays, the link waits', async () => {
    const OLD = '1234567890123456';
    const store = new WorkshopStore(SLUG);
    await store.set('code', OLD);
    await store.events.put({
      id: '10000000-0000-4000-8000-000000000002',
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
      [`/api/${SLUG}/me`]: [ME, ME],
      [`/api/${SLUG}/sync`]: [() => 'offline', () => 'offline'],
    });
    const app = await opened(`/${SLUG}/join/wave-1`, `#p=${LINK_VALUE}`);
    expect(app.code).toBe(OLD);
    expect(await app.store!.get('code')).toBe(OLD);
    expect(await app.store!.get('linkCode')).toBe(LINK_CODE);
    expect(
      (await db(app).events.toArray()).some((e) => e.id === '10000000-0000-4000-8000-000000000002'),
    ).toBe(true);
  });

  it("the link wins over a different stored code: the old outbox goes out with the old code, then the device's rows go", async () => {
    const OLD = '1234567890123456';
    const store = new WorkshopStore(SLUG);
    await store.set('code', OLD);
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
    // The server accepts the old participant's event, so the outbox empties and the switch happens.
    const accepted = {
      status: 200,
      body: { acceptedSessionIds: [], acceptedEventIds: ['10000000-0000-4000-8000-000000000001'] },
    };
    const calls = stubRoutes({ [`/api/${SLUG}/me`]: [ME, ME], [`/api/${SLUG}/sync`]: [accepted] });
    const app = await opened(`/${SLUG}/join/wave-1`, `#p=${LINK_VALUE}`);
    expect(app.code).toBe(LINK_CODE);
    expect(await app.store!.get('code')).toBe(LINK_CODE);
    const syncs = calls.filter((c) => c.path.endsWith('/sync'));
    expect(syncs[0]!.headers['authorization']).toBe(`Code ${OLD}`);
    expect((syncs[0]!.body as { events: { id: string }[] }).events.map((e) => e.id)).toEqual([
      '10000000-0000-4000-8000-000000000001',
    ]);
    // Nothing of the old participant's is left on the device, or sent under the new code.
    expect(
      (await db(app).events.toArray()).some((e) => e.id === '10000000-0000-4000-8000-000000000001'),
    ).toBe(false);
    for (const sync of syncs.slice(1))
      expect(JSON.stringify(sync.body)).not.toContain('10000000-0000-4000-8000-000000000001');
  });

  it('a link whose participant was deleted makes the same code again: a new participant, with the welcome', async () => {
    const store = new WorkshopStore(SLUG);
    await store.set('code', LINK_CODE);
    store.close();
    stubRoutes({ [`/api/${SLUG}/me`]: [UNKNOWN] });
    const app = await opened(`/${SLUG}/join/wave-1`, `#p=${LINK_VALUE}`);
    expect(app.screen).toBe('welcome');
    expect(app.code).toBe('');
    expect(app.linkCode).toBe(LINK_CODE);
    expect(app.codeRefused).toBe(false);
  });

  it('a link without a value makes a device code as before, and asks nothing before the join', async () => {
    const calls = stubRoutes({ [`/api/${SLUG}/join`]: [JOINED] });
    const app = await opened(`/${SLUG}/join/wave-1`);
    expect(app.linkCode).toBe('');
    expect(calls.filter((c) => c.path.endsWith('/me'))).toHaveLength(0);
    await app.join();
    const code = (calls.find((c) => c.path.endsWith('/join'))!.body as { code: string }).code;
    expect(code).toMatch(/^\d{16}$/);
    expect(code).not.toBe(LINK_CODE);
    expect(app.code).toBe(code);
  });

  it('a value that is not one (too short, or in the wrong shape) is ignored, and still leaves the address', async () => {
    stubRoutes({});
    const app = await opened(`/${SLUG}/join/wave-1`, '#p=ab');
    expect(location.hash).toBe('');
    expect(app.linkCode).toBe('');
    expect(app.screen).toBe('welcome');
  });
});

describe('the one page about the app and the way back', () => {
  it('/panel and /trust open the page at their section, /about at the top, and Back from a direct open lands home', async () => {
    stubRoutes({});
    const panel = await opened(`/${SLUG}/panel`);
    expect(panel.screen).toBe('about');
    expect(panel.aboutSection).toBe('now');
    expect(location.pathname).toBe(`/${SLUG}/about`);
    await panel.back();
    expect(panel.screen).toBe('welcome');
    expect(location.pathname).toBe(`/${SLUG}/`);

    const trust = await opened(`/${SLUG}/trust`);
    expect(trust.screen).toBe('about');
    expect(trust.aboutSection).toBe('protected');

    const about = await opened(`/${SLUG}/about`);
    expect(about.screen).toBe('about');
    expect(about.aboutSection).toBeNull();
  });

  it('the terms opened from the page go back to the page, and the page back to the screen it was opened from', async () => {
    stubRoutes({});
    const app = await opened(`/${SLUG}/join/wave-1`);
    expect(app.screen).toBe('welcome');
    await app.openAbout();
    app.openPage('terms');
    expect(app.screen).toBe('terms');
    expect(location.pathname).toBe(`/${SLUG}/terms`);
    await app.closePage();
    expect(app.screen).toBe('about');
    expect(location.pathname).toBe(`/${SLUG}/about`);
    await app.back();
    expect(app.screen).toBe('welcome');
    expect(location.pathname).toBe(`/${SLUG}/join/wave-1`);
  });

  it('the policy opened directly by its address goes back to where the device lands', async () => {
    stubRoutes({});
    const app = await opened(`/${SLUG}/privacy`);
    expect(app.screen).toBe('privacy');
    await app.closePage();
    expect(app.screen).toBe('welcome');
    expect(location.pathname).toBe(`/${SLUG}/`);
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
    // The toast's hold is a wait too (TOAST_MS); the retries are the two after it.
    expect(waits.filter((ms) => ms !== TOAST_MS)).toEqual([5000, 10000]);
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

  it('a browser that refuses storage still runs the cards in memory, round after round, warns, and keeps nothing', async () => {
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
    while (app.sessionNo === 1) await app.setAside();
    expect(app.screen).toBe('card');
    expect(app.sessionNo).toBe(2);
    freshIndexedDb();
    const again = await opened(`/${SLUG}/join/wave-1`);
    expect(again.code).toBe('');
  });

  it('"delete everything I sent" also forgets the last workshop', async () => {
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

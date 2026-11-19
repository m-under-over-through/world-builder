import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentCardId, replaySession, withAnswer, withShown } from '../src/lib/session.ts';
import { AppState } from '../src/lib/state.svelte.ts';
import { WorkshopStore } from '../src/lib/store.ts';
import { findWorkshop } from '../src/lib/workshops.ts';
import { answerFront, freshIndexedDb, JOINED, stubRoutes, SYNCED } from './helpers.ts';

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

/** A state on the first card of a fresh first session, the onboarding card seen, with a store but no code. */
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
  app.screen = 'card';
  return app;
}

describe('saving an answer', () => {
  it('a sealing failure is shown as CLIENT_SEAL_FAILED, never as the crypto code, and the draft stays', async () => {
    stubRoutes({});
    const app = await onACard();
    expect(await answerFront(app, 'a lone surrogate \uD83D cannot be encoded')).toBe(false);
    expect(app.error).toBe('CLIENT_SEAL_FAILED');
    expect(app.saving).toBe(false);
    // The open card stays open with its words, so nothing written is lost.
    expect(app.cardOpen).toBe(true);
    expect(app.openDraft).toBe('a lone surrogate \uD83D cannot be encoded');
    expect(await db(app).events.count()).toBe(0);
  });

  it('a saved answer clears the draft, marks the card answered, and the next card comes', async () => {
    stubRoutes({ [`/api/${SLUG}/sync`]: [SYNCED] });
    const app = await onACard();
    app.code = '1234567890123456';
    const first = app.card!;
    expect(await answerFront(app, 'An answer')).toBe(true);
    expect(app.draft).toBe('');
    expect(app.openDraft).toBe('');
    expect(app.cardOpen).toBe(false);
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
    expect(app.writing).toBe(app.card!.id);
    app.openDraft = 'Half';
    await app.closeCard();
    expect(app.cardOpen).toBe(false);
    expect(app.draft).toBe('Half');
    app.openCard();
    expect(app.openDraft).toBe('Half');
    app.openDraft = 'Whole';
    expect(await app.save()).toBe(true);
    expect(app.draft).toBe('');
    expect(app.cardOpen).toBe(false);
  });

  it('a save from the stack gives the round withAnswer gave, for every card of a round but its last and with a card set aside: the same plan, the same sets, the same seq; the last card starts the next round, as it always did', async () => {
    // Before ADR 0027 the stack's save moved the round on with `withAnswer`; the one save replays
    // the round from its events (`replaySession`). Card by card, the round after a save must be
    // the one `withAnswer` gives, with the next card's `shown` on top.
    stubRoutes({});
    const app = await onACard();
    app.code = '1234567890123456';
    await app.setAside();
    const round = app.live!.session.id;
    let compared = 0;
    while (app.live!.session.id === round) {
      const before = app.live!;
      const card = app.card!.id;
      expect(await answerFront(app, `An answer to ${card}`)).toBe(true);
      if (app.live!.session.id !== round) break;
      expect(app.live).toEqual(withShown(withAnswer(before, card), app.card!.id));
      compared++;
    }
    expect(compared).toBe(2);
    // The last card of the round is not compared: its save ends the round, and the round on the
    // screen afterwards is the next one, replayed from nothing, whichever way the last was made.
    expect(app.sessionNo).toBe(2);
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
    expect(app.screen).toBe('card');
    expect(app.demoFront).toBe(true);
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
    expect(app.screen).toBe('card');
    expect(app.demoFront).toBe(true);
    await app.dismissDemo();
    expect(app.screen).toBe('card');
    expect(app.demoFront).toBe(false);
    return app;
  }

  it('records shown on display, dismissed on a first set-aside, and deferred when the card comes back in the next round and is set aside again', async () => {
    stubRoutes({ [`/api/${SLUG}/join`]: [JOINED] });
    const app = await joined();
    const first = app.card!.id;
    const roundOne = app.live!.session.id;
    await app.setAside();
    for (let i = 0; i < 3; i++) {
      expect(app.card!.id).not.toBe(first);
      expect(await answerFront(app, `Answer ${i}`)).toBe(true);
    }
    // The card left round 1 (ADR 0020), so round 1 is over: round 2 brings it back, never first.
    expect(app.screen).toBe('card');
    expect(app.sessionNo).toBe(2);
    expect(app.card!.id).not.toBe(first);
    expect(app.live!.plan.queue).toContain(first);
    while (app.card!.id !== first) await answerFront(app, 'More');
    await app.setAside();
    expect(app.live!.deferred.has(first)).toBe(true);
    const events = (await db(app).events.toArray())
      .filter((e) => e.sessionId === roundOne)
      .sort((a, b) => a.seq - b.seq);
    expect(events.map((e) => e.seq)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(events.map((e) => `${e.kind}${e.cardId === first ? '*' : ''}`)).toEqual([
      'shown*',
      'dismissed*',
      'shown',
      'answered',
      'shown',
      'answered',
      'shown',
      'answered',
    ]);
    const roundTwo = (await db(app).events.toArray())
      .filter((e) => e.sessionId === app.live!.session.id && e.cardId === first)
      .sort((a, b) => a.seq - b.seq);
    expect(roundTwo.map((e) => e.kind)).toEqual(['shown', 'deferred']);
    expect(await db(app).sessions.count()).toBe(2);
  });

  it('the onboarding card is the front on the first open: the first card waits behind it unrecorded, then is shown when it goes, and it never comes back on this device', async () => {
    stubRoutes({ [`/api/${SLUG}/join`]: [JOINED] });
    const app = await opened(`/${SLUG}/join/wave-1`);
    await app.join();
    expect(app.screen).toBe('card');
    expect(app.demoFront).toBe(true);
    const first = app.card!.id;
    expect(first).toBe(app.live!.plan.queue[0]);
    expect(await db(app).events.count()).toBe(0);
    // The card behind cannot be opened while the onboarding card is in front.
    app.openCard();
    expect(app.cardOpen).toBe(false);
    await app.dismissDemo();
    expect(app.demoFront).toBe(false);
    expect(app.card!.id).toBe(first);
    expect(await app.store!.get('demoSeen')).toBeTruthy();
    expect((await db(app).events.toArray()).map((e) => `${e.kind}:${e.cardId}`)).toEqual([
      `shown:${first}`,
    ]);
    const again = await opened(`/${SLUG}/join/wave-1`);
    expect(again.demoFront).toBe(false);
    expect(again.card!.id).toBe(first);
  });

  it('Set aside with the onboarding card in front sends it away, as "Got it" does, and records nothing for the card behind', async () => {
    stubRoutes({ [`/api/${SLUG}/join`]: [JOINED] });
    const app = await opened(`/${SLUG}/join/wave-1`);
    await app.join();
    const first = app.card!.id;
    await app.setAside();
    expect(app.demoFront).toBe(false);
    expect(app.card!.id).toBe(first);
    expect(app.live!.dismissed.has(first)).toBe(false);
    expect((await db(app).events.toArray()).map((e) => e.kind)).toEqual(['shown']);
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
    again.openCard();
    expect(again.hintOpen).toBe(false);
    await again.closeCard();
    expect(await db(again).sessions.count()).toBe(1);
    const kinds = (await db(again).events.toArray())
      .sort((a, b) => a.seq - b.seq)
      .map((e) => e.kind);
    // The resumed card was shown in this session already: no second `shown` (review finding a).
    expect(kinds).toEqual(['shown', 'dismissed', 'shown']);
  });

  it("a round's end starts the next round at once in the same open, with the set-aside card back but not first, and sessionNo 2; a reload resumes it", async () => {
    stubRoutes({ [`/api/${SLUG}/join`]: [JOINED] });
    const app = await joined();
    const first = app.card!.id;
    const roundOne = app.live!.session.id;
    await app.setAside();
    for (let i = 0; i < 3; i++) await answerFront(app, `Answer ${i}`);
    expect(app.screen).toBe('card');
    expect(app.sessionNo).toBe(2);
    expect(app.live!.session.id).not.toBe(roundOne);
    expect(app.card!.id).not.toBe(first);
    expect(app.live!.plan.queue).toContain(first);
    expect(app.cardNo).toBe(1);
    // The onboarding card and the hint belong to the first round of the first open only.
    expect(app.demoFront).toBe(false);
    app.openCard();
    expect(app.hintOpen).toBe(false);
    await app.closeCard();
    expect(await db(app).sessions.count()).toBe(2);
    const roundTwo = (await db(app).events.toArray()).filter(
      (e) => e.sessionId === app.live!.session.id,
    );
    expect(roundTwo.map((e) => `${e.kind}:${e.seq}`)).toEqual(['shown:0']);
    // The world keeps round 1's answers, and the card set aside in round 1 stays among the cards
    // set aside while it waits in round 2's queue (ADR 0024).
    expect(app.world.tiles).toHaveLength(3);
    expect(app.world.aside.map((t) => t.cardId)).toEqual([first]);

    const again = await opened(`/${SLUG}/join/wave-1`);
    expect(again.screen).toBe('card');
    expect(again.sessionNo).toBe(2);
    expect(again.live!.session.id).toBe(app.live!.session.id);
    expect(again.card!.id).toBe(app.card!.id);
    expect(await db(again).sessions.count()).toBe(2);
  });

  /** A state with its own small deck and counts, a store with the onboarding card seen, a code, and no screen yet. */
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

  it('with every card answered, the deck is done: the next round plans nothing and no other starts', async () => {
    stubRoutes({});
    const warmup = workshop.deck.cards.find((c) => c.set === 'warmup')!;
    const checkpoint = workshop.deck.cards.find((c) => c.set === 'checkpoint')!;
    const app = await withDeck([warmup, checkpoint], 1, 1);
    await app.enterSession();
    expect(app.card!.id).toBe(warmup.id);
    await answerFront(app, 'Warm-up');
    expect(app.card!.id).toBe(checkpoint.id);
    await answerFront(app, 'Checkpoint');
    // ADR 0020: an answered card never comes round again, so round 2 is empty and says so.
    expect(app.screen).toBe('card');
    expect(app.sessionNo).toBe(2);
    expect(app.card).toBeUndefined();
    expect(app.live!.deckDone).toBe(true);
    expect(app.world.tiles.map((t) => t.sessionNo)).toEqual([1, 1]);
    expect(await db(app).sessions.count()).toBe(2);
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
    // No welcome and no onboarding card: the session is under way, and the onboarding card is for a first session with nothing done.
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

  it('a link with a value: the fragment leaves the address, the welcome is shown, and the join carries the code the value makes', async () => {
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
    expect(app.screen).toBe('card');
    expect(app.demoFront).toBe(true);
  });

  it('the value never leaves the device: no request path, body or header carries it, and the store keeps only the code', async () => {
    const calls = stubRoutes({ [`/api/${SLUG}/me`]: [UNKNOWN], [`/api/${SLUG}/join`]: [JOINED] });
    const app = await opened(`/${SLUG}/join/wave-1`, `#p=${LINK_VALUE}`);
    await app.join();
    await app.dismissDemo();
    expect(await answerFront(app, 'An answer')).toBe(true);
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
    expect(app.screen).toBe('card');
  });

  it("a known participant's link opens straight to the cards: no welcome, no intro", async () => {
    const calls = stubRoutes({ [`/api/${SLUG}/me`]: [ME] });
    const app = await opened(`/${SLUG}/join/wave-1`, `#p=${LINK_VALUE}`);
    expect(app.code).toBe(LINK_CODE);
    expect(app.screen).toBe('card');
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
    const accepted = () => ({
      status: 200,
      body: { acceptedSessionIds: [], acceptedEventIds: ['10000000-0000-4000-8000-000000000001'] },
    });
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

  it('a reload without #p= keeps the device-made code: every request carries it, and nothing is wiped', async () => {
    const calls = stubRoutes({ [`/api/${SLUG}/join`]: [JOINED] });
    const first = await opened(`/${SLUG}/join/wave-1`);
    await first.join();
    await first.dismissDemo();
    expect(await answerFront(first, 'An answer')).toBe(true);
    const code = first.code;
    expect(code).toMatch(/^\d{16}$/);
    const again = await opened(`/${SLUG}/join/wave-1`);
    expect(again.code).toBe(code);
    expect(await again.store!.get('code')).toBe(code);
    expect(await again.store!.get('linkCode')).toBeUndefined();
    expect(again.screen).toBe('card');
    expect((await db(again).events.toArray()).filter((e) => e.kind === 'answered')).toHaveLength(1);
    for (const call of calls)
      if (call.headers['authorization']) expect(call.headers['authorization']).toBe(`Code ${code}`);
  });

  it('a value in the query is not a link: no code is made from it, and nothing is asked before the join', async () => {
    const calls = stubRoutes({});
    history.replaceState(null, '', `/${SLUG}/join/wave-1?p=${LINK_VALUE}`);
    const app = new AppState();
    app.wait = async () => {};
    await app.open(`/${SLUG}/join/wave-1`);
    expect(app.linkCode).toBe('');
    expect(await app.store!.get('linkCode')).toBeUndefined();
    expect(calls.filter((c) => c.path.endsWith('/me'))).toHaveLength(0);
    for (const call of calls) expect(JSON.stringify(call)).not.toContain(LINK_VALUE);
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
    expect(app.screen).toBe('card');
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
    // No toast holds a wait any more (ADR 0019): the waits are the two retries.
    expect(waits).toEqual([5000, 10000]);
    expect(calls.filter((c) => c.path.endsWith('/sync'))).toHaveLength(3);
  });

  it('a sync refused for good is not retried on the timer: one try, the outbox kept, and the next saved answer tries once more', async () => {
    const REFUSED = () => ({ status: 400, body: { error: 'SYNC_PAYLOAD_INVALID' } });
    const calls = stubRoutes({
      [`/api/${SLUG}/join`]: [JOINED],
      [`/api/${SLUG}/sync`]: [REFUSED, REFUSED, SYNCED],
    });
    const app = await opened(`/${SLUG}/join/wave-1`);
    const waits: number[] = [];
    app.wait = async (ms) => {
      waits.push(ms);
    };
    await app.join();
    await app.dismissDemo();
    await app.setAside();
    await vi.waitFor(() => expect(app.sync.lastError).toBe('SYNC_PAYLOAD_INVALID'));
    // Let any retry the refusal might have scheduled run: with instant waits it would be immediate.
    await new Promise((resolve) => setTimeout(resolve, 20));
    const syncs = () => calls.filter((c) => c.path.endsWith('/sync')).length;
    expect(waits).toEqual([]);
    expect(syncs()).toBe(1);
    expect(app.sync.outboxSize).toBeGreaterThan(0);
    expect(app.lastError).toBe('SYNC_PAYLOAD_INVALID');
    // The next action tries once, and only once, without starting the timer.
    await app.setAside();
    await vi.waitFor(() => expect(syncs()).toBe(2));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(syncs()).toBe(2);
    expect(waits).toEqual([]);
    // A server that takes the batch again (a fixed client, a fixed server) gets it on the next try.
    await app.reconnected();
    expect(syncs()).toBe(3);
    expect(app.sync.lastResult).toBe('ok');
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
    expect(await answerFront(app, 'An answer')).toBe(true);
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

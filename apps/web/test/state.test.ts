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
    expect(await app.store!.events.count()).toBe(0);
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
    const kinds = (await app.store!.events.toArray())
      .sort((a, b) => a.seq - b.seq)
      .map((e) => e.kind);
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
    const events = (await app.store!.events.toArray()).sort((a, b) => a.seq - b.seq);
    expect(events.map((e) => e.seq)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(events.map((e) => `${e.kind}${e.cardId === first ? '*' : ''}`)).toEqual([
      'shown*',
      'dismissed*',
      'shown',
      'answered',
      'shown',
      'answered',
      'shown',
      'answered',
      'shown*',
      'deferred*',
    ]);
    expect(events.every((e) => e.sessionId === app.live!.session.id)).toBe(true);
    expect(await app.store!.sessions.count()).toBe(1);
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
    expect(await again.store!.sessions.count()).toBe(1);
    const kinds = (await again.store!.events.toArray())
      .sort((a, b) => a.seq - b.seq)
      .map((e) => e.kind);
    expect(kinds).toEqual(['shown', 'dismissed', 'shown', 'shown']);
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
    expect(await next.store!.sessions.count()).toBe(2);
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
    expect(await app.store!.sessions.count()).toBe(0);
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

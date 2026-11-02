import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  await app.open(pathname);
  return app;
}

describe('saving an answer', () => {
  it('a sealing failure is shown as CLIENT_SEAL_FAILED, never as the crypto code, and the draft stays', async () => {
    stubRoutes({});
    const app = new AppState();
    app.workshop = workshop;
    app.copy = workshop.copy;
    app.store = new WorkshopStore(SLUG);
    app.cards = workshop.deck.cards.slice(0, 1);
    app.draft = 'a lone surrogate \uD83D cannot be encoded';
    expect(await app.save()).toBe(false);
    expect(app.error).toBe('CLIENT_SEAL_FAILED');
    expect(app.draft).toBe('a lone surrogate \uD83D cannot be encoded');
    expect(await app.store.events.count()).toBe(0);
  });

  it('a saved answer clears the draft', async () => {
    stubRoutes({ [`/api/${SLUG}/sync`]: [SYNCED] });
    const app = new AppState();
    app.workshop = workshop;
    app.copy = workshop.copy;
    app.store = new WorkshopStore(SLUG);
    app.code = '1234567890123456';
    app.cards = workshop.deck.cards.slice(0, 2);
    app.draft = 'An answer';
    expect(await app.save()).toBe(true);
    expect(app.draft).toBe('');
    expect(app.index).toBe(1);
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

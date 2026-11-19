import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import Welcome from '../src/screens/Welcome.svelte';
import { leaveStartOver, START_OVER, takeStartOver } from '../src/lib/start-over.ts';
import { AppState } from '../src/lib/state.svelte.ts';
import { WorkshopStore } from '../src/lib/store.ts';
import { findWorkshop } from '../src/lib/workshops.ts';
import { freshIndexedDb, JOINED, stubRoutes, type Answer } from './helpers.ts';

/**
 * After "Delete everything", the same tab is back at the beginning (ADR 0026): the welcome with
 * "I understand", and the join starts the same link over. The delete leaves one note for the page
 * load that follows it, in the tab's session storage; it is read once and erased. Every test
 * stubs the routes before anything can sync, so no request leaves.
 */
const SLUG = 'rural-manufacturing';
const copy = findWorkshop(SLUG)!.copy;
const CODE = '1234567890123456';
/** A link's value, and the code it makes (test/identity.test.ts pins the rule). */
const LINK_VALUE = 'test-link-value-0001';
const LINK_CODE = '9173841926745943';

/** GET /me for a participant who joined through this wave; null is one who came through an invite. */
const meOf = (wave: string | null) => (): Answer => ({
  status: 200,
  body: {
    workshop: { slug: SLUG, name: 'x', closesDay: '2026-12-06', deleteDay: '2027-02-05' },
    participant: { createdDay: '2026-11-16', invitesLeft: 3, wave, sessionsCount: 0 },
    sessions: [],
    events: [],
  },
});
const ME = meOf('wave-1');
const OFFLINE = () => 'offline' as const;
const TAKEN = (): Answer => ({ status: 409, body: { error: 'JOIN_CODE_TAKEN' } });
const DELETED = (): Answer => ({ status: 200, body: { ok: true } });
const UNKNOWN = (): Answer => ({ status: 401, body: { error: 'AUTH_CODE_UNKNOWN' } });
const REFUSED = (): Answer => ({
  status: 500,
  body: { error: 'SERVER_ERROR', errorId: 'abcd1234' },
});
const me = `/api/${SLUG}/me`;
const join = `/api/${SLUG}/join`;

beforeEach(() => {
  freshIndexedDb();
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** A page load: a new state, as after `location.replace`, opened at this address. */
async function opened(pathname: string, hash = ''): Promise<AppState> {
  history.replaceState(null, '', pathname + hash);
  const app = new AppState();
  app.wait = async () => {};
  await app.open(pathname);
  return app;
}

/** A device that holds a code and came through this arrival, opened on its cards. */
async function joined(arrival: object = { wave: 'wave-1' }): Promise<AppState> {
  const store = new WorkshopStore(SLUG);
  await store.set('code', CODE);
  await store.set('arrival', JSON.stringify(arrival));
  await store.set('demoSeen', '2026-11-16');
  store.close();
  const app = await opened(`/${SLUG}/`);
  expect(app.screen).toBe('card');
  return app;
}

/** "Delete everything", then "Yes, delete everything"; returns the address the page went to. */
async function deleteEverything(app: AppState): Promise<string> {
  let wentTo = '';
  app.go = (href) => {
    wentTo = href;
  };
  app.askDelete();
  await app.deleteMe();
  return wentTo;
}

const iUnderstand = () =>
  screen.queryByRole('button', { name: copy.item('Buttons', 'i understand') });

describe('after "Delete everything", in the same tab', () => {
  it('the welcome offers "I understand" again, and the join starts the same link over: the same code, through the same wave, from the onboarding card', async () => {
    const calls = stubRoutes({ [me]: [ME, DELETED], [join]: [JOINED] });
    const app = await joined();
    const wentTo = await deleteEverything(app);
    // The page goes to the workshop's home, and the code is in no address.
    expect(wentTo).toBe(`/${SLUG}/`);
    expect(wentTo).not.toContain(CODE);

    const again = await opened(wentTo);
    expect(again.screen).toBe('welcome');
    expect(again.linkCode).toBe(CODE);
    expect(again.arrival).toEqual({ wave: 'wave-1' });
    expect(again.codeRefused).toBe(false);
    expect(location.href).not.toContain(CODE);
    render(Welcome, { app: again });
    expect(iUnderstand()).toBeTruthy();
    expect(screen.queryByText(copy.text('Welcome: no link'))).toBeNull();

    await again.join();
    const joins = calls.filter((c) => c.path === join);
    expect(joins.map((c) => c.body)).toEqual([{ code: CODE, wave: 'wave-1' }]);
    expect(again.code).toBe(CODE);
    expect(again.linkCode).toBe('');
    expect(again.screen).toBe('card');
    // The beginning: the onboarding card is in front again, since the device forgot it had seen it.
    expect(again.demoFront).toBe(true);
    // Starting over is not a new arrival: no wave open is counted for it.
    expect(calls.some((c) => c.path.endsWith('/opened'))).toBe(false);
  });

  it("the note is read once and erased, and nothing of it goes back into the device's store", async () => {
    stubRoutes({ [me]: [ME, DELETED] });
    await deleteEverything(await joined());
    expect(sessionStorage.getItem(START_OVER)).not.toBeNull();
    const again = await opened(`/${SLUG}/`);
    expect(again.linkCode).toBe(CODE);
    expect(sessionStorage.getItem(START_OVER)).toBeNull();
    for (const key of ['code', 'linkCode', 'arrival', 'consent'])
      expect(await again.store!.get(key), key).toBeUndefined();
    expect(JSON.stringify({ ...localStorage })).not.toContain(CODE);
  });

  it('a reload of that welcome forgets it: the welcome asks for the link, with no button', async () => {
    stubRoutes({ [me]: [ME, DELETED] });
    await deleteEverything(await joined());
    await opened(`/${SLUG}/`);
    const reloaded = await opened(`/${SLUG}/`);
    expect(reloaded.screen).toBe('welcome');
    expect(reloaded.linkCode).toBe('');
    expect(reloaded.arrival).toEqual({});
    render(Welcome, { app: reloaded });
    expect(iUnderstand()).toBeNull();
    expect(screen.getByText(copy.text('Welcome: no link'))).toBeTruthy();
  });

  it('with no note there is no starting over, as in another tab', async () => {
    stubRoutes({ [me]: [ME, DELETED] });
    await deleteEverything(await joined());
    // A browser gives each tab a session storage of its own. The test DOM has no tabs, so the
    // other tab is stood in for by emptying the one there is.
    sessionStorage.clear();
    const other = await opened(`/${SLUG}/`);
    expect(other.linkCode).toBe('');
    render(Welcome, { app: other });
    expect(iUnderstand()).toBeNull();
  });

  it('a link opened in that tab wins over the note, and the note is erased all the same', async () => {
    stubRoutes({ [me]: [ME, DELETED, UNKNOWN] });
    await deleteEverything(await joined());
    const again = await opened(`/${SLUG}/join/wave-1`, `#p=${LINK_VALUE}`);
    expect(again.linkCode).toBe(LINK_CODE);
    expect(sessionStorage.getItem(START_OVER)).toBeNull();
  });

  it('the wave is the one the participant joined through, as the server says, not the last one this device opened', async () => {
    const calls = stubRoutes({ [me]: [ME, DELETED], [join]: [JOINED] });
    // Joined through wave-1, and has opened another wave's link since.
    const app = await joined({ wave: 'wave-2' });
    expect(app.arrival).toEqual({ wave: 'wave-2' });
    const again = await opened(await deleteEverything(app));
    expect(again.arrival).toEqual({ wave: 'wave-1' });
    await again.join();
    expect(calls.filter((c) => c.path === join).map((c) => c.body)).toEqual([
      { code: CODE, wave: 'wave-1' },
    ]);
  });

  it('a wave link without a value, or an invite, opened in that tab is a new arrival: the note is erased and not used', async () => {
    for (const address of [`/${SLUG}/join/wave-2`, `/${SLUG}/join/i/abcDEF123_-abcDEF123_-`]) {
      freshIndexedDb();
      const calls = stubRoutes({ [me]: [ME, DELETED], [join]: [JOINED] });
      await deleteEverything(await joined());
      const other = await opened(address);
      expect(other.linkCode, address).toBe('');
      expect(sessionStorage.getItem(START_OVER), address).toBeNull();
      await other.join();
      const [sent] = calls.filter((c) => c.path === join).map((c) => c.body as { code: string });
      expect(sent!.code, address).not.toBe(CODE);
    }
  });

  it('offline at "I understand": the code is stored and the join waits in the queue, as for any link', async () => {
    stubRoutes({ [me]: [ME, DELETED], [join]: [OFFLINE] });
    const again = await opened(await deleteEverything(await joined()));
    await again.join();
    expect(again.code).toBe(CODE);
    expect(await again.store!.get('code')).toBe(CODE);
    expect(again.screen).toBe('card');
  });

  it('the same link joined again from another phone in between: "I understand" continues as that participant', async () => {
    stubRoutes({ [me]: [ME, DELETED, ME], [join]: [TAKEN] });
    const again = await opened(await deleteEverything(await joined()));
    await again.join();
    expect(again.code).toBe(CODE);
    expect(again.linkCode).toBe('');
    expect(again.screen).toBe('card');
  });
});

describe('when no note is left', () => {
  it('a delete the server refused leaves no note, and the device keeps its code', async () => {
    stubRoutes({ [me]: [ME, REFUSED] });
    const app = await joined();
    const wentTo = await deleteEverything(app);
    expect(wentTo).toBe('');
    expect(app.error).toBe('SERVER_ERROR');
    expect(sessionStorage.getItem(START_OVER)).toBeNull();
    expect(await app.store!.get('code')).toBe(CODE);
  });

  it('a device that came through an invite leaves none: its token works once, and the welcome asks for the link', async () => {
    stubRoutes({ [me]: [meOf(null), DELETED] });
    await deleteEverything(await joined({ invite: 'abcDEF123_-abcDEF123_-' }));
    expect(sessionStorage.getItem(START_OVER)).toBeNull();
    const again = await opened(`/${SLUG}/`);
    expect(again.linkCode).toBe('');
    render(Welcome, { app: again });
    expect(iUnderstand()).toBeNull();
  });

  it('a device that still holds a code ignores a note, and erases it', async () => {
    stubRoutes({ [me]: [ME] });
    leaveStartOver(SLUG, LINK_CODE, 'wave-1');
    const app = await joined();
    expect(app.code).toBe(CODE);
    expect(app.linkCode).toBe('');
    expect(sessionStorage.getItem(START_OVER)).toBeNull();
  });
});

describe('the note itself', () => {
  it('is believed only when it is what the delete writes, for this workshop; anything else is none, and is erased too', () => {
    leaveStartOver(SLUG, CODE, 'wave-1');
    expect(takeStartOver(SLUG)).toEqual({ code: CODE, wave: 'wave-1' });
    expect(takeStartOver(SLUG)).toBeNull();
    const refused: [string, string][] = [
      [
        'another workshop',
        JSON.stringify({ slug: 'another-workshop', code: CODE, wave: 'wave-1' }),
      ],
      [
        'a code that is not 16 digits',
        JSON.stringify({ slug: SLUG, code: '1234', wave: 'wave-1' }),
      ],
      ['no wave', JSON.stringify({ slug: SLUG, code: CODE })],
      ['a wave that is not a name', JSON.stringify({ slug: SLUG, code: CODE, wave: '../x' })],
      ['not an object', JSON.stringify('wave-1')],
      ['not JSON', '{'],
    ];
    for (const [what, text] of refused) {
      sessionStorage.setItem(START_OVER, text);
      expect(takeStartOver(SLUG), what).toBeNull();
      expect(sessionStorage.getItem(START_OVER), what).toBeNull();
    }
  });

  it('is not written without a wave, or with a code that is not a code', () => {
    leaveStartOver(SLUG, CODE, undefined);
    leaveStartOver(SLUG, '', 'wave-1');
    expect(sessionStorage.getItem(START_OVER)).toBeNull();
  });

  it('where the browser refuses session storage, leaving and taking do nothing and do not throw', () => {
    const refuse = () => {
      throw new DOMException('refused', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(refuse);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(refuse);
    expect(() => leaveStartOver(SLUG, CODE, 'wave-1')).not.toThrow();
    expect(takeStartOver(SLUG)).toBeNull();
    vi.restoreAllMocks();
  });
});

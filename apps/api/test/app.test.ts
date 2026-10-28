import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { deckSchema, generateCode, SYNC_MAX_EVENTS, workshopConfigSchema } from '@wb/contracts';
import { connect, ensureWave, setWorkshopStatus, syncWorkshop, type Db } from '@wb/db';
import { createApp, type App } from '../src/app.ts';

/**
 * The API is exercised through app.request(), the same entry point the Netlify Function calls,
 * against a real in-memory Postgres. No network, no mocks.
 */

const folder = new URL('../../../workshops/rural-manufacturing/', import.meta.url);
const workshopConfig = workshopConfigSchema.parse(
  JSON.parse(readFileSync(new URL('workshop.json', folder), 'utf8')),
);
const deck = deckSchema.parse(JSON.parse(readFileSync(new URL('deck.json', folder), 'utf8')));

// 32 zero bytes in base64: a fixed test pepper. Never used anywhere real.
const TEST_PEPPER = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
const DAY = '2026-11-20';
const now = () => new Date(`${DAY}T12:00:00Z`);

let db: Db;
let app: App;
const slug = 'rural-manufacturing';

beforeAll(async () => {
  db = await connect('pglite://memory');
  const { id } = await syncWorkshop(db, workshopConfig, deck);
  await setWorkshopStatus(db, slug, 'open');
  await ensureWave(db, id, 'wave-1', 'first');
  const closed = await syncWorkshop(
    db,
    { ...workshopConfig, slug: 'closed-one', closesDay: '2026-11-01', deleteDay: '2027-01-01' },
    deck,
  );
  await setWorkshopStatus(db, 'closed-one', 'open');
  await ensureWave(db, closed.id, 'wave-1', 'first');
  app = createApp({ db, pepper: TEST_PEPPER, version: 'test', now });
});

const json = (body: unknown, headers: Record<string, string> = {}) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body),
});
const auth = (code: string) => ({ authorization: `Code ${code}` });
const session = (sessionNo = 1) => ({
  id: crypto.randomUUID(),
  sessionNo,
  startedDay: DAY,
  deckVersion: '0.1',
  seed: '0123456789abcdef',
});
const answered = (sessionId: string, seq = 0) => ({
  id: crypto.randomUUID(),
  sessionId,
  cardId: 'tuesday-night',
  seq,
  kind: 'answered',
  body: 'v1.' + 'A'.repeat(64),
  createdDay: DAY,
  deckVersion: '0.1',
});

async function joined(): Promise<string> {
  const code = generateCode();
  const res = await app.request(`/api/${slug}/join`, json({ code, wave: 'wave-1' }));
  expect(res.status).toBe(200);
  return code;
}

describe('health', () => {
  it('reports ok, the version, the database, and workshops by slug and status only', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      version: 'test',
      dbReachable: true,
      lastBackupAt: null,
    });
    expect(body.workshops).toEqual([
      { slug: 'closed-one', status: 'open' },
      { slug, status: 'open' },
    ]);
    expect(JSON.stringify(body)).not.toContain('participants');
  });
});

describe('workshop scoping and lifecycle', () => {
  it('an unknown workshop is 404 on every route', async () => {
    for (const path of ['/api/nope/join', '/api/nope/me', '/api/Nope/waves/wave-1/opened']) {
      const res = await app.request(path, { method: path.endsWith('/me') ? 'GET' : 'POST' });
      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe('WORKSHOP_UNKNOWN');
    }
  });

  it('a workshop past its close day refuses joins and opens with WORKSHOP_CLOSED', async () => {
    const res = await app.request(
      '/api/closed-one/join',
      json({ code: generateCode(), wave: 'wave-1' }),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('WORKSHOP_CLOSED');
    const opened = await app.request('/api/closed-one/waves/wave-1/opened', { method: 'POST' });
    expect((await opened.json()).error).toBe('WORKSHOP_CLOSED');
  });
});

describe('wave link opened', () => {
  it('counts an open and refuses an unknown wave', async () => {
    expect((await app.request(`/api/${slug}/waves/wave-1/opened`, { method: 'POST' })).status).toBe(
      200,
    );
    const res = await app.request(`/api/${slug}/waves/wave-7/opened`, { method: 'POST' });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('JOIN_WAVE_UNKNOWN');
  });
});

describe('join', () => {
  it('creates a participant through a wave and returns the summary', async () => {
    const res = await app.request(
      `/api/${slug}/join`,
      json({ code: generateCode(), wave: 'wave-1' }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      participant: { createdDay: DAY, invitesLeft: 3, wave: 'wave-1', sessionsCount: 0 },
    });
  });

  it('refuses a body with neither wave nor invite, an extra field, and a non-JSON body', async () => {
    for (const body of [
      { code: generateCode() },
      { code: generateCode(), wave: 'wave-1', email: 'x@y.z' },
    ]) {
      const res = await app.request(`/api/${slug}/join`, json(body));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('REQUEST_INVALID');
    }
    const res = await app.request(`/api/${slug}/join`, {
      method: 'POST',
      body: 'not json',
      headers: { 'content-type': 'application/json' },
    });
    expect((await res.json()).error).toBe('REQUEST_INVALID');
  });

  it('the same code twice is JOIN_CODE_TAKEN', async () => {
    const code = await joined();
    const res = await app.request(`/api/${slug}/join`, json({ code, wave: 'wave-1' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('JOIN_CODE_TAKEN');
  });

  it('refuses a body over the byte cap before parsing it', async () => {
    const res = await app.request(`/api/${slug}/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': '2000000' },
      body: '{}',
    });
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe('REQUEST_TOO_LARGE');
  });
});

describe('authentication', () => {
  it('no header, a malformed header, and an unknown code are all 401 with no data', async () => {
    const none = await app.request(`/api/${slug}/me`);
    expect(none.status).toBe(401);
    expect((await none.json()).error).toBe('AUTH_CODE_MISSING');
    const malformed = await app.request(`/api/${slug}/me`, {
      headers: { authorization: 'Bearer 1234567890123456' },
    });
    expect((await malformed.json()).error).toBe('AUTH_CODE_MISSING');
    const unknown = await app.request(`/api/${slug}/me`, { headers: auth('1234 5678 9012 3456') });
    expect(unknown.status).toBe(401);
    expect(await unknown.json()).toEqual({
      error: 'AUTH_CODE_UNKNOWN',
      message: expect.any(String),
    });
  });

  it('a code from one workshop is unknown in another', async () => {
    const code = await joined();
    const res = await app.request('/api/closed-one/me', { headers: auth(code) });
    expect((await res.json()).error).toBe('AUTH_CODE_UNKNOWN');
  });
});

describe('sync and me', () => {
  it('stores a batch, reports it accepted, and shows it back under me', async () => {
    const code = await joined();
    const s = session();
    const e = answered(s.id);
    const res = await app.request(
      `/api/${slug}/sync`,
      json({ sessions: [s], events: [e] }, auth(code)),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ acceptedSessionIds: [s.id], acceptedEventIds: [e.id] });

    const me = await app.request(`/api/${slug}/me`, { headers: auth(code) });
    const body = await me.json();
    expect(body.workshop).toEqual({
      slug,
      name: workshopConfig.name,
      closesDay: workshopConfig.closesDay,
      deleteDay: workshopConfig.deleteDay,
    });
    expect(body.participant.sessionsCount).toBe(1);
    expect(body.sessions).toEqual([s]);
    expect(body.events).toEqual([e]);
  });

  it('an invalid batch is SYNC_PAYLOAD_INVALID and an oversized one is SYNC_BATCH_TOO_LARGE', async () => {
    const code = await joined();
    const s = session();
    const bad = await app.request(
      `/api/${slug}/sync`,
      json({ sessions: [s], events: [{ ...answered(s.id), ip: '1.2.3.4' }] }, auth(code)),
    );
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe('SYNC_PAYLOAD_INVALID');
    const big = await app.request(
      `/api/${slug}/sync`,
      json(
        {
          sessions: [s],
          events: Array.from({ length: SYNC_MAX_EVENTS + 1 }, (_, i) => answered(s.id, i)),
        },
        auth(code),
      ),
    );
    expect(big.status).toBe(413);
    expect((await big.json()).error).toBe('SYNC_BATCH_TOO_LARGE');
  });
});

describe('invites', () => {
  it('gives three single-use invites, then INVITES_EXHAUSTED; an invite joins a new participant', async () => {
    const code = await joined();
    const tokens: string[] = [];
    for (let i = 3; i >= 1; i--) {
      const res = await app.request(`/api/${slug}/invites`, {
        method: 'POST',
        headers: auth(code),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.invitesLeft).toBe(i - 1);
      tokens.push(body.tokens[0]);
    }
    const spent = await app.request(`/api/${slug}/invites`, {
      method: 'POST',
      headers: auth(code),
    });
    expect((await spent.json()).error).toBe('INVITES_EXHAUSTED');

    const guest = await app.request(
      `/api/${slug}/join`,
      json({ code: generateCode(), invite: tokens[0] }),
    );
    expect(guest.status).toBe(200);
    expect((await guest.json()).participant.wave).toBeNull();
    const again = await app.request(
      `/api/${slug}/join`,
      json({ code: generateCode(), invite: tokens[0] }),
    );
    expect((await again.json()).error).toBe('JOIN_INVITE_USED');
  });
});

describe('delete me', () => {
  it('removes everything, after which the code is unknown', async () => {
    const code = await joined();
    const s = session();
    await app.request(
      `/api/${slug}/sync`,
      json({ sessions: [s], events: [answered(s.id)] }, auth(code)),
    );
    const res = await app.request(`/api/${slug}/me`, { method: 'DELETE', headers: auth(code) });
    expect(res.status).toBe(200);
    const after = await app.request(`/api/${slug}/me`, { headers: auth(code) });
    expect((await after.json()).error).toBe('AUTH_CODE_UNKNOWN');
  });
});

describe('rate limits without addresses', () => {
  it('joins on one workshop are budgeted per minute', async () => {
    const budget = await connect('pglite://memory');
    const { id } = await syncWorkshop(budget, workshopConfig, deck);
    await setWorkshopStatus(budget, slug, 'open');
    await ensureWave(budget, id, 'wave-1', 'first');
    const limitedApp = createApp({ db: budget, pepper: TEST_PEPPER, version: 'test', now });
    let last = 200;
    for (let i = 0; i < 31 && last === 200; i++) {
      last = (
        await limitedApp.request(
          `/api/${slug}/join`,
          json({ code: generateCode(), wave: 'wave-1' }),
        )
      ).status;
    }
    expect(last).toBe(429);
  });
});

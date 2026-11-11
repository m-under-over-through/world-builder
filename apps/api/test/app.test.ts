import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ERROR_CODES,
  errorResponseSchema,
  generateCode,
  inviteTokenSchema,
  MAX_REQUEST_BYTES,
  ROUTES,
  SYNC_MAX_EVENTS,
} from '@wb/contracts';
import type { Db } from '@wb/db';
import { createApp, type App } from '../src/app.ts';
import { codeHash } from '../src/auth.ts';
import {
  answered,
  auth,
  freshApp,
  joined as joinedOn,
  json,
  seedWorkshop,
  session,
  slug,
  TEST_PEPPER,
  testClock,
  workshopConfig,
  type TestClock,
} from './helpers.ts';

/**
 * The API is exercised through app.request(), the same entry point the Netlify Function calls,
 * against a real in-memory Postgres (helpers.ts). One database for this file, with the real
 * workshop and three more: one past its close day, one before its open day, one with a cap of one.
 */

let app: App;
let clock: TestClock;
/** Every line the app logged; a test empties it, acts, and reads what was written. */
let logged: string[];
const DAY = '2026-11-20';

beforeAll(async () => {
  const t = await freshApp();
  app = t.app;
  clock = t.clock;
  await seedWorkshop(t.db, {
    slug: 'closed-one',
    closesDay: '2026-11-01',
    deleteDay: '2027-01-01',
  });
  await seedWorkshop(t.db, {
    slug: 'not-yet',
    opensDay: '2026-12-01',
    closesDay: '2026-12-20',
    deleteDay: '2027-02-01',
  });
  await seedWorkshop(t.db, { slug: 'tiny-cap', cap: 1 });
  logged = t.lines;
});

const joined = () => joinedOn(app);

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
      { slug: 'not-yet', status: 'open' },
      { slug, status: 'open' },
      { slug: 'tiny-cap', status: 'open' },
    ]);
    expect(JSON.stringify(body)).not.toContain('participants');
    // Exactly these keys, and per workshop exactly its slug and status: nothing names a secret,
    // a variable, the database's host, or a count of anyone in a workshop (security pass).
    expect(Object.keys(body).sort()).toEqual(
      ['dbReachable', 'eventsToday', 'lastBackupAt', 'ok', 'version', 'workshops'].sort(),
    );
    for (const w of body.workshops) expect(Object.keys(w).sort()).toEqual(['slug', 'status']);
  });
});

describe('the route table', () => {
  const filled = (path: string) => path.replace(':slug', slug).replace(':wave', 'wave-1');

  it('serves every entry of ROUTES: none answers 404', async () => {
    for (const route of Object.values(ROUTES)) {
      const res = await app.request(filled(route.path), { method: route.method });
      expect(res.status, `${route.method} ${route.path}`).not.toBe(404);
      const body = await res.json();
      expect(body.error, `${route.method} ${route.path}`).not.toBe('WORKSHOP_UNKNOWN');
    }
  });

  it('serves nothing else: a wrong method or an unlisted path is 404 with a contract body', async () => {
    const unlisted: Array<[string, string]> = [
      ['GET', `/api/${slug}/join`],
      ['GET', `/api/${slug}/sync`],
      ['POST', `/api/${slug}/me`],
      ['GET', `/api/${slug}/waves/wave-1/opened`],
      ['GET', `/api/${slug}/waves/wave-1`],
      ['GET', `/api/${slug}/participants`],
      ['GET', `/api/${slug}`],
      ['GET', `/api/${slug}/`],
      ['POST', '/api/health'],
      ['GET', '/api/health/more'],
      ['GET', '/api'],
      ['GET', '/'],
    ];
    for (const [method, path] of unlisted) {
      const res = await app.request(path, { method });
      expect(res.status, `${method} ${path}`).toBe(404);
      const body = errorResponseSchema.parse(await res.json());
      expect(body.error, `${method} ${path}`).toBe('WORKSHOP_UNKNOWN');
    }
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

  it('a workshop before its open day refuses joins the same way', async () => {
    const res = await app.request(
      '/api/not-yet/join',
      json({ code: generateCode(), wave: 'wave-1' }),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('WORKSHOP_CLOSED');
  });

  it('a participant of a workshop past its close day gets WORKSHOP_CLOSED on sync, me, invites and delete, and the rows stay', async () => {
    const code = await joined();
    const s = session();
    await app.request(
      `/api/${slug}/sync`,
      json({ sessions: [s], events: [answered(s.id)] }, auth(code)),
    );
    clock.setDay('2026-12-07'); // the day after closesDay
    try {
      const attempts = [
        app.request(
          `/api/${slug}/sync`,
          json({ sessions: [], events: [answered(s.id, 1)] }, auth(code)),
        ),
        app.request(`/api/${slug}/me`, { headers: auth(code) }),
        app.request(`/api/${slug}/invites`, { method: 'POST', headers: auth(code) }),
        app.request(`/api/${slug}/me`, { method: 'DELETE', headers: auth(code) }),
      ];
      for (const res of await Promise.all(attempts)) {
        expect(res.status).toBe(403);
        expect(errorResponseSchema.parse(await res.json()).error).toBe('WORKSHOP_CLOSED');
      }
    } finally {
      clock.setDay(DAY);
    }
    const me = await app.request(`/api/${slug}/me`, { headers: auth(code) });
    expect(me.status).toBe(200);
    const body = await me.json();
    expect(body.events).toHaveLength(1);
    expect(body.participant.invitesLeft).toBe(3);
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

  it('a refused join writes one log line with the route, the code and the field paths, and nothing from the body', async () => {
    logged.length = 0;
    const code = generateCode();
    const res = await app.request(
      `/api/${slug}/join`,
      json({ code, wave: 'Wave One', emailAddress: 'someone@example.org' }),
    );
    expect(res.status).toBe(400);
    expect(logged).toEqual([
      'REQUEST_INVALID POST /api/:slug/join: wave (invalid_format), (root) (unrecognized_keys)',
    ]);
    const line = logged[0]!;
    for (const secret of [code, 'Wave One', 'emailAddress', 'someone', 'example.org', slug]) {
      expect(line).not.toContain(secret);
    }
    expect(line).not.toContain(await codeHash(TEST_PEPPER, slug, code));
  });

  it('a body that is not JSON writes one log line that says so and quotes nothing', async () => {
    logged.length = 0;
    await app.request(`/api/${slug}/join`, {
      method: 'POST',
      body: 'code=1234567890123456',
      headers: { 'content-type': 'application/json' },
    });
    expect(logged).toEqual(['REQUEST_INVALID POST /api/:slug/join: body is not JSON']);
  });

  it('the same code twice is JOIN_CODE_TAKEN', async () => {
    const code = await joined();
    const res = await app.request(`/api/${slug}/join`, json({ code, wave: 'wave-1' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('JOIN_CODE_TAKEN');
  });

  it('a wave the workshop does not have is JOIN_WAVE_UNKNOWN', async () => {
    const res = await app.request(
      `/api/${slug}/join`,
      json({ code: generateCode(), wave: 'wave-9' }),
    );
    expect(res.status).toBe(404);
    expect(errorResponseSchema.parse(await res.json()).error).toBe('JOIN_WAVE_UNKNOWN');
  });

  it('a wave at its cap is JOIN_WAVE_FULL, and the code that was refused can still join elsewhere', async () => {
    expect((await joinedOn(app, 'tiny-cap')).length).toBe(16);
    const code = generateCode();
    const res = await app.request('/api/tiny-cap/join', json({ code, wave: 'wave-1' }));
    expect(res.status).toBe(403);
    expect(errorResponseSchema.parse(await res.json()).error).toBe('JOIN_WAVE_FULL');
    expect((await app.request(`/api/${slug}/join`, json({ code, wave: 'wave-1' }))).status).toBe(
      200,
    );
  });

  it('an invite token nobody issued is JOIN_INVITE_INVALID', async () => {
    const token = 'A'.repeat(22);
    expect(inviteTokenSchema.safeParse(token).success).toBe(true);
    const res = await app.request(
      `/api/${slug}/join`,
      json({ code: generateCode(), invite: token }),
    );
    expect(res.status).toBe(404);
    expect(errorResponseSchema.parse(await res.json()).error).toBe('JOIN_INVITE_INVALID');
  });

  it('refuses a Content-Length over the byte cap before reading the body', async () => {
    const res = await app.request(`/api/${slug}/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': '2000000' },
      body: '{}',
    });
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe('REQUEST_TOO_LARGE');
  });

  it('refuses a body of multi-byte characters just over the cap, measured in bytes', async () => {
    // Each é is one UTF-16 unit and two bytes. The string is half the cap in length and two
    // bytes over it on the wire; the skeleton's text.length check would have let it through.
    const body = `{"code":"${'é'.repeat((MAX_REQUEST_BYTES - 11) / 2 + 1)}"}`;
    expect(body.length).toBeLessThan(MAX_REQUEST_BYTES);
    expect(new TextEncoder().encode(body).byteLength).toBe(MAX_REQUEST_BYTES + 1);
    const res = await app.request(`/api/${slug}/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe('REQUEST_TOO_LARGE');
  });

  it('reads a body of exactly the cap and leaves it to the contract', async () => {
    const body = `{"code":"${'a'.repeat(MAX_REQUEST_BYTES - 11)}"}`;
    expect(new TextEncoder().encode(body).byteLength).toBe(MAX_REQUEST_BYTES);
    const res = await app.request(`/api/${slug}/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('REQUEST_INVALID');
  });

  it('a body larger than its declared Content-Length is still refused at the cap', async () => {
    const res = await app.request(`/api/${slug}/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': '2' },
      body: '{"code":"' + 'a'.repeat(MAX_REQUEST_BYTES) + '"}',
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

  it('the same batch twice is accepted twice with the same ids and stored once', async () => {
    const code = await joined();
    const s = session();
    const batch = { sessions: [s], events: [answered(s.id, 0), answered(s.id, 1)] };
    const first = await app.request(`/api/${slug}/sync`, json(batch, auth(code)));
    const second = await app.request(`/api/${slug}/sync`, json(batch, auth(code)));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const a = await first.json();
    const b = await second.json();
    expect(a.acceptedSessionIds).toEqual([s.id]);
    expect([...a.acceptedEventIds].sort()).toEqual(batch.events.map((e) => e.id).sort());
    expect(b).toEqual(a);
    const me = await (await app.request(`/api/${slug}/me`, { headers: auth(code) })).json();
    expect(me.sessions).toHaveLength(1);
    expect(me.events).toHaveLength(2);
    expect(me.participant.sessionsCount).toBe(1);
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

  it('a sync body over the byte cap is REQUEST_TOO_LARGE, and nothing of it is stored', async () => {
    const code = await joined();
    const s = session();
    const padding = { ...answered(s.id, 0), body: 'v1.' + 'A'.repeat(64) };
    const text = JSON.stringify({ sessions: [s], events: [padding] });
    const body = text.slice(0, -2) + `,"note":"${'é'.repeat(MAX_REQUEST_BYTES / 2)}"}`;
    expect(new TextEncoder().encode(body).byteLength).toBeGreaterThan(MAX_REQUEST_BYTES);
    const res = await app.request(`/api/${slug}/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth(code) },
      body,
    });
    expect(res.status).toBe(413);
    expect(errorResponseSchema.parse(await res.json()).error).toBe('REQUEST_TOO_LARGE');
    const me = await (await app.request(`/api/${slug}/me`, { headers: auth(code) })).json();
    expect(me.sessions).toEqual([]);
  });

  it('a refused batch writes one log line naming the field, never the event, the code or its hash', async () => {
    const code = await joined();
    const s = session();
    const e = { ...answered(s.id, 2), body: 'not an envelope', ip: '1.2.3.4' };
    logged.length = 0;
    const res = await app.request(
      `/api/${slug}/sync`,
      json({ sessions: [s], events: [answered(s.id, 0), answered(s.id, 1), e] }, auth(code)),
    );
    expect(res.status).toBe(400);
    expect(logged).toEqual([
      'SYNC_PAYLOAD_INVALID POST /api/:slug/sync: events.2.body (too_small), events.2.body (invalid_format), events.2 (unrecognized_keys)',
    ]);
    const line = logged[0]!;
    for (const secret of [
      code,
      s.id,
      s.seed,
      e.id,
      e.body,
      'ip',
      '1.2.3.4',
      'tuesday-night',
      slug,
    ]) {
      expect(line).not.toContain(secret);
    }
    expect(line).not.toContain(await codeHash(TEST_PEPPER, slug, code));
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

describe('when the database fails mid-request', () => {
  it('answers SERVER_ERROR with an errorId that matches one log line, and the line carries neither the code nor its hash', async () => {
    const t = await freshApp();
    const code = await joinedOn(t.app);
    // Every request touches rate_buckets first; without the table the limiter's upsert fails with
    // a real Drizzle error whose parameters include the bucket key, which is built from the hash.
    await t.db.execute('drop table rate_buckets');
    t.lines.length = 0;
    const res = await t.app.request(`/api/${slug}/me`, { headers: auth(code) });
    expect(res.status).toBe(500);
    const body = errorResponseSchema.parse(await res.json());
    expect(body.error).toBe('SERVER_ERROR');
    expect(body.errorId).toMatch(/^[0-9a-f]{8}$/);
    expect(t.lines).toHaveLength(1);
    const line = t.lines[0]!;
    expect(line.startsWith(`SERVER_ERROR ${body.errorId} DrizzleQueryError: Failed query:`)).toBe(
      true,
    );
    expect(line).toContain('rate_buckets'); // the SQL, with its placeholders, stays
    expect(line).toMatch(/\n\s+at /); // and the stack frames
    expect(line).not.toContain('params');
    expect(line).not.toContain(code);
    expect(line).not.toContain(await codeHash(TEST_PEPPER, slug, code));
    expect(JSON.stringify(body)).not.toContain('rate_buckets'); // the response says nothing of the inside
  });
});

describe('health when the database is unreachable', () => {
  it('answers 503 with ok false, not a server error, even though the limiter needs the database', async () => {
    const unreachable = new Proxy(
      {},
      {
        get: () => () => {
          throw new Error('database unreachable');
        },
      },
    ) as unknown as Db;
    const downApp = createApp({
      db: unreachable,
      pepper: TEST_PEPPER,
      version: 'test',
      now: testClock().now,
    });
    const res = await downApp.request('/api/health');
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, dbReachable: false, version: 'test' });
  });
});

describe('the error-code table', () => {
  it('every server error code in the contract is asserted by an API test over HTTP', () => {
    const sources = ['app.test.ts', 'limits.test.ts', 'bundle.test.ts']
      .map((f) => readFileSync(new URL(f, import.meta.url), 'utf8'))
      .join('\n');
    const untested = Object.keys(ERROR_CODES).filter((code) => !sources.includes(`'${code}'`));
    expect(untested).toEqual([]);
  });
});

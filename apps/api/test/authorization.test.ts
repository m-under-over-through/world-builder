import { beforeAll, describe, expect, it } from 'vitest';
import { errorResponseSchema, generateCode } from '@wb/contracts';
import { answered, auth, freshApp, joined, json, seedWorkshop, session, slug } from './helpers.ts';
import type { App } from '../src/app.ts';

/**
 * The authorization boundary between participants, over HTTP (architecture plan, section 12: "a
 * manual authorization test, code A cannot read, write or delete participant B; invite replay"
 * tests). A is always the one trying; B is the one who must be untouched. The response never says
 * why something was not accepted, because the response goes to A.
 */

let app: App;

beforeAll(async () => {
  const t = await freshApp();
  app = t.app;
  await seedWorkshop(t.db, { slug: 'other-one' });
});

const me = async (code: string, workshop = slug) => {
  const res = await app.request(`/api/${workshop}/me`, { headers: auth(code) });
  expect(res.status).toBe(200);
  return res.json();
};

/** B joins and syncs one session with one answered event; returns what B owns. */
async function participantWithData() {
  const code = await joined(app);
  const s = session();
  const e = answered(s.id);
  const res = await app.request(
    `/api/${slug}/sync`,
    json({ sessions: [s], events: [e] }, auth(code)),
  );
  expect(await res.json()).toEqual({ acceptedSessionIds: [s.id], acceptedEventIds: [e.id] });
  return { code, session: s, event: e };
}

describe('code A against participant B', () => {
  it("cannot write into B's session through /sync: nothing is accepted and B's rows are unchanged", async () => {
    const b = await participantWithData();
    const a = await joined(app);
    const intruding = answered(b.session.id, 1);
    const res = await app.request(
      `/api/${slug}/sync`,
      json({ sessions: [b.session], events: [intruding] }, auth(a)),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ acceptedSessionIds: [], acceptedEventIds: [] });
    const bRows = await me(b.code);
    expect(bRows.sessions).toEqual([b.session]);
    expect(bRows.events).toEqual([b.event]);
    const aRows = await me(a);
    expect(aRows.sessions).toEqual([]);
    expect(aRows.events).toEqual([]);
  });

  it("cannot read B through /me: A sees only A's own rows", async () => {
    const b = await participantWithData();
    const a = await joined(app);
    const s = session();
    await app.request(
      `/api/${slug}/sync`,
      json({ sessions: [s], events: [answered(s.id)] }, auth(a)),
    );
    const aRows = await me(a);
    expect(aRows.sessions).toEqual([s]);
    expect(aRows.events).toHaveLength(1);
    expect(JSON.stringify(aRows)).not.toContain(b.session.id);
    expect(JSON.stringify(aRows)).not.toContain(b.event.id);
    expect(aRows.participant.sessionsCount).toBe(1);
  });

  it("cannot spend B's invites: A with none left is INVITES_EXHAUSTED while B still has three", async () => {
    const a = await joined(app);
    const b = await joined(app);
    for (let i = 0; i < 3; i++) {
      const res = await app.request(`/api/${slug}/invites`, { method: 'POST', headers: auth(a) });
      expect(res.status).toBe(200);
    }
    const spent = await app.request(`/api/${slug}/invites`, { method: 'POST', headers: auth(a) });
    expect(spent.status).toBe(403);
    expect(errorResponseSchema.parse(await spent.json()).error).toBe('INVITES_EXHAUSTED');
    expect((await me(b)).participant.invitesLeft).toBe(3);
    // B issuing one changes nothing for A.
    const bInvite = await app.request(`/api/${slug}/invites`, { method: 'POST', headers: auth(b) });
    expect((await bInvite.json()).invitesLeft).toBe(2);
    expect((await me(a)).participant.invitesLeft).toBe(0);
  });

  it("cannot delete B: A's delete removes A alone and B continues", async () => {
    const b = await participantWithData();
    const a = await participantWithData();
    const res = await app.request(`/api/${slug}/me`, { method: 'DELETE', headers: auth(a.code) });
    expect(res.status).toBe(200);
    const gone = await app.request(`/api/${slug}/me`, { headers: auth(a.code) });
    expect((await gone.json()).error).toBe('AUTH_CODE_UNKNOWN');
    const bRows = await me(b.code);
    expect(bRows.sessions).toEqual([b.session]);
    expect(bRows.events).toEqual([b.event]);
  });
});

describe('invites under replay', () => {
  it('an invite spent twice at once is spent once: one join, one JOIN_INVITE_USED, one invite paid', async () => {
    const issuer = await joined(app);
    const issued = await app.request(`/api/${slug}/invites`, {
      method: 'POST',
      headers: auth(issuer),
    });
    const token: string = (await issued.json()).tokens[0];
    const [first, second] = await Promise.all([
      app.request(`/api/${slug}/join`, json({ code: generateCode(), invite: token })),
      app.request(`/api/${slug}/join`, json({ code: generateCode(), invite: token })),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 403]);
    const refused = first.status === 403 ? first : second;
    expect(errorResponseSchema.parse(await refused.json()).error).toBe('JOIN_INVITE_USED');
    expect((await me(issuer)).participant.invitesLeft).toBe(2);
  });

  it('a third try after the two is still JOIN_INVITE_USED, and the token tells nothing of the issuer', async () => {
    const issuer = await joined(app);
    const issued = await app.request(`/api/${slug}/invites`, {
      method: 'POST',
      headers: auth(issuer),
    });
    const token: string = (await issued.json()).tokens[0];
    const guest = generateCode();
    expect(
      (await app.request(`/api/${slug}/join`, json({ code: guest, invite: token }))).status,
    ).toBe(200);
    const again = await app.request(
      `/api/${slug}/join`,
      json({ code: generateCode(), invite: token }),
    );
    expect(again.status).toBe(403);
    expect(errorResponseSchema.parse(await again.json()).error).toBe('JOIN_INVITE_USED');
    const guestRows = await me(guest);
    expect(guestRows.participant.wave).toBeNull();
    expect(JSON.stringify(guestRows)).not.toContain(issuer);
  });
});

describe('a code from one workshop in another', () => {
  it('is AUTH_CODE_UNKNOWN on me, sync, invites and delete, and leaves the other workshop untouched', async () => {
    const a = await participantWithData();
    const attempts = [
      app.request('/api/other-one/me', { headers: auth(a.code) }),
      app.request(
        '/api/other-one/sync',
        json({ sessions: [a.session], events: [answered(a.session.id, 1)] }, auth(a.code)),
      ),
      app.request('/api/other-one/invites', { method: 'POST', headers: auth(a.code) }),
      app.request('/api/other-one/me', { method: 'DELETE', headers: auth(a.code) }),
    ];
    for (const res of await Promise.all(attempts)) {
      expect(res.status).toBe(401);
      expect(errorResponseSchema.parse(await res.json()).error).toBe('AUTH_CODE_UNKNOWN');
    }
    const home = await me(a.code);
    expect(home.sessions).toEqual([a.session]);
    expect(home.events).toEqual([a.event]);
    expect(home.participant.invitesLeft).toBe(3);
  });

  it('the same code joined in two workshops is two participants with separate rows', async () => {
    const code = generateCode();
    for (const workshop of [slug, 'other-one']) {
      const res = await app.request(`/api/${workshop}/join`, json({ code, wave: 'wave-1' }));
      expect(res.status).toBe(200);
    }
    const s = session();
    await app.request(
      `/api/${slug}/sync`,
      json({ sessions: [s], events: [answered(s.id)] }, auth(code)),
    );
    expect((await me(code)).sessions).toEqual([s]);
    expect((await me(code, 'other-one')).sessions).toEqual([]);
    await app.request('/api/other-one/me', { method: 'DELETE', headers: auth(code) });
    expect((await me(code)).sessions).toEqual([s]);
  });
});

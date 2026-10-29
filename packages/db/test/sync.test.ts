import { describe, expect, it } from 'vitest';
import {
  deleteParticipant,
  findParticipant,
  findWorkshop,
  joinViaWave,
  participantData,
  syncBatch,
} from '../src/index.ts';
import { DAY, freshDb, hash, seedWorkshop, uuid } from './helpers.ts';

const session = () => ({
  id: uuid(),
  sessionNo: 1,
  startedDay: DAY,
  deckVersion: '0.1',
  seed: '0123456789abcdef',
});
const answered = (sessionId: string, seq: number) => ({
  id: uuid(),
  sessionId,
  cardId: 'tuesday-night',
  seq,
  kind: 'answered' as const,
  body: 'v1.' + 'A'.repeat(64),
  createdDay: DAY,
  deckVersion: '0.1',
});

async function participantIn(db: Awaited<ReturnType<typeof freshDb>>) {
  await seedWorkshop(db);
  const workshop = (await findWorkshop(db, 'rural-manufacturing'))!;
  const joined = await joinViaWave(db, {
    workshop,
    wave: 'wave-1',
    codeHash: hash('p'),
    today: DAY,
  });
  if (!joined.ok) throw new Error('setup');
  return { workshop, participant: joined.participant };
}

describe('sync is append-only and idempotent', () => {
  it('the same batch sent twice stores each row once and reports every id accepted both times', async () => {
    const db = await freshDb();
    const { participant } = await participantIn(db);
    const s = session();
    const dismissed = { ...answered(s.id, 1), kind: 'dismissed' as const };
    delete (dismissed as { body?: string }).body;
    const batch = { sessions: [s], events: [answered(s.id, 0), dismissed] };

    const first = await syncBatch(db, participant.id, batch);
    const second = await syncBatch(db, participant.id, batch);
    expect(first).toEqual(second);
    expect(first.acceptedSessionIds).toEqual([s.id]);
    expect([...first.acceptedEventIds].sort()).toEqual(batch.events.map((e) => e.id).sort());

    const data = await participantData(db, participant.id);
    expect(data.sessions).toEqual([s]);
    expect(data.events).toHaveLength(2);
    expect(data.events[0]).toMatchObject({ kind: 'answered', body: batch.events[0]!.body });
    expect(data.events[1]).not.toHaveProperty('body');
  });

  it('a re-sent event with changed content does not overwrite the stored one', async () => {
    const db = await freshDb();
    const { participant } = await participantIn(db);
    const s = session();
    const e = answered(s.id, 0);
    await syncBatch(db, participant.id, { sessions: [s], events: [e] });
    await syncBatch(db, participant.id, {
      sessions: [],
      events: [{ ...e, body: 'v1.' + 'B'.repeat(64) }],
    });
    expect((await participantData(db, participant.id)).events[0]!.body).toBe(e.body);
  });

  it('delete me removes the participant, the sessions and the events', async () => {
    const db = await freshDb();
    const { workshop, participant } = await participantIn(db);
    const s = session();
    await syncBatch(db, participant.id, { sessions: [s], events: [answered(s.id, 0)] });
    await deleteParticipant(db, participant.id);
    expect(await findParticipant(db, workshop.id, hash('p'))).toBeUndefined();
    expect(await participantData(db, participant.id)).toEqual({ sessions: [], events: [] });
  });
});

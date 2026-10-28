import { describe, expect, it } from 'vitest';
import {
  findParticipant,
  findWorkshop,
  joinViaWave,
  participantData,
  syncBatch,
} from '../src/index.ts';
import { DAY, freshDb, hash, seedWorkshop, uuid } from './helpers.ts';

describe('everything is scoped to a workshop', () => {
  it('the same code hash in two workshops is two participants, and each workshop sees only its own', async () => {
    const db = await freshDb();
    await seedWorkshop(db, 'alpha');
    await seedWorkshop(db, 'beta');
    const alpha = (await findWorkshop(db, 'alpha'))!;
    const beta = (await findWorkshop(db, 'beta'))!;

    const a = await joinViaWave(db, {
      workshop: alpha,
      wave: 'wave-1',
      codeHash: hash('same'),
      today: DAY,
    });
    const b = await joinViaWave(db, {
      workshop: beta,
      wave: 'wave-1',
      codeHash: hash('same'),
      today: DAY,
    });
    if (!a.ok || !b.ok) throw new Error('setup');
    expect(a.participant.id).not.toBe(b.participant.id);
    expect((await findParticipant(db, alpha.id, hash('same')))?.id).toBe(a.participant.id);
    expect((await findParticipant(db, beta.id, hash('same')))?.id).toBe(b.participant.id);
  });

  it('a session that belongs to another participant is not accepted, nor are its events', async () => {
    const db = await freshDb();
    await seedWorkshop(db);
    const workshop = (await findWorkshop(db, 'rural-manufacturing'))!;
    const one = await joinViaWave(db, {
      workshop,
      wave: 'wave-1',
      codeHash: hash('one'),
      today: DAY,
    });
    const two = await joinViaWave(db, {
      workshop,
      wave: 'wave-1',
      codeHash: hash('two'),
      today: DAY,
    });
    if (!one.ok || !two.ok) throw new Error('setup');

    const session = {
      id: uuid(),
      sessionNo: 1,
      startedDay: DAY,
      deckVersion: '0.1',
      seed: '0123456789abcdef',
    };
    await syncBatch(db, one.participant.id, { sessions: [session], events: [] });

    // Participant two tries to attach an event to participant one's session.
    const foreign = {
      id: uuid(),
      sessionId: session.id,
      cardId: 'cool',
      seq: 0,
      kind: 'shown' as const,
      createdDay: DAY,
      deckVersion: '0.1',
    };
    const result = await syncBatch(db, two.participant.id, {
      sessions: [session],
      events: [foreign],
    });
    expect(result).toEqual({ acceptedSessionIds: [], acceptedEventIds: [] });
    expect((await participantData(db, two.participant.id)).sessions).toEqual([]);
    expect((await participantData(db, one.participant.id)).events).toEqual([]);
  });
});

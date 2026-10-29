import { describe, expect, it } from 'vitest';
import {
  createInvites,
  findWorkshop,
  joinViaInvite,
  joinViaWave,
  participantSummary,
  waveOpened,
} from '../src/index.ts';
import { DAY, freshDb, hash, seedWorkshop } from './helpers.ts';

describe('joining through a wave', () => {
  it('creates the participant, counts the join, and refuses the same code twice', async () => {
    const db = await freshDb();
    await seedWorkshop(db);
    const workshop = (await findWorkshop(db, 'rural-manufacturing'))!;
    const first = await joinViaWave(db, {
      workshop,
      wave: 'wave-1',
      codeHash: hash('a'),
      today: DAY,
    });
    expect(first.ok).toBe(true);
    expect(
      await joinViaWave(db, { workshop, wave: 'wave-1', codeHash: hash('a'), today: DAY }),
    ).toEqual({ ok: false, reason: 'code_taken' });
    if (first.ok) {
      expect(await participantSummary(db, first.participant)).toEqual({
        createdDay: DAY,
        invitesLeft: 3,
        wave: 'wave-1',
        sessionsCount: 0,
      });
    }
  });

  it('refuses an unknown wave and a full wave', async () => {
    const db = await freshDb();
    await seedWorkshop(db, 'rural-manufacturing', { cap: 2 });
    const workshop = (await findWorkshop(db, 'rural-manufacturing'))!;
    expect(workshop.cap).toBe(2);
    expect(
      await joinViaWave(db, { workshop, wave: 'wave-9', codeHash: hash('x'), today: DAY }),
    ).toEqual({ ok: false, reason: 'wave_unknown' });
    expect(
      (await joinViaWave(db, { workshop, wave: 'wave-1', codeHash: hash('1'), today: DAY })).ok,
    ).toBe(true);
    expect(
      (await joinViaWave(db, { workshop, wave: 'wave-1', codeHash: hash('2'), today: DAY })).ok,
    ).toBe(true);
    expect(
      await joinViaWave(db, { workshop, wave: 'wave-1', codeHash: hash('3'), today: DAY }),
    ).toEqual({ ok: false, reason: 'wave_full' });
  });

  it('counts link opens only for waves that exist', async () => {
    const db = await freshDb();
    const workshopId = await seedWorkshop(db);
    expect(await waveOpened(db, workshopId, 'wave-1')).toBe(true);
    expect(await waveOpened(db, workshopId, 'wave-1')).toBe(true);
    expect(await waveOpened(db, workshopId, 'nope')).toBe(false);
  });
});

describe('joining through an invite', () => {
  it('an invite works once, and the new participant does not point back to the issuer', async () => {
    const db = await freshDb();
    await seedWorkshop(db);
    const workshop = (await findWorkshop(db, 'rural-manufacturing'))!;
    const issuer = await joinViaWave(db, {
      workshop,
      wave: 'wave-1',
      codeHash: hash('issuer'),
      today: DAY,
    });
    if (!issuer.ok) throw new Error('setup');
    expect(await createInvites(db, issuer.participant, [hash('t1'), hash('t2')])).toBe(2);
    expect(await createInvites(db, issuer.participant, [hash('t3'), hash('t4')])).toBe(0); // only one left

    const guest = await joinViaInvite(db, {
      workshop,
      tokenHash: hash('t1'),
      codeHash: hash('guest'),
      today: DAY,
    });
    expect(guest.ok).toBe(true);
    if (guest.ok) expect(guest.participant.wave).toBeNull();
    expect(
      await joinViaInvite(db, {
        workshop,
        tokenHash: hash('t1'),
        codeHash: hash('guest2'),
        today: DAY,
      }),
    ).toEqual({ ok: false, reason: 'invite_used' });
    expect(
      await joinViaInvite(db, {
        workshop,
        tokenHash: hash('nope'),
        codeHash: hash('guest3'),
        today: DAY,
      }),
    ).toEqual({ ok: false, reason: 'invite_invalid' });
  });

  it('an invite from another workshop is invalid here', async () => {
    const db = await freshDb();
    await seedWorkshop(db, 'alpha');
    await seedWorkshop(db, 'beta');
    const alpha = (await findWorkshop(db, 'alpha'))!;
    const beta = (await findWorkshop(db, 'beta'))!;
    const issuer = await joinViaWave(db, {
      workshop: alpha,
      wave: 'wave-1',
      codeHash: hash('i'),
      today: DAY,
    });
    if (!issuer.ok) throw new Error('setup');
    await createInvites(db, issuer.participant, [hash('tok')]);
    expect(
      await joinViaInvite(db, {
        workshop: beta,
        tokenHash: hash('tok'),
        codeHash: hash('g'),
        today: DAY,
      }),
    ).toEqual({ ok: false, reason: 'invite_invalid' });
  });
});

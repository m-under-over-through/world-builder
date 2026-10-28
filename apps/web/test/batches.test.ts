import { describe, expect, it } from 'vitest';
import { makeBatches } from '../src/lib/batches.ts';

const session = (n: number) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  sessionNo: n,
  startedDay: '2026-11-16',
  deckVersion: '0.1',
  seed: '0123456789abcdef',
});
const event = (n: number, size = 0) => ({
  id: `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  sessionId: session(1).id,
  cardId: 'cool',
  seq: n,
  kind: 'answered' as const,
  body: 'v1.' + 'A'.repeat(64 + size),
  createdDay: '2026-11-16',
  deckVersion: '0.1',
});

describe('the outbox is split into batches the API accepts', () => {
  it('keeps everything in one batch when it fits', () => {
    const batches = makeBatches([session(1)], [event(1), event(2)]);
    expect(batches).toHaveLength(1);
    expect(batches[0]!.sessions).toHaveLength(1);
    expect(batches[0]!.events).toHaveLength(2);
  });

  it('splits by event count and keeps sessions in the first batch', () => {
    const events = Array.from({ length: 5 }, (_, i) => event(i));
    const batches = makeBatches([session(1)], events, {
      maxSessions: 20,
      maxEvents: 2,
      maxBytes: 1_000_000,
    });
    expect(batches.map((b) => b.events.length)).toEqual([2, 2, 1]);
    expect(batches[0]!.sessions).toHaveLength(1);
    expect(batches[1]!.sessions).toHaveLength(0);
  });

  it('splits by bytes so no batch exceeds the cap', () => {
    const events = Array.from({ length: 4 }, (_, i) => event(i, 400));
    const batches = makeBatches([], events, { maxSessions: 20, maxEvents: 200, maxBytes: 1200 });
    expect(batches.length).toBeGreaterThan(1);
    for (const b of batches) expect(JSON.stringify(b).length).toBeLessThanOrEqual(1200);
    expect(batches.flatMap((b) => b.events)).toHaveLength(4);
  });

  it('returns no batches for an empty outbox', () => {
    expect(makeBatches([], [])).toEqual([]);
  });
});

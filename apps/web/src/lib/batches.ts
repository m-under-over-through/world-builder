import {
  MAX_REQUEST_BYTES,
  SYNC_MAX_EVENTS,
  SYNC_MAX_SESSIONS,
  type Event,
  type Session,
} from '@wb/contracts';

export interface Batch {
  sessions: Session[];
  events: Event[];
}

/**
 * Split the outbox into batches the API accepts: at most SYNC_MAX_SESSIONS sessions and
 * SYNC_MAX_EVENTS events each, and under MAX_REQUEST_BYTES of JSON. Sessions go first, so an
 * event never arrives before the session it belongs to. Pure, so it is tested without a browser.
 */
export function makeBatches(
  sessions: Session[],
  events: Event[],
  limits = {
    maxSessions: SYNC_MAX_SESSIONS,
    maxEvents: SYNC_MAX_EVENTS,
    maxBytes: MAX_REQUEST_BYTES,
  },
): Batch[] {
  const batches: Batch[] = [];
  let current: Batch = { sessions: [], events: [] };
  const size = (b: Batch) => JSON.stringify(b).length;
  const flush = () => {
    if (current.sessions.length || current.events.length) batches.push(current);
    current = { sessions: [], events: [] };
  };
  for (const s of sessions) {
    if (
      current.sessions.length >= limits.maxSessions ||
      size({ ...current, sessions: [...current.sessions, s] }) > limits.maxBytes
    )
      flush();
    current.sessions.push(s);
  }
  for (const e of events) {
    if (
      current.events.length >= limits.maxEvents ||
      size({ ...current, events: [...current.events, e] }) > limits.maxBytes
    )
      flush();
    current.events.push(e);
  }
  flush();
  return batches;
}

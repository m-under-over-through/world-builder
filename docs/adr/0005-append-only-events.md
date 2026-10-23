# 0005. Events are append-only with client-generated ids

Date: 2026-10-23. Status: accepted.

## Context

The device writes first and syncs later, possibly after a long time, possibly twice. Participants may dismiss, defer and revisit cards. The research wants to know not only what was answered but what was avoided.

## Decision

- Everything a participant does is an event: `shown`, `answered`, `dismissed`, `deferred`, `revisited`. Events are never edited or deleted, except by the participant's own "delete me".
- The client generates a UUID for every session and event. The server stores each id at most once (upsert by id). A sync batch can be re-sent any number of times.
- Order within a session is a client-set sequence number, not a timestamp. Time is recorded as a day.

## Consequences

- Sync is trivial and conflict-free. Offline for a week is the same as offline for a second.
- The data is a log, which is what the analysis wants: it can replay a session.
- Storage grows with every dismissal; at this scale that is nothing.

## Alternatives not taken

- Mutable "answer" rows updated in place (needs conflict rules, loses history).
- Server-assigned ids (needs a round trip before the device can store anything).

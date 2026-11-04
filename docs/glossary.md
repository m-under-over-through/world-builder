# Glossary

These are the words. Code, docs, tests and conversations use them exactly. A new word is proposed in a build-log entry before it is used.

- **workshop**: one run of the experience for one group, with its own deck, copy, dates and key. A folder under `workshops/`. Identified by its **slug**.
- **deck**: the cards of a workshop, in `deck.json`, with a **deck version** recorded on every event.
- **card**: one question. Has an id, a text, and belongs to a **set**: **warm-up** or **checkpoint**. May carry an **area**, the theme it probes, shown as the card's label.
- **session**: one round of the cards, as the deck engine plans it: W warm-ups, then C checkpoints. Numbered per participant from 1. Has a **seed** that makes its shuffle reproducible. When one is over the next starts at once (ADR 0017), so one sitting can hold several; the participant is shown no word for it.
- **round**: the word code and docs use for a session as it follows the last one without a pause.
- **participant**: one anonymous code. Not a person: a person with two codes is two participants.
- **code**: the anonymous code, 16 digits. The only identifier. Sent in the `Authorization` header, stored as a **keyed hash**, never in a URL.
- **keyed hash**: a hash computed with a server-side secret (the **pepper**), so a database copy alone cannot be used to look codes up. See `docs/learn/02-codes-hashes-and-peppers.md`.
- **event**: one thing a participant did: `shown`, `answered`, `dismissed`, `deferred`, `revisited`. Append-only, client-generated id, ordered by **seq** within a session.
- **sealed answer** (or **envelope**): an answer encrypted on the device to the workshop's public key, as the string `v1.<base64>`. Only the private key opens it.
- **research key** (or **workshop key**): the key pair of a workshop. The **public key** is in `workshop.json`; the **private key** is in the operator's vault and on paper.
- **fingerprint**: a short name for a public key, printed on the trust page so a reader can compare it with the repository.
- **outbox**: the queue of events on the device waiting to be synced.
- **sync**: posting the outbox to the API. Safe to repeat.
- **wave**: one newsletter send. A **wave link** (`/<slug>/join/<wave>`) accepts joins for a window, up to a **cap**.
- **invite**: a single-use link a participant creates for someone else. The server records that an invite was spent, never who used it.
- **join**: the request that creates a participant for a new code through a wave or an invite.
- **trust page**: the page inside the app that states what is and is not collected and how to check it.
- **about page**: the one page about the app, from the foot of every screen, holding the trust page, the code, the privacy panel, delete-me and the "Remind me" line.
- **privacy panel**: the live view, a section of the about page, showing the code, cookies (0), hosts contacted, what is stored, last sync, version, last error code, and "delete me".
- **diagnostics**: the part of the privacy panel that shows the last sync result, the outbox size and the last error code.
- **error code**: a stable name for one failure path, such as `AUTH_CODE_UNKNOWN`, with an entry in the runbook.
- **runbook**: `docs/runbook.md`. One entry per error code and per service: meaning, likely cause, what to check, how to fix, how to confirm.
- **drill**: a scripted rehearsal of a failure, with expected observations. Restore drill, decrypt drill, laptop-is-gone drill.
- **staging**: the deployment that matches production and is tried first. **Production** is what participants use.
- **integrator**: the role that holds the whole picture, owns the contracts, writes briefs, reviews and merges.
- **builder**: an agent session with a brief, bounded to a set of files.
- **operator**: Marco. The one person who runs the system and holds the keys.
- **queue**: the ordered card ids of one session, as the deck engine plans them: warm-ups then checkpoints, deferred cards first within their set. Dismiss moves a card to its end; a second dismiss removes it.
- **bucket**: one counter of the rate limiter, keyed by route, minute and subject (a workshop, a code hash, or everyone). Its **budget** is the number of requests the minute allows.

# Runbook

One entry per error code and per service. Each entry: what it means, the likely cause, what to check, how to fix, how to confirm it is fixed. Every error code in `packages/contracts/src/api.ts` and `packages/crypto/src/index.ts` must have a heading here; a test (`packages/contracts/test/runbook.test.ts`) fails otherwise.

Entries marked _provisional_ describe code that is not yet written; they are the intent, to be corrected when the handler lands.

## How to read a failure

1. Find the code. Participants see it in the diagnostics view; the server writes it in the log line; the monitor names it in the alert.
2. Find its heading below.
3. Do the "check" step before the "fix" step. A code that pattern-matches a known failure can have a different cause.

## Server error codes

### WORKSHOP_UNKNOWN

_Provisional._ Meaning: the slug in the URL matches no workshop. Cause: a typo in a link, or a workshop folder not deployed. Check: `workshops/<slug>/` exists on `main` and the last deploy succeeded. Fix: redeploy, or correct the link. Confirm: `GET /api/<slug>/health`-style request for that slug returns a known workshop in the health listing.

### WORKSHOP_CLOSED

_Provisional._ Meaning: the workshop is past `closesDay`; joins and events are refused. Cause: by design after the close day; otherwise a wrong date in `workshop.json`. Check: `closesDay` in the deployed `workshop.json`. Fix: only if the date is wrong, correct it and redeploy. Confirm: the welcome page loads and a test join succeeds on staging.

### JOIN_WAVE_UNKNOWN

_Provisional._ Meaning: the wave id in the link does not exist for this workshop. Cause: the newsletter link was mistyped or the wave was not created. Check: the waves table for the slug. Fix: create the wave or correct the link before sending. Confirm: opening the link increments the wave's opened counter.

### JOIN_WAVE_CLOSED

_Provisional._ Meaning: the wave link is outside its open window. Cause: by design; or dates wrong. Check: the wave's dates against today. Fix: extend the window if intended. Confirm: a test join on staging.

### JOIN_WAVE_FULL

_Provisional._ Meaning: the wave reached its cap. Cause: more joins than expected, or the cap set too low. Check: joined count versus cap. Fix: raise `cap` in `workshop.json` and redeploy, if the partner agrees. Confirm: next join succeeds.

### JOIN_INVITE_INVALID

_Provisional._ Meaning: the invite token is unknown. Cause: a mistyped or truncated link. Check: nothing on the server side identifies the inviter; ask the participant to request a fresh invite from whoever sent it. Fix: none needed. Confirm: a fresh invite works.

### JOIN_INVITE_USED

_Provisional._ Meaning: the invite was already redeemed. Cause: forwarded to two people, or the same person joining twice. Fix: a fresh invite. Confirm: as above.

### JOIN_CODE_TAKEN

_Provisional._ Meaning: a participant with this code already exists in this workshop. Cause: a 1 in 10^16 collision, or a client bug re-sending a join with a stored code. Check: the client logic; this should essentially never appear in logs. Fix: the client generates a new code and retries once; if the code appears repeatedly, it is a bug. Confirm: no repeats in the log.

### AUTH_CODE_MISSING

_Provisional._ Meaning: no `Authorization: Code <16 digits>` header. Cause: a client bug, or a request made by hand. Check: the client sends the header on every authenticated route. Fix: client. Confirm: the route works from the app.

### AUTH_CODE_UNKNOWN

_Provisional._ Meaning: a well-formed code that matches no participant. Expected when someone types a code wrong on "I have a code", or after "delete me". Unexpected in volume: a guessing attempt, which the rate limit answers. Check: the rate of this code per hour. Fix: none for single occurrences. If the pepper was changed, every stored hash stops matching and every participant sees this: restore the pepper from the vault. Confirm: a known code works.

### SYNC_PAYLOAD_INVALID

_Provisional._ Meaning: a session or event in the batch failed the contract; nothing in the batch was stored. Cause: a client and server built from different contract versions, or a corrupted outbox. Check: the validation issues in the log line (they name the field, never the content). Fix: redeploy the client with the matching contracts. Confirm: the participant's outbox drains.

### SYNC_BATCH_TOO_LARGE

_Provisional._ Meaning: more than 20 sessions or 200 events in one call. Cause: a client that did not chunk the outbox. Fix: client chunking. Confirm: outbox drains.

### INVITES_EXHAUSTED

_Provisional._ Meaning: the participant used all their invites. By design. Fix: raise `invitesPerParticipant` only as a workshop decision.

### RATE_LIMITED

_Provisional._ Meaning: too many requests from this code or on this route. Cause: a retry loop in the client, or abuse. Check: which route and whether one code dominates. Fix: client backoff; or leave it, that is the limiter working. Confirm: the rate drops.

### SERVER_ERROR

_Provisional._ Meaning: an unexpected exception. The response carries an `errorId`; the log line with the same id has the stack. Check: the log for that id. Fix: depends on the stack. Confirm: the id stops appearing.

## Client error codes

### CLIENT_STORAGE_UNAVAILABLE

_Provisional._ Meaning: IndexedDB or localStorage refused. Cause: private browsing with storage blocked, or a full disk. The app runs for one session and shows the code at the end. Fix: none on our side; tell the participant to keep their code.

### CLIENT_SEAL_FAILED

_Provisional._ Meaning: `sealAnswer` threw. Cause: a bad public key in `workshop.json` (would fail the contract test first) or a browser without `crypto.getRandomValues`. Check: the browser and the deployed `workshop.json`. Fix: redeploy with a valid key. Confirm: a test answer seals on staging.

### CLIENT_SYNC_FAILED

_Provisional._ Meaning: the last sync call failed; events wait in the outbox. Cause: offline, or a server code above. Check: the server code shown next to it. Fix: per that code. Confirm: the outbox size drops to zero.

## Crypto error codes

### CRYPTO_BAD_PUBLIC_KEY

Meaning: a public key that is not 32 bytes of valid base64. Cause: a bad paste into `workshop.json`. Check: `npm test` fails on the workshop folder. Fix: paste the key from the keygen output again. Confirm: tests pass and the fingerprint matches the trust page.

### CRYPTO_BAD_PRIVATE_KEY

Meaning: a private key that is not 32 bytes of valid base64. Cause: a bad copy from the vault or paper into the export tool. Fix: copy again; compare the first and last characters with the other copy. Confirm: the decrypt drill passes.

### CRYPTO_BAD_TEXT

Meaning: `sealAnswer` refused the text before sealing: longer than 4,000 UTF-16 units, or containing a lone surrogate (half of an emoji, usually from truncating by string length instead of by code point). Cause: a client bug in the length limit or truncation. Check: the client enforces the limit by code points and disables save beyond it. Fix: client. Confirm: a 4,000-character answer with emoji at the end seals on staging.

### CRYPTO_BAD_ENVELOPE

Meaning: an envelope without the `v1.` prefix, with invalid base64, or too short. Cause: data corruption or a hand-made request. Check: where the envelope came from. Fix: none; the event is rejected before storage if the contract is enforced.

### CRYPTO_OPEN_FAILED

Meaning: the tag check failed: wrong key or altered envelope. Cause in the export: the wrong workshop's key. Check: the fingerprint of the key you are using against `workshop.json`. Fix: use the right key. Confirm: the drill opens a known envelope.

## Services

_To be written as each service is set up, from the services list: what it does, where the login is, what breaks without it, how to move off it._

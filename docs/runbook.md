# Runbook

One entry per error code and per service. Each entry: what it means, the likely cause, what to check, how to fix, how to confirm it is fixed. Every error code in `packages/contracts/src/api.ts` and `packages/crypto/src/index.ts` must have a heading here; a test (`packages/contracts/test/runbook.test.ts`) fails otherwise.

Entries marked _provisional_ describe code that is not yet written; they are the intent, to be corrected when the handler lands.

## How to read a failure

1. Find the code. Participants see it in the diagnostics view; the server writes it in the log line; the monitor names it in the alert.
2. Find its heading below.
3. Do the "check" step before the "fix" step. A code that pattern-matches a known failure can have a different cause.

## Server error codes

### REQUEST_INVALID

Meaning: the body of a join or invites call is not JSON or fails the contract. Cause: a client and server built from different contract versions, or a hand-made request. Check: the validation issues in the log line name the field, never the content. Fix: redeploy the client with the matching contracts. Confirm: the call succeeds from the app.

### REQUEST_TOO_LARGE

Meaning: the body exceeds `MAX_REQUEST_BYTES` (one megabyte). Cause: a client that did not split a large outbox. Fix: client batching by bytes as well as by count. Confirm: the outbox drains.

### WORKSHOP_UNKNOWN

_Provisional._ Meaning: the slug in the URL matches no workshop. Cause: a typo in a link, or a workshop folder not deployed. Check: `workshops/<slug>/` exists on `main` and the last deploy succeeded. Fix: redeploy, or correct the link. Confirm: `GET /api/<slug>/health`-style request for that slug returns a known workshop in the health listing.

### WORKSHOP_CLOSED

_Provisional._ Meaning: the workshop is past `closesDay`; joins and events are refused. Cause: by design after the close day; otherwise a wrong date in `workshop.json`. Check: `closesDay` in the deployed `workshop.json`. Fix: only if the date is wrong, correct it and redeploy. Confirm: the welcome page loads and a test join succeeds on staging.

### JOIN_WAVE_UNKNOWN

_Provisional._ Meaning: the wave id in the link does not exist for this workshop. Cause: the newsletter link was mistyped or the wave was not created. Check: the waves table for the slug. Fix: create the wave or correct the link before sending. Confirm: opening the link in a browser that has not opened it before increments the wave's opened counter (the client counts once per device).

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

### SERVER_NOT_CONFIGURED

Meaning: the deploy context has no `DATABASE_URL`, or no `WB_PEPPER`, or a pepper that is not 32 bytes in base64. The function answers every `/api/*` path with 503 and this code, before the app exists; the client shows the code. The monitor on `/api/health` alerts, since `"ok":true` is absent. Cause: a context whose variables were never set (Production before hardening week; a deploy preview of a pull request from a fork, which Netlify keeps secret variables away from), a variable set after the deploy (a change reaches only later deploys), or a pepper pasted with a character missing. Check: the function log (Netlify, the deploy's Functions tab) for the line `SERVER_NOT_CONFIGURED <reason>`, which names the variable and never its value; then Netlify, Project configuration, Environment variables, which contexts hold a value. Fix: set the value for that context (`docs/account-setup.md`, section 5), then Deploys, Trigger deploy. Confirm: `/api/health` answers 200 with `"ok":true`.

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

### Domain: under-over-through.co

The app lives on a subdomain of it. Registrar: Tucows Domains (OpenSRS), the registry behind Netlify's and Hover's domain registration; confirm which account holds it. Created 30 July 2015. Expiry: 29 July 2027, which covers the project's deletion date of 5 February 2027. Auto-renew: _confirm on, and note the card it charges_. DNS host: Netlify (NS1 network). The app's record: one CNAME, `worldbuilder` to the Netlify site. What breaks without it: everything, including the business's mail. Check: `dig +short CNAME worldbuilder.under-over-through.co` returns the Netlify site's hostname. Never edit any other record in that zone for this project.

### Netlify site: worldbuilder

_Provisional._ Hosts the client and the API function. Where the login is: the same Netlify account. Limits on the free plan: 100 GB bandwidth, 300 build minutes, 125,000 function calls a month; usage alerts on. What breaks without it: the hostname serves nothing; installed apps keep working offline. If paused for exceeding the allowance: upgrade the team to the paid plan for one month, which unpauses within minutes. Move off it: static files and one function redeploy on Cloudflare Pages in an hour.

### Netlify function answers 502 on every `/api/*` path

Symptom: the health monitor alerts; every API path answers 502 with a JSON body whose `errorMessage` starts with `Cannot find module` (or another error thrown before the first request); the client shows `CLIENT_SYNC_FAILED` and keeps answers in the outbox, so nothing is lost. Cause: the deployed function file needs something that is not in it. Since 28 October 2026 the build makes that file itself (`tools/ops/bundle-api.ts`, learning note 07), so this means the build step was skipped or changed. Check: the deploy log in Netlify (Deploys, the deploy, the log) has a line `bundle-api: wrote ... (NNN KB, version ...)`; `npm test` passes `apps/api/test/bundle.test.ts` locally. Fix: in Netlify, Deploys, open the last good deploy and press \"Publish deploy\" to roll back in a minute; then fix the build and push. Participants' phones keep their outbox for `EVENT_RETENTION_DAYS` and re-send on the next open. A 503 with `SERVER_NOT_CONFIGURED` in the body is a different failure: the function runs, its deploy context lacks a secret; see that code.

### Netlify build fails with `migrate: expected a postgres:// URL in this context`

Symptom: a branch deploy or deploy preview fails in the first build step with this line. Cause: the context's `DATABASE_URL` is set but is not the plain connection string: Neon's Connect dialog also hands out the string as a `psql '...'` command or a `DATABASE_URL='...'` line, and a value pasted in one of those shapes, or wrapped in quotes, is refused before anything is touched. Seen 30 October 2026 on staging. Fix: Project configuration, Environment variables, `DATABASE_URL`, Edit; under the failing context paste the plain string, which starts with `postgresql://`, with no quotes and nothing in front; Save; then rebuild the deploy. A branch deploy is rebuilt from its own row under Deploys, Options, Retry deploy; the Trigger deploy button at the top of that page builds the production branch and nothing else.

### Neon: world-builder

_Provisional._ The database, free tier, US East (Ohio), branches `main` (production) and `staging`. Limits: 100 compute hours and 0.5 GB a month; six-hour restore window. Compute sleeps when idle and wakes in about a second, which is normal. If limits are reached: switch to the Launch plan, usage-based with no minimum. Recovery beyond six hours: restore last night's dump, then let the devices re-send what the server lacks.

What can go wrong: **`password authentication failed for user 'neondb_owner'`** in a Netlify build log (the migrate step), or `dbReachable: false` on `/api/health` while the deploy context has its `DATABASE_URL`. Either the role's password on that Neon branch no longer matches the string Netlify holds, or the branch no longer exists. A deleted branch takes its compute with it, and a connection to the vanished compute got this same message, not an unknown host. Nothing on other branches is affected. Seen 29 October 2026 on staging and on every deploy preview: the first `staging` branch had been created in the console with the dialog's default **Auto-delete: After 1 day** left in place, and Neon deleted it a day later. Check: Neon, Branches, is the branch still listed; then Monitoring, System operations, for the deletion or a password reset and its time. Fix: if the branch is gone, Create branch, name `staging`, parent `production`, Auto-delete set to never; in either case Connect, role `neondb_owner`, database `neondb`, copy the current string into the vault item and into Netlify's `DATABASE_URL` under both Deploy Previews and Branch deploys; then redeploy staging: fast-forward `staging` to `main` (`git push origin main:staging`, the documented way to refresh the stable staging address), or in Netlify, Deploys, open the latest `staging` branch deploy and Retry. The Trigger deploy button builds the production branch, not staging. Retry each failed preview, or push to its branch. The first deploy recreates the tables and reloads the workshop. Confirm: staging's `/api/health` shows `dbReachable: true` and the previews build. Production is the default branch, which Neon refuses to expire. The ops page `runbook/neon.md` has the click path.

### Backups: Backblaze bucket and GitHub artifact

Nightly job in the ops repository (`.github/workflows/backup.yml` and `scripts/backup.sh`; its page `runbook/backups.md` has the secrets, the checks and the restore steps), 07:17 UTC, one job per database. Copy A in the Backblaze bucket `world-builder-backups` under `<target>/database/<day>/` and `<target>/workshops/<slug>/<day>/`, held 14 days by Object Lock and removed by the lifecycle rule the day after; copy B as the run's artifact, 14 days. Every file is sealed with `age` to the backup key on the runner before upload; the private half is in the vault and on paper, so a copied bucket is unreadable. After the upload the job writes a `backup_runs` row per file, deletes rate buckets older than an hour, and pings the Better Stack heartbeat; a failed run pings its `/fail` address, and no ping for 26 hours is an alert. Restore: `scripts/restore.sh` in the ops repository loads a dump into a scratch database and counts what arrived; `runbook/restore-drill.md` there is the drill, with its expected observations. Learning note 08. Check: the health endpoint's `lastBackupAt` is under a day old and the last run under Actions is green. Fix: the ops page lists the failure modes (pg_dump older than the server, Backblaze checksums, key capabilities, an empty secret). Confirm: the next run is green and `lastBackupAt` moves.

### DNS: Netlify DNS

Where the login is: the Netlify account that hosts the main site. What breaks without it: the hostname stops resolving; participants with the installed app keep working offline until it is back. Move off it: recreate the zone's records at any DNS host and change the nameservers at the registrar; the app's own record is one line.

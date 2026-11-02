# Runbook

One entry per error code and per service. Each entry: what it means, the likely cause, what to check, how to fix, how to confirm it is fixed. Every error code in `packages/contracts/src/api.ts` and `packages/crypto/src/index.ts` must have a heading here; a test (`packages/contracts/test/runbook.test.ts`) fails otherwise.

Every entry describes the code as it is: each was checked against `apps/api/src/app.ts`, `netlify/functions/api.mts`, `apps/web/src` and `packages/crypto` on 2 November 2026 (ops brief, item 3; the build log of that day). Where the code does not yet do what the plan says, the entry says so and names the builder's item that changes it, so that nothing here describes a behaviour that cannot be seen.

## How to read a failure

1. Find the code. Participants see it in the diagnostics part of the privacy panel; the server answers it in the response body (`{ "error": "<CODE>", "message": ... }`) and writes a log line only for `SERVER_ERROR` and `SERVER_NOT_CONFIGURED`; the monitor watches `/api/health` for `"ok":true` and names nothing else.
2. Find its heading below.
3. Do the "check" step before the "fix" step. A code that pattern-matches a known failure can have a different cause.

## Server error codes

### REQUEST_INVALID

Meaning: the body of a join or invites call is not JSON, or does not match the strict contract for that route (an extra field is an error, not dropped). Cause: a client and server built from different contract versions, or a hand-made request. Check: the response carries only the code; nothing is logged today, so reproduce from the app on the deploy preview (the API builder's item 2 adds one log line with the route, the code and the field paths, never a value). Fix: redeploy the client with the matching contracts. Confirm: the call succeeds from the app.

### REQUEST_TOO_LARGE

Meaning: the body is larger than `MAX_REQUEST_BYTES` (one million), refused before it is parsed. The function compares the declared `Content-Length`, then the length of the text it read (in UTF-16 units today; the API builder's item 1 makes it bytes). Cause: a client that did not split a large outbox. Check: the client splits batches by `SYNC_MAX_EVENTS`, `SYNC_MAX_SESSIONS` and the JSON length (`apps/web/src/lib/batches.ts`), so this code from the app means a batch that grew between splitting and sending, or a hand-made request. Fix: client batching. Confirm: the outbox drains on the privacy panel.

### WORKSHOP_UNKNOWN

Meaning: the slug in the URL matches no workshop in this deploy's database, or the path matches no route at all (every unknown `/api/*` path answers this). Cause: a typo in a link, a workshop folder not yet deployed, or a database that was reset without the deploy that reloads it. Check: `GET /api/health` lists every workshop the database holds, by slug and status; `workshops/<slug>/` exists on `main`; the last deploy's log shows `sync: <slug> ...` from `workshop sync`. Fix: correct the link, or redeploy (the build's second step loads every workshop folder). Confirm: the slug appears in the health listing and the welcome page loads.

### WORKSHOP_CLOSED

Meaning: the workshop does not accept joins, opens, events, invites or deletions: its status is not `open`, or today (the function's day, in UTC) is before `opensDay` or after `closesDay`. Cause: by design before the opening day and after the close day; otherwise a wrong date in `workshop.json`, or a status changed by hand. The client judges the same days on the device first and shows "not open yet" or "closed" without a request; this code is the server saying the same when a request arrives anyway (a phone whose date is wrong, a stored code opening after the close day). Check: the days in the deployed `workshop.json`, and for staging `workshop.staging.json`, whose earlier `opensDay` is what staging uses; the status in `/api/health`. Fix: only if a date is wrong, correct it and redeploy; `workshop sync` turns `draft` into `open` on every deploy and never reopens `closed`. Confirm: a test join succeeds on the deploy preview.

### JOIN_WAVE_UNKNOWN

Meaning: the wave id in the link does not exist for this workshop (also answered by the opened counter, which refuses an unknown or malformed wave before counting). Cause: the newsletter link was mistyped, or names a wave that was never created: the deploy creates `wave-1` only (`workshop sync`), and there is no tool yet that creates another. Check: the link against `wave-1`; the `waves` table for the slug in Neon's SQL editor on the right branch. Fix: correct the link before sending; a second wave is a change to `workshop sync` or a new tool, the ops builder's item 8 tier. Confirm: opening the link in a browser that has not opened it before increments the wave's `opened_count` (the client counts once per device).

### JOIN_WAVE_FULL

Meaning: the wave's `joined_count` has reached the workshop's `cap`. Cause: more joins than expected, or the cap set too low. The cap is a safety valve, not an exact count: two joins in the same instant can both pass, so it may be exceeded by one or two. Check: `joined_count` against `cap` in Neon's SQL editor on the branch (or the status command once it exists). Fix: raise `cap` in `workshop.json` and redeploy, if the partner agrees. Confirm: the next join succeeds.

### JOIN_INVITE_INVALID

Meaning: no invite with this token exists for this workshop (the server stores a hash of the token and compares the hashes as strings). Cause: a mistyped or truncated link, or an invite from another workshop. Check: nothing on the server identifies who sent it; ask the participant to request a fresh invite from whoever sent the link. Fix: none needed. Confirm: a fresh invite works.

### JOIN_INVITE_USED

Meaning: the invite exists and was already redeemed. One statement claims an invite, so two people opening the same link at once get one join and one of these. Cause: the link was forwarded to two people, or the same person joined twice. Fix: a fresh invite. Confirm: as above.

### JOIN_CODE_TAKEN

Meaning: a participant with this code already exists in this workshop. Cause: a 1 in 10^16 collision, or a client re-sending a join with a code it already stored. Nothing is logged for it. Check: if it appears more than once in a day, read the client's join path; it should essentially never appear. Fix: the client generates a new code and retries once without telling the participant (the UI builder's item 4); until that lands the participant taps the button again, which makes a new code. Confirm: the join succeeds. Through an invite the collision also spends the invite; a fresh invite is then needed.

### AUTH_CODE_MISSING

Meaning: no `Authorization: Code <16 digits>` header: the scheme is not `Code`, or what follows is not sixteen digits once spaces, hyphens and dots are removed. Cause: a client bug, or a request made by hand. Check: the client sends the header on `sync`, `me`, `invites` and `delete`, never on `join`, `opened` or `health`. Fix: client. Confirm: the route works from the app.

### AUTH_CODE_UNKNOWN

Meaning: a well-formed code that matches no participant of this workshop. Expected when someone types a code wrong on "I have a code", after "delete me", and for every device that stored a code before a database reset or a restore that did not include it (staging is reset this way on purpose; the ops repository's `runbook/staging-reset.md`). Unexpected in volume: a guessing attempt, which the per-workshop limit on unknown codes answers with `RATE_LIMITED`. Check: how often, and whether one workshop dominates; the code itself is never logged. Fix: none for single occurrences. If the pepper was changed, every stored hash stops matching and every participant sees this: restore the pepper from the vault and redeploy. On a stored code the client today starts a session anyway with nothing synced; the UI builder's item 9 makes it clear the code and show Welcome with an explanation. Confirm: a known code works on `/continue`.

### SYNC_PAYLOAD_INVALID

Meaning: a session or event in the batch failed the strict contract (an unknown field, a body on a non-answer, an answer without a body, a malformed envelope); nothing in the batch was stored. Cause: a client and server built from different contract versions, or a corrupted outbox. Check: the response carries only the code; nothing is logged today (the API builder's item 2 adds one log line with the field paths, never a value or a body). The privacy panel shows the code next to the outbox size. Fix: redeploy the client with the matching contracts. Confirm: the participant's outbox drains.

### SYNC_BATCH_TOO_LARGE

Meaning: more than `SYNC_MAX_SESSIONS` (20) sessions or `SYNC_MAX_EVENTS` (200) events in one call, refused before the batch is validated. Cause: a client that did not chunk the outbox. Check: `apps/web/src/lib/batches.ts` splits by both numbers; from the app this means a hand-made request. Fix: client chunking. Confirm: the outbox drains.

### INVITES_EXHAUSTED

Meaning: the participant has used all their invites (`invitesPerParticipant` in `workshop.json`, 3 for the first workshop). By design. Fix: raise the number only as a workshop decision, then redeploy; existing participants keep the invites they had left, the sync does not top them up. Confirm: a new participant gets the new number.

### RATE_LIMITED

Meaning: too many requests in the current minute on one of five buckets (`LIMITS` in `apps/api/src/app.ts`): per code on the authenticated routes (60), per workshop on join (30 today; 120 with the client retrying once, decision 3 of 2 November, the API builder's item 6), per workshop on wave opens (120), per workshop on unknown codes (30), and one global bucket on health (60). Never per address (ADR 0012). The response is the contract's error body; the client shows the code and does not retry a join yet. Cause: a retry loop in the client, a newsletter landing in one minute, or abuse. Check: which route, and whether the number fits what happened; a newsletter at once hits the join bucket. Fix: client backoff; or leave it, that is the limiter working. The buckets are rows in `rate_buckets`, about one per minute per live bucket, pruned by the nightly job (and on the way, if the API builder's item 5 chooses so). Confirm: the rate drops and the next request succeeds.

### SERVER_ERROR

Meaning: an unexpected exception inside a route. The response carries an `errorId` (eight characters); the function log has the line `SERVER_ERROR <errorId>` followed by the stack, and never the body. Check: Netlify, the deploy, Functions, `api`, the log for that id; the free plan keeps about a day of it, so look the same day. Fix: depends on the stack. Confirm: the id stops appearing and the route works from the app.

### SERVER_NOT_CONFIGURED

Meaning: the deploy context has no `DATABASE_URL`, or no `WB_PEPPER`, or a pepper that is not 32 bytes in base64. The function answers every `/api/*` path with 503 and this code, before the app exists; the client shows the code. The monitor on `/api/health` alerts, since `"ok":true` is absent. Cause: a context whose variables were never set (Production before hardening week; a deploy preview of a pull request from a fork, which Netlify keeps secret variables away from), a variable set after the deploy (a change reaches only later deploys), or a pepper pasted with a character missing. Check: the function log (Netlify, the deploy's Functions tab) for the line `SERVER_NOT_CONFIGURED <reason>`, which names the variable and never its value; then Netlify, Project configuration, Environment variables, which contexts hold a value. Fix: set the value for that context (`docs/account-setup.md`, section 5), then Deploys, Trigger deploy. Confirm: `/api/health` answers 200 with `"ok":true`.

## Client error codes

### CLIENT_STORAGE_UNAVAILABLE

Meaning: IndexedDB or localStorage refused to open or write, so the code cannot be kept between visits. Cause: private browsing with storage blocked, or a full disk. Today the client does not produce this code: a storage failure on open surfaces as an unhandled error and the screen stays on "Loading" (the UI builder's item 9 detects it, runs one session in memory, warns, and shows the code at the end, as the screen map says). Fix: none on our side; tell the participant to keep their code, or to open the link outside private browsing. Confirm: the app opens and the privacy panel shows the stored code.

### CLIENT_SEAL_FAILED

Meaning: sealing an answer threw without a crypto code; nothing was stored or sent. The client shows the thrown error's own code when it has one, so a crypto failure appears as `CRYPTO_BAD_PUBLIC_KEY` or `CRYPTO_BAD_TEXT`, and this code only for anything else (a browser without `crypto.getRandomValues`, an exception in the store). Check: the browser and its version; the deployed `workshop.json` (a bad key would fail the contract test first). Fix: redeploy with a valid key, or a supported browser. Confirm: a test answer seals and syncs on the deploy preview.

### CLIENT_SYNC_FAILED

Meaning: the last sync call did not reach the API or came back with no recognisable error code; events wait in the outbox. The privacy panel says `offline` when the request itself failed (no network, a blocked host) and `error` when the server answered something the contract does not name (Netlify's own 502 page when the function cannot start, a 404 page). A server code from this runbook is shown as that code instead. Cause: offline; or the function down, see "Netlify function answers 502". Check: the panel's last sync result, then `/api/health`. Fix: per the code shown, or wait for the network. The client retries on the next card and on the next open (retries on reconnect and on a timer are the UI builder's item 9). Confirm: the outbox size drops to zero.

## Crypto error codes

### CRYPTO_BAD_PUBLIC_KEY

Meaning: a public key that is not 32 bytes of valid base64. Cause: a bad paste into `workshop.json`. Check: `npm test` fails on the workshop folder. Fix: paste the key from the keygen output again. Confirm: tests pass and the fingerprint matches the trust page.

### CRYPTO_BAD_PRIVATE_KEY

Meaning: a private key that is not 32 bytes of valid base64. Cause: a bad copy from the vault or paper into the export tool's key file. The export checks the key before reading a row and stops with this code, nothing written. Fix: copy again; compare the first and last characters with the other copy. Confirm: the export prints its counts; the decrypt drill passes.

### CRYPTO_BAD_TEXT

Meaning: `sealAnswer` refused the text before sealing: longer than 4,000 UTF-16 units, or containing a lone surrogate (half of an emoji, usually from truncating by string length instead of by code point). Cause: a client bug in the length limit or truncation. Check: the client enforces the limit by code points and disables save beyond it. Fix: client. Confirm: a 4,000-character answer with emoji at the end seals on staging.

### CRYPTO_BAD_ENVELOPE

Meaning: an envelope without the `v1.` prefix, with invalid base64, or too short. Cause: data corruption or a hand-made request. Check: where the envelope came from. Fix: none; the event is rejected before storage if the contract is enforced.

### CRYPTO_OPEN_FAILED

Meaning: the tag check failed: wrong key, or an altered envelope. In the export, before any row is read, the tool seals a probe to the workshop's public key and opens it with the key given; the wrong workshop's key stops the export with this code and the workshop's fingerprint, nothing written. On a single row after that check it means a corrupt or altered envelope: the row reads `[could not open: CRYPTO_OPEN_FAILED]`, the count is printed, and the export continues. Check: the fingerprint the tool printed against `workshop.json` (production) or `workshop.staging.json` (staging and the local server). Fix: use the right key. Confirm: the export opens every answer; the drill opens a known envelope.

## Services

One entry per service, in the order a failure would be noticed: what it does, where the login is, what it costs, what breaks without it, how to move off it, and the page in the private ops repository (`m-under-over-through/world-builder-ops`, `runbook/`) that names the identifiers. The reasons for each choice are in `docs/services.md`; the accounts' settings in `docs/account-setup.md`. Every account is under the UOT identity with two-factor on and its recovery codes printed and stored with the key envelopes; every secret is in the vault and in the vendor that uses it, never in a repository.

### Domain: under-over-through.co

The app lives on a subdomain of it. Registrar: Tucows Domains (OpenSRS), the registry behind Netlify's and Hover's domain registration; confirm which account holds it. Created 30 July 2015. Expiry: 29 July 2027, which covers the project's deletion date of 5 February 2027. Auto-renew: _confirm on, and note the card it charges_. DNS host: Netlify (NS1 network). The app's record: one CNAME, `worldbuilder` to the Netlify site. What breaks without it: everything, including the business's mail. Check: `dig +short CNAME worldbuilder.under-over-through.co` returns the Netlify site's hostname. Never edit any other record in that zone for this project.

### Netlify site: worldbuilder

Hosts the client and the API function, `worldbuilder-uot`, deployed from the GitHub repository: `main` to production, the `staging` branch to the staging address, every pull request to a deploy preview. Where the login is: the Netlify account that also holds the domain's DNS and the main site. Cost: 0 on the free plan; limits 100 GB bandwidth, 300 build minutes, 125,000 function calls a month, with usage emails for build minutes and none for bandwidth, so the usage page is part of the weekly check. What breaks without it: the hostname serves nothing; installed apps keep working offline and hold their outbox for `EVENT_RETENTION_DAYS`. If paused for exceeding the allowance: upgrade the team to the paid plan for one month, which unpauses within minutes. Move off it: static files and one function redeploy on Cloudflare Pages in an hour; the secrets are in the vault. Ops page: `runbook/netlify.md` (addresses, contexts, environment variables, the certificate's renewal check in early December).

### Netlify function answers 502 on every `/api/*` path

Symptom: the health monitor alerts; every API path answers 502 with a JSON body whose `errorMessage` starts with `Cannot find module` (or another error thrown before the first request); the client shows `CLIENT_SYNC_FAILED` and keeps answers in the outbox, so nothing is lost. Cause: the deployed function file needs something that is not in it. Since 28 October 2026 the build makes that file itself (`tools/ops/bundle-api.ts`, learning note 07), so this means the build step was skipped or changed. Check: the deploy log in Netlify (Deploys, the deploy, the log) has a line `bundle-api: wrote ... (NNN KB, version ...)`; `npm test` passes `apps/api/test/bundle.test.ts` locally. Fix: in Netlify, Deploys, open the last good deploy and press \"Publish deploy\" to roll back in a minute; then fix the build and push. Participants' phones keep their outbox for `EVENT_RETENTION_DAYS` and re-send on the next open. A 503 with `SERVER_NOT_CONFIGURED` in the body is a different failure: the function runs, its deploy context lacks a secret; see that code.

### Netlify build fails with `migrate: expected a postgres:// URL in this context`

Symptom: a branch deploy or deploy preview fails in the first build step with this line. Cause: the context's `DATABASE_URL` is set but is not the plain connection string: Neon's Connect dialog also hands out the string as a `psql '...'` command or a `DATABASE_URL='...'` line, and a value pasted in one of those shapes, or wrapped in quotes, is refused before anything is touched. Seen 30 October 2026 on staging. Since 2 November the tool prints a second line naming the shape it wants (nothing in front of `postgresql://`, no quotes around it) and never the value; the eight wrong shapes are a test (`tools/ops/test/migrate.test.ts`). Fix: Project configuration, Environment variables, `DATABASE_URL`, Edit; under the failing context paste the plain string, which starts with `postgresql://`, with no quotes and nothing in front; Save; then rebuild the deploy. A branch deploy is rebuilt from its own row under Deploys, Options, Retry deploy; the Trigger deploy button at the top of that page builds the production branch and nothing else.

### Neon: world-builder

The database, free tier, US East (Ohio), Postgres 18, branches `production` (the default) and `staging`. Where the login is: the UOT identity, vault item "Neon". Cost: 0; limits 100 compute hours and 0.5 GB a month, a six-hour restore window; compute sleeps when idle and wakes in about a second, which is normal. What breaks without it: every API route answers 503 (`/api/health` says `dbReachable: false`); the client keeps working on the device and syncs later. If limits are reached: switch to the Launch plan, usage-based with no minimum. Recovery beyond six hours: restore last night's dump (`runbook/restore-drill.md` in the ops repository), then let the devices re-send what the server lacks. Move off it: a Postgres dump loads into any Postgres; `DATABASE_URL` is one variable per context. Ops page: `runbook/neon.md` (project id, branch ids, roles, the `backup` role for production); `runbook/staging-reset.md` for emptying staging on purpose.

### Backups: Backblaze bucket and GitHub artifact

Nightly job in the ops repository (`.github/workflows/backup.yml` and `scripts/backup.sh`; its page `runbook/backups.md` has the secrets, the checks and the restore steps), 07:17 UTC, one job per database. Copy A in the Backblaze bucket `world-builder-backups` under `<target>/database/<day>/` and `<target>/workshops/<slug>/<day>/`, held 14 days by Object Lock and removed by the lifecycle rule the day after; copy B as the run's artifact, 14 days. Every file is sealed with `age` to the backup key on the runner before upload; the private half is in the vault and on paper, so a copied bucket is unreadable. After the upload the job writes a `backup_runs` row per file, deletes rate buckets older than an hour, and pings the Better Stack heartbeat; a failed run pings its `/fail` address, and no ping for 26 hours is an alert. Restore: `scripts/restore.sh` in the ops repository loads a dump into a scratch database and counts what arrived; `runbook/restore-drill.md` there is the drill, with its expected observations. Learning note 08. Check: the health endpoint's `lastBackupAt` is under a day old and the last run under Actions is green. Fix: the ops page lists the failure modes (pg_dump older than the server, Backblaze checksums, key capabilities, an empty secret). Confirm: the next run is green and `lastBackupAt` moves.

### DNS: Netlify DNS

Where the login is: the Netlify account that hosts the main site. What breaks without it: the hostname stops resolving; participants with the installed app keep working offline until it is back. Move off it: recreate the zone's records at any DNS host and change the nameservers at the registrar; the app's own record is one line.

### Backblaze: world-builder-backups

Copy A of the backups: the bucket `world-builder-backups`, private, Object Lock 14 days in governance mode, a lifecycle rule that removes files the day after the lock ends, server-side encryption on top of the job's `age` sealing. Where the login is: the UOT identity, vault item "Backblaze"; the job's application key is the vault item "World Builder: Backblaze backup key" and the ops secrets `B2_KEY_ID` and `B2_APPLICATION_KEY`. Cost: 0 under 10 GB, a few megabytes a night here; a daily spending cap set under Caps & Alerts is the guard. What breaks without it: the nightly job fails at its upload step, pings the heartbeat's `/fail` address, and Better Stack alerts; nothing is lost, since the dump is made before the upload and copy B (the GitHub artifact) comes from the same run. Fix: a new application key (the ops page says how) and both secrets updated, or a new bucket with the same two rules. Move off it: any S3-compatible bucket; the job takes the endpoint and bucket name from two variables in the workflow. Ops page: `runbook/backblaze.md`.

### Better Stack: monitors and the heartbeat

Uptime monitoring, free plan: the main site, the app's client, the staging health endpoint (keyword `"ok":true` every three minutes), and the heartbeat the backup job pings once a day with a grace of 12 hours. Alerts by email and the mobile app's push; calls and SMS would be a paid seat. Where the login is: the UOT identity, team "World Builder". Cost: 0. What breaks without it: nothing participants see; failures are then found by hand, so the weekly check reads `/api/health` and the last backup run itself until it is back. Known behaviour: Better Stack pauses a monitor it believes has been down too long; a paused monitor alerts for nothing, so a monitor's status is part of the weekly check, and the staging monitor's definition is being read after it paused over the weekend of 31 October while staging was healthy (the ops page records the cause when it is seen). Move off it: UptimeRobot in ten minutes; the heartbeat URL is one ops secret. Ops page: `runbook/betterstack.md`.

### GitHub: m-under-over-through

Both repositories: `world-builder` (public, the app; Actions runs `check` on every push and pull request; `main` is protected, pull requests only with the check green) and `world-builder-ops` (private; Actions runs the nightly backup and keeps each run's sealed files 14 days as copy B; the free plan refuses branch protection on a private repository, so it keeps the habit without the rule). Where the login is: the UOT account, vault item "GitHub"; the laptop talks to it over SSH with a key made on that laptop, and `gh` is signed in. Cost: 0. What breaks without it: no deploy from a push (Netlify builds from GitHub), no nightly backup and no copy B; the running site, the database and copy A are untouched, and every clone holds the whole history. Move off it: Netlify can deploy from GitLab, Bitbucket or the command line; the backup job is one workflow file and one shell script that run anywhere with `cron` and the five secrets from the vault. Ops page: `runbook/github.md`.

### Bitwarden: the vault

Every credential, the workshops' private keys, the backup key, the recovery codes' locations, and Emergency Access as the "if I am unreachable" plan (architecture plan, section 10). Where the login is: the UOT identity's Bitwarden account; the master password is the one secret that lives in nobody's vault, so it is on paper with the key envelopes. Cost: Premium, ten dollars a year, paid. What breaks without it: no secret can be pasted anywhere new; what is already set in Netlify and GitHub keeps running, and the paper copies (the private keys, the backup key, the recovery codes) are the fallback for the two things that cannot be remade, the keys. Everything else can be rotated: a new pepper, string, application key or heartbeat URL is made at the vendor and set in its place. Move off it: an export of the vault to another password manager; the paper stays where it is. Ops page: `runbook/bitwarden.md`.

### Google Workspace: the mail

The domain's mail, `privacy@under-over-through.co` on the trust page and in the privacy policy as the contact address, and the role address the vendor accounts were opened with (`docs/account-setup.md`, "Before any of them"), where their alerts, usage warnings and password resets arrive. Where the login is: the Google Workspace admin for `under-over-through.co`, already Marco's. Cost: the existing subscription; nothing added. What breaks without it: vendor mail stops arriving (an alert, a paused site, a renewal warning goes unread) and the privacy address bounces; the app itself does not notice. Fix: forward the role address elsewhere at the registrar's or the domain's MX records; the vendors' accounts can have their address changed from inside each account. Ops page: `runbook/google-workspace.md`.

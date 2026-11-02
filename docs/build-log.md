# Build log

What was done, when, why, how to verify it, what was decided on the way, and what is open. Newest entry at the bottom. Each entry links the learning notes that explain the ideas it introduces. Read this first when coming back to the project.

---

## 2026-10-23, Friday. Phase 0 set up while Marco was away

### Where things stood

Three planning documents existed and nothing else: the architecture and risk plan, the development plan with a schedule to the 16 November newsletter, and the services list. Eleven decisions had been taken that morning. Marco asked for the repository, the conventions, the glossary and the first contracts to be set up, with a detailed log and explainers so he can understand every component and know what is failing when something fails.

### What exists now

- A git repository on `main` with npm workspaces, TypeScript, Vitest, Prettier and a CI workflow. `npm run check` is the gate: typecheck, tests, formatting.
- `packages/contracts`: the shared vocabulary as Zod schemas. Days, UUIDs, slugs, the anonymous code, events, sessions, decks, workshop settings, API routes and request/response shapes, and every error code with its HTTP status and meaning. Tests for each rule.
- `packages/crypto`: sealing an answer to a workshop public key and opening it with the private key, composed from NaCl's box exactly as libsodium's sealed box. Nine tests, including bit-flip tampering.
- `tools/workshop/keygen.ts`: generates a workshop key pair, writes the private key to `.secrets/` with mode 600 and never prints it. A development key for `rural-manufacturing` was generated this way; its public key is in the workshop file.
- `workshops/rural-manufacturing/`: the first workshop folder. `workshop.json` with the decided settings (3 warm-ups, 1 checkpoint, 3 invites, cap 150, 16 Nov to 6 Dec, delete 5 Feb 2027), `deck.json` version 0.1 with the thirteen questions from the notebook sketch, `copy.md` with placeholder text for every screen. The contract tests read these two JSON files, so a bad edit fails `npm test`.
- Documents: `README.md` as the map, `CLAUDE.md` for agents, `docs/glossary.md`, `docs/screen-map.md`, nine decision records in `docs/adr/`, four learning notes in `docs/learn/`, `docs/runbook.md` with an entry for every error code, and this log.
- A test that fails if any error code lacks a runbook heading.

### Decisions made during implementation

Each of these has a decision record; the short version:

1. **npm workspaces, not pnpm** (ADR 0009). pnpm is not installed on this machine and npm is enough at this size. One less global tool.
2. **The code is 16 digits** (ADR 0002). The plan said "a short word code". Digits need no word list, no spelling, and get a numeric keypad. Mullvad's precedent.
3. **Keyed hash, not salted hash** (ADR 0002). A correction to the plan, which said the code would be stored "as a salted hash, the way passwords are stored". Passwords are verified after you know whose row to check; here the server has to find the row from the code alone, so the hash must be deterministic. The server will compute an HMAC with a secret pepper that lives outside the database. The learning note on codes explains why and gives the numbers.
4. **Client at `/<slug>/`, API at `/api/<slug>/`, one origin** (ADR 0008). Makes "this app talks to one host" true and checkable.
5. **Envelope format `v1.<base64>`** (ADR 0003). A visible version so the format can change later.
6. **No readable answer stays on the device** (ADR 0007). Follows from Marco's "what is written is written".
7. **tweetnacl plus noble-hashes instead of libsodium-wrappers** (ADR 0009). See the findings below.
8. **No TypeScript syntax with runtime meaning** (ADR 0009). No enums, no constructor parameter properties, so Node can run tools without a build step.

### Findings on the way (things that did not work the first time)

- **libsodium-wrappers 0.7.16 cannot be loaded as an ES module in Node.** Its `.mjs` entry imports `./libsodium.mjs`, a file the package does not contain. Rather than patch module loading differently in Node and in the browser, the sealed box is now composed in our own code from NaCl's `box` (tweetnacl) and BLAKE2b (noble-hashes), following libsodium's published recipe byte for byte. The four steps are four readable lines. Interoperability with libsodium is by construction and not yet tested against libsodium itself; add a cross-check with PyNaCl to the decrypt drill.
- **Why that happened, investigated the same afternoon at Marco's request.** The library's git repository builds everything into one folder, `dist/modules-esm/`, where the core (`libsodium.mjs`) and the wrapper (`libsodium-wrappers.mjs`) sit side by side, so a relative import of `./libsodium.mjs` works there. On npm the same build is published as two separate packages, `libsodium` and `libsodium-wrappers`. The CommonJS entry had always imported the core by package name (`require("libsodium")`), which npm resolves across packages, so the split never mattered. The ES-module entry was new in 0.7.16, released on 29 December 2025 after sixteen months without a release, and it kept the relative sibling path, which breaks the moment the two files live in different packages. Users reported it the next day (upstream issues 355 and 357); the maintainer, who does not use the JavaScript build himself, asked for a pull request; a contributor fixed it within a day and the fix shipped in 0.8.0 on 6 January 2026. Version 0.8.4 imports `from "libsodium"` by name, ships its own types, and loads in Node. We hit the broken version because the dependency range `^0.7.15` can only ever resolve to the highest 0.7.x, which is 0.7.16. Lessons: a caret range on a 0.x version pins you to a minor line, so check what it actually resolves to; and "widely used" says nothing about a code path nobody used before, which is what the ESM entry was. The decision to stay on tweetnacl and noble-hashes stands (ADR 0009), and 0.8.4 makes a cross-check of our envelopes against real libsodium possible as a test.
- **libsodium's type definitions do not include SHA-256** (it is in the larger "sumo" build). Moot after the switch; fingerprints use noble's SHA-256.
- **Node's type stripping refuses constructor parameter properties.** `constructor(public readonly code: ...)` is TypeScript syntax that implies an assignment; stripping cannot invent it. Node says `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. Fixed by declaring the field explicitly. Rule added to `CLAUDE.md` and ADR 0009.
- **TypeScript 5.9 and `crypto.subtle.digest`**: a `Uint8Array` from a library may be typed over a `SharedArrayBuffer` and is then not accepted as `BufferSource`. Moot after the switch to noble's synchronous `sha256`.

### How to verify by hand

```
npm install
npm run check
node tools/workshop/keygen.ts example --dev     # creates .secrets/dev-example.private-key; delete it after
```

Expected: typecheck silent, 37 tests passing across 6 files, formatting clean. Then, in `node` at the repository root, the snippet in `docs/learn/01-sealed-boxes.md` under "Check it yourself".

### Learning notes written today

- `docs/learn/01-sealed-boxes.md`: public-key encryption, what a sealed box is step by step, the key procedure, what it does not protect.
- `docs/learn/02-codes-hashes-and-peppers.md`: why the code is hashed, why salting cannot work for lookup, what a pepper is, the numbers, rejection sampling.
- `docs/learn/03-schemas-as-contracts.md`: Zod schemas as the vocabulary, validation at boundaries, the workshop folder test, reading a failure.
- `docs/learn/04-repo-anatomy-and-tooling.md`: workspaces, every config file, how tests and tools run, what to run when something fails.

### For Marco this afternoon

1. Read, in this order: `README.md`, `docs/learn/01` and `02`, ADR 0002 and 0003, then skim `packages/crypto/src/index.ts` with the learning note beside it. About forty minutes.
2. Run `npm run check` yourself and read one test file end to end.
3. Pick the subdomain name (no underscore) and add its CNAME at Netlify DNS. Open the accounts in `docs/services.md`. Create the two repositories under the UOT GitHub account, then push this one. (Revised later the same day: ADR 0010.)
4. Generate the production key for `rural-manufacturing` with `node tools/workshop/keygen.ts rural-manufacturing` (no `--dev`), paste the public key and fingerprint into `workshop.json`, store the private key in the vault, print two copies, delete the file. The development key stays for staging.
5. Set the pepper: 32 random bytes, stored as a Worker secret and in the vault, when the API exists next week.
6. Replace `[partner name]` in `workshop.json` and `copy.md`.

### Open questions

- Cross-check the sealed box against libsodium itself (PyNaCl or the Rust crate) before the decrypt drill. By construction it matches; it has not been proven here.
- Whether API request schemas should reject unknown fields (`strict()`) rather than strip them. An independent review of today's code is running; its findings go in the next entry.
- The `[partner name]` placeholder and the partner's confirmation of the cap.

---

## 2026-10-23, Friday, later. Independent review and fixes

### What happened

A second agent reviewed the contracts, the crypto package and the key tool without the author's reasoning, ran the tests, and tried hostile inputs. It reported fourteen findings, eight of them reproduced by running code, and a list of tests worth adding. All were applied in one commit. `docs/learn/05-what-a-review-finds.md` explains each one as a lesson; the short list:

| Finding                                                                                            | Fix                                                      | Test added                                              |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| Key tool: check-then-write gap, and a planted symlink could redirect the key                       | Exclusive create (`flag: 'wx'`), no pre-check            | keygen refuses an existing file and leaves it untouched |
| Key tool: `.secrets/` relative to the current directory, not the repository                        | Anchored on the tool's own location; `--out` for tests   | keygen tests write to a temp dir                        |
| Key tool: unknown flags ignored, so `--Dev` made a production key                                  | Unknown arguments exit 2; slug validated by the contract | unknown flag or bad slug writes nothing                 |
| Key tool: an existing `.secrets/` kept wider permissions                                           | `chmod 700` after `mkdir`                                | directory mode is 700                                   |
| Deck version unbounded on every event                                                              | At most 4 digits each side                               | over-long version rejected                              |
| Envelope schema accepted strings the crypto package cannot decode                                  | Whole base64 groups, minimum 67 characters               | `v1.A`, `v1.AAAAA`, 63 and 65 characters rejected       |
| Leading byte-order mark dropped on open                                                            | `ignoreBOM: true`                                        | round trip keeps it                                     |
| Lone surrogates silently became U+FFFD; over-long text sealed then stuck in the outbox             | `sealAnswer` refuses both with `CRYPTO_BAD_TEXT`         | half an emoji and 4,001 characters refused              |
| A degenerate ephemeral key opened under any private key (libsodium refuses it, tweetnacl does not) | All-zero shared secret refused before opening            | a forged zero-key envelope is refused                   |
| Request schemas stripped unknown fields                                                            | `strictObject` for events, sessions, join and sync       | extra fields rejected                                   |
| UUIDs accepted in any case and any version                                                         | Lowercase v4 only                                        | uppercase and nil rejected                              |
| Days accepted that do not exist                                                                    | `z.iso.date()`                                           | `2026-02-30` rejected, `2028-02-29` accepted            |
| Code generator could spin forever on a broken random source                                        | Throws on an empty result                                | empty and short sources tested                          |
| Health endpoint published per-workshop participant counts                                          | Slug and status only; counts move to the status command  | schema changed                                          |

Also recorded as comments in the contracts: join shares the rate limit of the authenticated routes; invite tokens are compared as strings; the API must cap request bodies in bytes before parsing JSON; the UI must truncate answers by code points.

### What the review confirmed as correct

The sealed-box construction matches libsodium's recipe step by step. The nonce derivation was checked against Python's BLAKE2b on a fixed input, and that value is now a known-answer test. Rejection sampling is unbiased, measured. Base64 and UTF-8 handling cannot crash or hang. The key tool never prints the private key.

### Still open

- None from the review. The libsodium cross-check that was open here was added later the same day; see the next entry.

### How to verify by hand

```
npm run check
```

Expected: 57 tests passing across 7 files, including the key tool's own tests, which spawn it against a temporary directory.

---

## 2026-10-23, Friday, afternoon. Cross-check against libsodium

### What happened

Marco asked why libsodium-wrappers 0.7.16 had failed to load. The investigation (recorded in the first entry under findings) showed the fix had shipped in 0.8.0 and that 0.8.4 loads cleanly in Node. He approved adding 0.8.4 as a development-only dependency of `@wb/crypto` so our envelopes can be checked against the reference implementation.

### What exists now

`packages/crypto/test/libsodium-interop.test.ts`, six tests:

- libsodium opens what we seal; we open what libsodium seals.
- A key pair made by libsodium works with our functions in both directions, which proves the key format is the same raw 32 bytes.
- Our BLAKE2b-24 nonce equals libsodium's `crypto_generichash(24, ...)` over the same input.
- Both sides refuse the forged envelope with an all-zero ephemeral key.
- The sealed layout is the same size: 32 + 16 + message.

The app and the export tool never load libsodium; it is in `devDependencies` only. One finding on the way: libsodium's `crypto_generichash` takes the key as an explicit argument, `null` for unkeyed, which the type definitions enforce.

### How to verify by hand

```
npm run check
```

Expected: 63 tests passing across 8 files.

---

## 2026-10-23, Friday, late afternoon. Hostname and accounts decided

Marco read the documents, ran the check, and asked whether a subdomain of under-over-through.co and his existing UOT GitHub account would do instead of a new domain and a new organization. Checked: the domain's DNS is at Netlify, mail is Google Workspace, the main site sets no cookies and loads no third-party scripts. Decided: yes to both, recorded as ADR 0010. The exact subdomain name is still to come; it must not contain an underscore, because certificate authorities refuse such names. Changes: the services list is rewritten (draft 0.2); the API moves from "Workers" to "Pages Functions" in the architecture plan, decision records and README, which is the same runtime on the same hostname as the client; the runbook gains entries for the domain and for Netlify DNS with the registrar and expiry fields to fill. No code changed.

---

## 2026-10-24, Saturday. The hostname is worldbuilder

Marco chose `worldbuilder`, so the app lives at `worldbuilder.under-over-through.co` and the first workshop at `/rural-manufacturing/` under it. He also asked whether one subdomain with an argument in the URL could serve several workshops. It can and already does: the workshop is the first path segment, which is better than a query parameter for install scope, storage, the API prefix and readability; the architecture plan, section 5.1, now shows the full URLs and the reasons. Placeholders replaced in the services list, ADR 0010, the runbook entry and the workshop copy file. No code changed.

---

## 2026-10-24, Saturday morning. Repositories created and pushed

Step 1 of Marco's list. Pre-push safety pass: no secret-looking file tracked, the development private key never appears anywhere in history. Then:

- `https://github.com/m-under-over-through/world-builder`, public, the app. Seven commits pushed; `origin` set. The CI workflow ran on GitHub's runner on the first push and passed in 19 seconds: install, typecheck, 63 tests, formatting.
- `https://github.com/m-under-over-through/world-builder-ops`, private, with a README that says what belongs there and why it is separate.

Not yet done, deliberately: branch protection on `main` (require a pull request and a passing CI run), which the development plan calls for from Phase 1 onwards. It is one setting; it means every change from then on, including the integrator's, arrives as a pull request Marco reads. Marco decided to turn it on after the walking skeleton lands, on Friday 30 October; the development plan carries the reminder.

Later the same morning: the nine commits carried Marco's business email from this machine's global git configuration. Nothing in the project needs it, and on a public repository anyone can read it, so the history of both repositories was rewritten to the account's GitHub noreply address (dates and content unchanged) and force-pushed, which is safe while nobody else has cloned. This repository's local git configuration now uses the noreply address; the global configuration is untouched. Marco turns on "keep my email private" and "block command line pushes that expose my email" on GitHub, so a future slip would be refused at push. Rule of thumb recorded: rewriting history is cheap on day one and disruptive once branches and pull requests exist.

In progress on Marco's side: the vault and the recovery codes (step 2). Next: the production key (step 3).

---

## 2026-10-24, Saturday, late morning. Production key for rural-manufacturing

Step 3. Marco ran the key tool himself after setting up the vault. The private key file was never read into a transcript: a short script derived the public key from it, printed only the public key and fingerprint, and sealed and opened a probe string to prove the pair works. File modes checked: 600 inside a 700 folder.

- Production public key, now in `workshops/rural-manufacturing/workshop.json`: fingerprint `07aa-8913-bfb4-1cd7`. This is what the trust page prints.
- The development key moved to `workshop.staging.json` (fingerprint `de7f-523e-d6db-ad50`): staging builds seal to it, so drills on staging open with the development private key and the production private key never leaves the vault. A schema and a contract test cover the new file and assert the two keys differ.
- Done the same morning: private key into the vault as a secure note with a hidden custom field and the fingerprint in the notes, two printed copies in two sealed envelopes, then the file deleted. Before deletion the clipboard was compared against the key without displaying either; it did not hold it. Only the development key file remains on disk. Custody for `rural-manufacturing` is complete; the decrypt drill runs once the first sealed answer exists on staging.

---

## 2026-10-24, Saturday, midday. Zero-cost hosting (ADR 0011)

The first partner's budget is small and the next use is a class; the project is an experiment. Marco asked for a setup that costs nothing without giving up security. Since every privacy and security property is in the code, the change is to hosting only: Netlify (already his, already the domain's DNS host) serves the client and the API as a Netlify Function on the same hostname; Neon's free tier in US East, with a `staging` branch; nightly dumps from GitHub Actions to a Backblaze bucket with Object Lock and to a workflow artifact; Better Stack free with a backup heartbeat. Cloudflare drops out. Monthly cost: zero.

What the free tiers take away and what covers it: a six-hour restore window (nightly dumps, and the device now keeps accepted events for fourteen days and re-sends any the server lacks, which is `EVENT_RETENTION_DAYS` in the contracts); a usage allowance that can pause the site (Netlify alerts, one paid month as the lever); thinner logs (the health endpoint and the error codes carry the signal). Documents rewritten: services 0.3, the account walkthrough, the hosting sections of the architecture plan, the runbook's service entries, builder notes. Account signups pause on Cloudflare; Neon, Backblaze and Better Stack proceed.

---

## 2026-10-28, Wednesday. Accounts open; the partner is named

Marco opened the three free accounts: Neon (project `red-union-82272211`, US East Ohio, Postgres 18, default branch `production`, branch `staging`), Backblaze (bucket `world-builder-backups`, Object Lock on, region `us-east-005`), Better Stack (one monitor on the main site for now). Identifiers are on vendor pages in the ops repository's `runbook/`. The partner is Mechanism; the project runs pro bono under Under Over Through, so the organiser line is "Under Over Through x Mechanism" and the answers are owned jointly by Under Over Through and Mechanism (corrected the same day from an earlier assumption that UOT alone owned them), with Under Over Through running the system and the spreadsheet shared with Mechanism at the end. Placeholders replaced in the workshop file, the copy file and the trust page text. Still open on Marco's side: the domain's auto-renew and holding account.

---

## 2026-10-28, Wednesday afternoon. The walking skeleton

### What exists now (branch `skeleton`, pull request to `main`)

The thinnest path through every part of the system, all real, deployed to a preview on Netlify, and walked end to end in a browser against the local stack:

- `packages/db`: the schema from the architecture plan as Drizzle tables, one generated SQL migration, the queries (every one scoped by workshop or participant), the workshop loader. Tests run the real SQL on PGlite, a Postgres compiled to WebAssembly that runs inside the test process, so `npm test` needs no database and CI no service. 13 tests, including the cross-workshop proofs.
- `apps/api`: the Hono app with every route in the contracts; the keyed hash of the code; byte caps before parsing; strict schemas; error codes on every path; rate limits without addresses (ADR 0012); the open window. `netlify/functions/api.mts` hands `/api/*` to it; `apps/api/dev.ts` runs it locally with a local Postgres. 16 tests through `app.request()`.
- `apps/web`: Svelte and Vite. Wave and invite links, join, consent, one session of W warm-ups then C checkpoints, answers sealed on the device before storage, an outbox synced in bounded batches, accepted events kept fourteen days and re-sent if the server lacks them, "I have a code" continuing from the server's record, the privacy panel with live values, delete me. 11 tests for the pure logic and the store.
- `tools/workshop/export.ts` opens a workshop's answers on your machine with the private key file and writes a CSV with fresh pseudonyms. `tools/ops/pepper.ts` makes a pepper the way keygen makes a key. `tools/ops/migrate.ts` and `tools/workshop/sync.ts` run in the Netlify build so no connection string touches a laptop.
- Two new error codes with runbook entries: `REQUEST_INVALID`, `REQUEST_TOO_LARGE`. ADR 0012 for the libraries and the rate limiting. Learning note 06 walks an answer through the files.

### The walkthrough, as it happened

Open the wave link; the URL is cleaned to `/rural-manufacturing/`; New here; consent; card 1 of 4 "What is a typical Tuesday night?"; an answer with an emoji saved, "Synced."; card 2 set aside; two more answers; "That is a session." with the code masked; reveal; the privacy panel: cookies 0, one host, key `de7f-…` (local), 1 session and 4 events on the server, sealed. The database rows start with `v1.`; the export tool, run with the development key, wrote the three answers back in plain text, emoji intact, and nothing for the set-aside card. Then the device storage wiped, "I have a code", the code typed: card 1 was the one warm-up not yet answered, and the panel showed the earlier answers still on the server.

### Findings on the way

- The local on-disk Postgres is one process at a time: stop the development API before running the export locally. Neon has no such limit. Written into learning note 06.
- "Cards already answered" came from the device store only, so a wiped device repeated the first card. The client now combines the device's record with the server's. Found by the walkthrough, not by a test; a test for `sessionCards` with a server-provided set would have caught it, and the UI builder's brief will say so.
- A session row is created when a session starts, so an open-and-leave produces an empty session. Harmless; "sessions count" can later count only sessions with events.
- `npm install` with several packages in one command sometimes installed only the first; `npm ls` afterwards is the habit now.
- Prettier formats Svelte only with its plugin, and a chained command stopped silently when the formatter failed. Added the plugin; check exit codes, not output.
- A type that is a union of two database drivers cannot call methods whose generics differ; typing the connection as the common Postgres base fixed it (ADR 0012).
- Web Crypto wants a `Uint8Array` over a plain `ArrayBuffer`; one from a library may be typed over a shared buffer. Copy into a fresh array.

### How to verify by hand

```
npm run check                                   # 105 tests, svelte-check, formatting
npm run dev:api                                 # terminal 1
npm run dev:web                                 # terminal 2, then open localhost:5173/rural-manufacturing/join/wave-1
node tools/workshop/export.ts rural-manufacturing --key .secrets/dev-rural-manufacturing.private-key   # with the API stopped
```

### For Marco: the staging deploy needs two secrets, set once in Netlify

1. `node tools/ops/pepper.ts staging` writes `.secrets/staging.pepper`; `pbcopy < .secrets/staging.pepper`; in Netlify, Project configuration, Environment variables, add `WB_PEPPER` with the value scoped to **Branch deploys** and **Deploy previews** only; paste the same into the vault as "World Builder: staging pepper"; delete the file.
2. In Neon, project `world-builder`, branch `staging`, copy the connection string (role `neondb_owner`, database `neondb`, the direct one or the pooled one both work with the HTTP driver). In Netlify add `DATABASE_URL`, same two scopes. Into the vault as "World Builder: Neon staging connection string".
3. The click path for both, field by field, is section 5 of `docs/account-setup.md`. Say so, and the `staging` branch gets created from `skeleton`; its first deploy applies the migration, loads the workshop, and the health endpoint at `https://staging--worldbuilder-uot.netlify.app/api/health` reports the database. Production's two values come in hardening week, scoped to **Production** only.

### Still open

- The first-session intro, the Later pile, install prompts and dictation hints: week two, UI builder.
- The deck engine with seeded shuffle and defer rules: week two, deck builder.
- The backup job, the Better Stack heartbeat, drills: Thursday and Friday.
- Branch protection on `main`: Friday, after this lands.

## 2026-10-28, Wednesday evening. Staging secrets set; the first deploy failed at the function; the function is now bundled

### What

- Marco set `WB_PEPPER` and `DATABASE_URL` in Netlify for the Deploy Previews and Branch deploys contexts, both marked secret. `docs/account-setup.md` gained section 5 with the click path, field by field, including what the free plan does with the scopes once the secret flag is on. One pepper was generated, set, and then lost before it reached the vault; Netlify never shows a secret again, so it was replaced with a fresh one (nothing had been stored under it) and the vault came first the second time.
- The `staging` branch was created from `skeleton` and deployed. The build ran (migration, workshop sync, client), but every `/api/*` path answered 502 with `Cannot find module '/var/task/node_modules/@wb/contracts/src/index.ts' imported from /var/task/netlify/functions/api.mjs`. Netlify's packager had turned the function into JavaScript but left the workspace packages outside the file, and its copy of them carried manifests without the TypeScript source behind the links.
- The fix: the build now makes the function file itself. `tools/ops/bundle-api.ts` bundles `netlify/functions/api.mts` with esbuild into `netlify/functions-build/api.mjs`, one file with no imports left to resolve, and refuses to finish if any import other than a Node module would remain outside. `netlify.toml` runs it as the third build step and names that folder as the functions directory. The deploy's commit is baked into the file, so `/api/health` now reports the exact commit that is running.
- `@wb/db` was split so the function's import graph never contains PGlite: the package root exports the schema, the queries and `connectNeon`; the dispatcher that also knows PGlite, and the migrator, moved to `@wb/db/connect`, used by tools, tests and the local server. `Db` lives in `packages/db/src/types.ts`.
- The health route had a flaw the bundle test exposed: it checked the rate limit before its own database guard, so an unreachable database would have produced a 500 `SERVER_ERROR` instead of the 503 the monitor expects. The limiter now sits inside the guard.
- Tests: `apps/api/test/bundle.test.ts` walks the import graph from the function entry (reaches the app, the contracts, the Neon connector; never PGlite, the tools-only connector, or `@wb/crypto`), then builds the real bundle into a temporary folder, checks its text, and runs it in a plain Node process with a database host that cannot exist, expecting 503, `ok: false`, `dbReachable: false` and the baked-in version. `app.test.ts` gained "health when the database is unreachable". 110 tests.
- esbuild is a declared development dependency now (ADR 0012); it was already installed through drizzle-kit and Vite. ADR 0011 has an amendment. Learning note 07 explains imports, links, and bundling. The runbook has an entry for "function answers 502 on every path", with the one-minute rollback. The ops runbook (private) records the variable names, contexts and vault item names, and the staging compute.

### Why

A deployed function runs from a zip on a server with no repository and no `npm install`. Whatever it imports has to be in the zip, already JavaScript. Leaving that to a packager's heuristics put the first failure at the first request, in production-like conditions, with the cause three layers away. Making the artefact ourselves puts the failure at build time, with the import's name, and leaves one readable file as what runs.

### How to verify

```
npm run check                                              # 110 tests, incl. the graph and bundle tests
node tools/ops/bundle-api.ts --commit $(git rev-parse HEAD)   # writes netlify/functions-build/api.mjs, prints size and version
grep -c "^import" netlify/functions-build/api.mjs          # 0: nothing left to resolve
```

Then the staging deploy: the Netlify deploy log has the line `bundle-api: wrote ... (NNN KB, version <commit>)`, and `curl https://staging--worldbuilder-uot.netlify.app/api/health` answers 200 with `"ok":true`, `"dbReachable":true`, the commit as `version`, and the workshop `rural-manufacturing` as `open`. Learning note 07 has the by-hand run of the bundle with a database that cannot exist.

### Decisions made on the way

- **Our own bundling step, not `node_bundler = "esbuild"` in `netlify.toml`.** That setting would make Netlify's packager inline packages too, but it would also follow the literal dynamic import of PGlite into the artefact, and which packager Netlify picks for a TypeScript function is a heuristic that has changed before. One tool we run, with a check and a test, is legible; a setting whose behaviour we infer from a failure is not.
- **Not minified.** Bytes do not matter at 1.2 MB on a function; a readable artefact does.
- **The Neon connector at the package root, the dispatcher at a sub-path**, rather than hiding the PGlite import from the bundler with a non-literal specifier. The split states the rule in the package's shape and a test enforces it.
- **The limiter inside health's guard**: a health check must describe the outage, not become part of it.

### Open

- The bundle is 1.2 MB, a third of it Zod's translations of its own error messages. Harmless; worth a look if cold starts ever matter.
- CI failed once on this branch with a test timing out at 5 seconds: a sync test on PGlite took 5.2 s on the shared runner while eighteen test files ran side by side. The test timeout is now 30 s in `vitest.config.ts`. If a test needs anything near that, it is the test that is wrong, not the limit.
- The first join on staging answered `WORKSHOP_CLOSED`, correctly: the workshop opens on 16 November and the API refuses joins outside the window. To try staging before then, `workshop.staging.json` may now name an earlier `opensDay` (strict schema, ADR 0004 amendment); the sync tool stores it for staging and the folder's day for production, the client uses the same day to word its screen, and a participant who arrives before the opening day sees "Not open yet. This opens on 16 November 2026." instead of a bare error code. Tests in contracts and db.
- Walked on staging in the browser pane after the second redeploy (commit `2071c16`): the wave link cleaned itself to the workshop address and counted the open; New here, consent, join 200; four cards, three answered (one with an emoji) and one set aside, "Synced." after each; the session end with the masked code; the privacy panel: 0 cookies, one host (`staging--worldbuilder-uot.netlify.app`), microphone, camera and location blocked by policy, key `de7f-523e-d6db-ad50 (staging)`, 1 session and 4 events sealed on the server, 0 waiting. `/api/health` then reported `eventsToday: 4`. The API sets no cookie on any path. Staging's data is disposable; this test participant stays.
- One thing the panel got wrong: "Version: local". Vite only exposes variables that start with `VITE_`, and Netlify's commit is `COMMIT_REF`. `apps/web/vite.config.ts` now defines `import.meta.env.VITE_COMMIT_REF` from it at build time, so the panel and `/api/health` report the same commit; on a laptop the panel still says "local". Verified on staging at commit `e87d838`: the panel and `/api/health` show the same version, and a reload of the page found the saved code and the four sealed events.
- Staging verified after the redeploy, about 45 seconds after the push: `https://staging--worldbuilder-uot.netlify.app/api/health` answered 200 with `ok: true`, `version: fbec63f` (the pushed commit), `dbReachable: true`, no backup yet, and `rural-manufacturing` as `open`. The API answers with HSTS and no cookie; the client page carries the self-only Content Security Policy.

## 2026-10-29, Thursday. The skeleton is on main; production serves the client; two gaps the production deploy showed, closed

### What

- Pull request 1 (`skeleton` into `main`) merged with a merge commit, `2e47c07`, after Marco tried staging on his phone and read the log. Four checks passing, one skipped. The tree on `main` is identical to the skeleton's last commit `d6b6c35`; the merge commit only records the merge, so the hashes this log quotes stay in `main`'s history.
- Netlify deployed `main` to production within a minute: `https://worldbuilder.under-over-through.co` serves the client at version `2e47c07` with the self-only Content Security Policy and HSTS. The `skeleton` branch is kept on GitHub for now. The `staging` branch deploy stays at `d6b6c35`, the same tree.
- Production has no API until hardening week, by plan: the Production context has no `WB_PEPPER` and no `DATABASE_URL`, so the build's migration and sync steps did nothing (as designed) and the function threw at its first request. Netlify turned that into a 502 whose body was its own exception record (`DATABASE_URL is not set for this deploy context`, with a stack trace of file positions in the bundle; nothing secret, nothing personal). That showed two gaps, both closed in the same afternoon:
  1. **The function had no error code for "my secrets are missing".** It now reads its three pieces of configuration (`DATABASE_URL`, `WB_PEPPER`, the pepper's shape) inside one guard; when any is missing it logs one line per function instance naming the variable, never its value, and answers every `/api/*` path with 503 and the new code `SERVER_NOT_CONFIGURED`, before the app exists, so the answer never depends on the database. The code is in the contracts and the runbook; the bundle test now builds the file once and runs it three ways in plain Node: unreachable database (503, `ok: false`, the baked-in version, as before), no `DATABASE_URL` (503 with the code on health and on a join), no pepper or a short one (503 with the code).
  2. **A new arrival before the opening day was only turned away by the API.** The client checked the day itself only for a returning participant, so on production today "New here" led to consent and then "Something went wrong: CLIENT_SYNC_FAILED". Now one small function, `apps/web/src/lib/days.ts`, says where a day falls against the workshop's days (`before`, `open`, `after`), and the client uses it for a new arrival as well as a returning participant: before any request, "Not open yet. This opens on 16 November 2026." or "This workshop has closed." The server stays the authority, with `WORKSHOP_CLOSED` once a request is made; the screen is the same either way. Tests for the rule in `apps/web/test/days.test.ts`; the wiring in `App.svelte` is two lines and has no component test, the client has no harness for one yet.
- 119 tests.

### How to verify

```
git log --oneline -2 origin/main           # 2e47c07 Merge the walking skeleton into main, then d6b6c35
git diff --stat d6b6c35 2e47c07            # prints nothing: same tree
npm run check                              # 119 tests, incl. the three bundle runs
node tools/ops/bundle-api.ts && env -u DATABASE_URL -u WB_PEPPER node -e "import('./netlify/functions-build/api.mjs').then(async (m) => { const r = await m.default(new Request('http://localhost/api/health')); console.log(r.status, await r.text()); })"
```

The last line prints the log line `SERVER_NOT_CONFIGURED DATABASE_URL is not set for this deploy context`, then `503 {"error":"SERVER_NOT_CONFIGURED","message":...}`. Once this is on `main`: `curl -s https://worldbuilder.under-over-through.co/api/health` answers 503 with that body instead of Netlify's exception record, and the production address itself shows "Not open yet. This opens on 16 November 2026." in place of the welcome screen; staging, whose opening day is 28 October, still shows the welcome screen.

### Decisions made on the way

- **A merge commit, not a squash.** This log quotes commits by hash; a squash would have left those hashes only on a branch that may be deleted.
- **`staging` not fast-forwarded to the merge commit.** Same tree; a rebuild would only change the version string. From here, `main` is production, pull requests get deploy previews against the staging database, and `staging` is fast-forwarded to `main` whenever the stable staging address should show what production will.
- **Production secrets stay unset until hardening week**, as planned on 28 October, even though the domain now serves the client. Nobody has the address before the newsletter on 16 November; and with this change a visitor who finds it early is told the opening day.
- **The not-configured answer comes from the function, not the app.** The app needs a database to exist; the answer must not. It is also kept for the instance's life: variables change only with a deploy, and a deploy makes new instances, so re-reading them per request would only repeat the log line.
- **The client's day check is the same rule at both ends**, opening and close, for a new arrival and for a returning participant, in one function with a test, instead of two comparisons written out in two places.

### Open

- Thursday's monitor in Better Stack goes on staging's health endpoint until production has its secrets; on production it would alert for a known reason, and `SERVER_NOT_CONFIGURED` is now the body it would see.
- Next, per the plan: the backup job in the ops repository, the Backblaze application key, the monitor. Friday: restore and decrypt drills, branch protection on `main`, the walkthrough.

## 2026-10-29, Thursday afternoon. The nightly backup job; Marco's first phone test

### What

- The backup job, in the ops repository (`world-builder-ops`, commit `7a00b0d`): `.github/workflows/backup.yml` runs `scripts/backup.sh` at 07:17 UTC for each database whose connection string is set, and on demand. One whole-database dump as plain SQL and one export per workshop (its own rows, one CSV per table), each sealed to the backup key with `age` on the runner, uploaded to the Backblaze bucket under `<target>/database/<day>/` and `<target>/workshops/<slug>/<day>/`, and kept as the run's artifact for 14 days. Then a `backup_runs` row per file, which `/api/health` reports as `lastBackupAt`; rate buckets older than an hour deleted; the Better Stack heartbeat pinged, or its `/fail` address on failure.
- `scripts/test-backup.sh` runs the script with stand-ins for `pg_dump`, `psql`, `age`, `aws` and `curl` and checks the file names, the bucket keys, the rows, the heartbeat, the refusal of a malformed slug, and that none of the stand-in secrets reached a log or a file. The ops repository's `checks.yml` runs it with shellcheck on every push. Thirteen checks; the first version failed one of them, because the loop split slugs on spaces and the fixture's `bad slug!` became two words, one of which passed the shape check. Slugs are now read one per line.
- Ops runbook pages: `backups.md` (new: the job, secrets and variables, retention, checks, how to run by hand, how to restore, what can go wrong), `backblaze.md` (the key, Object Lock 14 days, the lifecycle rule), `betterstack.md` (the heartbeat; the health monitor on staging), `neon.md` (direct strings for `pg_dump`; the `backup` role for production, with its grants).
- The drill scripts, in the ops repository (its pull request 1, commit `fd81f60`): `scripts/unseal.sh` opens one sealed file with the backup key and says what it holds; `scripts/restore.sh` opens a dump, loads it into a scratch database and prints a count per table next to the source's, after refusing a pooled string, a database that already holds tables and a dump that is not ours; `scripts/test-restore.sh` checks both with stand-ins, 12 checks; `runbook/restore-drill.md` is Friday's procedure with the expected observations. Written on Thursday evening while Marco was away, so that Friday's drill is a run and not a build.
- `.prettierignore` gains `.claude/worktrees`: the app keeps session worktrees inside the checkout (excluded from git locally, not through `.gitignore`), and `npm run check` was reading a built function bundle in one of them.
- Here: `docs/account-setup.md` section 6, the click path for the five values (backup key with `age-keygen`, Backblaze key and the two bucket rules, the direct Neon string, the heartbeat, the monitor); the runbook's Backups entry rewritten; ADR 0011 amended (14 days, not 30; one job per database); learning note 08.

### Why

The plan makes backups a week-one item that cannot follow later. The free tier's six-hour window is covered by two copies at two other vendors, each a file nobody can open without the backup key, and a heartbeat turns a backup that silently stops into a morning alert.

### How to verify

```
git clone git@github.com:m-under-over-through/world-builder-ops.git && bash world-builder-ops/scripts/test-backup.sh   # ok: 13 checks passed
bash world-builder-ops/scripts/test-restore.sh   # ok: 12 checks passed
```

Once the five values are set (section 6 of `docs/account-setup.md`): `gh workflow run backup.yml --repo m-under-over-through/world-builder-ops -f target=staging`, watch it under Actions, then `curl -s https://staging--worldbuilder-uot.netlify.app/api/health` shows `lastBackupAt` today, Backblaze shows today's folder, and the heartbeat is up.

### Decisions made on the way

- **14 days, everywhere, not 30.** The trust page says the last copies expire within two weeks of the deletion day; a 30-day artifact would have broken that by itself. Object Lock, the lifecycle rule and the artifact all say 14.
- **Deletion is stopped by the lock, not by the key.** Backblaze's console cannot make a key without the delete capability; the bucket's governance-mode lock is what no application key can override. The plan's "write and list, no delete" is delivered that way.
- **Plain SQL dumps.** A restore is `psql < file`, readable with `less`; size does not matter at a few megabytes.
- **The owner's string for staging, a `backup` role for production.** Staging's data is disposable and its string is already in the vault; production gets a role that can read, record a run and prune, and nothing else, so a leaked ops secret cannot alter participant data. The grants are on the Neon page.
- **No real database on the laptop.** The script runs against stand-ins here and against the real database only in Actions, where the connection string is. The first real run is the verification; it waits for Marco's values.
- **The AWS command line with two checksum variables** rather than Backblaze's own tool: it is on every runner, and the two variables are the known adjustment for Backblaze.
- **`RESTORE_URL`, not `DATABASE_URL`, for the drill.** The restore's target has its own name, so a line copied from the job can never point a restore at a live database, and the script refuses a database that already holds tables. The guard is in the name and the refusal, not in the operator's attention.

### Open

- **Staging could not reach its database from about 16:00 UTC.** Resolved the same evening: the Neon branch behind staging had expired on the console's one-day default, not a password change. The evening entry below has the cause, the fix and the corrected pages.
- The first real run, once the five values exist. Then Friday's restore drill into a scratch Neon branch and the decrypt drill with the key from the vault, both scripted now (`runbook/restore-drill.md` in the ops repository).
- Marco's first phone test of staging, two observations, to act on in week two's UX pass:
  1. **A link that cleaned itself lost the wave.** He opened the wave link on the Mac without starting, then opened the same tab on the iPhone through Safari's tabs from other devices. The client had replaced the address with `/rural-manufacturing/` on the Mac (so a reload would not count a second open, and so an invite token never lingers in the address bar), and that cleaned address is what Safari carried over. On the phone there was no wave, no stored arrival and no code, so the welcome screen could only say "open the link you were sent". The same happens to anyone who shares the page from the browser after opening it. Fix to decide: keep the wave in the address bar (a wave is not a secret) and count an open once per device instead of per load; keep cleaning only invite links.
  2. **The code reads as a puzzle.** The session end shows the code with Copy, but the place to type it, "I have a code", exists only on a device that has none; on the device that already remembers, there is nothing to paste into, which is correct and still confusing. To decide: say on the session-end screen what the code is for ("only if you open this on another device"), keep "I have a code" reachable from the privacy panel, and word the welcome screen for the three cases (link, code, neither). The architecture plan's position stands: only something the participant carries can prove a second device is the same person, and the code is that thing; the work is in the wording and the placement.

---

## 2026-10-29, Thursday, late afternoon. The wave link survives sharing; an open is counted once per device

### What

- **The wave link stays in the address bar.** The client no longer replaces `/<slug>/join/<wave>` with `/<slug>/` after it loads. A wave is not a secret (it is in a newsletter), so a copied address, the share sheet and Safari's tabs from other devices all still carry a link that joins. Only an invite link is still replaced, because its token works once and must not linger or travel.
- **An open is counted once per device.** The client asks the API to count the open only the first time this device arrives through this wave. The guard is the `arrival` the device's store already kept (the wave or invite of the first link opened): when the stored arrival is this wave, the open is not posted again. A reload, a later visit, or a returning participant following the newsletter link again adds nothing; a cleared browser, a "delete me", a second device, or a different wave counts as new. The wave's `opened_count` therefore means "devices that opened the link". Still no cookie and no address; still approximate.
- Where: `apps/web/src/lib/route.ts` gets the stored arrival's shape, `parseArrival` (reads the stored text back, and anything that is not what we wrote as no arrival) and `countsAsOpen` (the rule, one line, named so it can be tested and pointed at); `apps/web/src/App.svelte`, `onMount`, uses them. The comment on `waves.openedCount` in the schema, the funnel paragraph in the architecture plan (6.3), the screen map's two landing rows, the runbook's confirm line for `JOIN_WAVE_UNKNOWN`, and ADR 0006 (an amendment; the accepted text stays) now say what the number means.
- The API is untouched: the route, the rate budget and the query are the same; what changed is when the client calls it. No new error code. 122 tests (3 new, in `apps/web/test/deck-and-route.test.ts`).

### Why

Marco's first phone test of staging, this afternoon: he opened the wave link on the Mac without starting, then opened the same tab on the iPhone through Safari's tabs from other devices. Safari carried the cleaned address, which has no wave; the phone had no stored arrival and no code, so the welcome screen could only say "open the link you were sent". The rewrite existed so a reload would not count a second open and so an invite token never lingers. Counting per device keeps the first purpose without the rewrite; the second purpose only ever applied to invites.

### How to verify

```
npm run check                                   # 122 tests
npx vitest run apps/web/test/deck-and-route.test.ts   # the rule and the stored arrival
```

On the pull request's deploy preview (its API runs against the staging database):

1. Open `/rural-manufacturing/join/wave-1` in a fresh browser without starting. The address bar keeps the link. The browser's network tab shows one `POST /api/rural-manufacturing/waves/wave-1/opened`. Reload: no second post.
2. Copy the address from the address bar and open it on a phone, or in a private window. It shows "New here" and can join, and that device posts its own open.
3. On a device that has a code, open the wave link again: it lands on the next card, with no post.
4. An invite link still works once, and the address becomes `/rural-manufacturing/` as before.

The wave's `opened_count` is in the `waves` table, visible through the export tool or a query against staging. `/api/health`'s `eventsToday` counts events (answers and the like), not opens, so it does not move with this.

### Decisions made on the way

- **The guard is memory the device already had, not a new cookie or a new stored value.** The store already kept the arrival so the welcome screen knows which wave to join through; the same record answers "has this device opened this wave before". Nothing new is written to the device.
- **The rule is one line and still a named, tested function.** `countsAsOpen` is where the next person looks when the number surprises them; the test says in words what counts and what does not.
- **The stored arrival is read defensively.** `parseArrival` returns no arrival for damaged or foreign text instead of throwing inside `onMount`, which would have left the screen on "Loading…".
- **A device that arrived through an invite and later opens a wave link counts as an open for that wave**, and its arrival becomes the wave. Rare, and the number is approximate by design.
- **A failed post is not retried.** If the API is unreachable or the wave's budget is spent at that moment, the arrival is stored anyway and the open is lost. The counter is a rough funnel, and a retry queue for it would be more machinery than the number is worth.
- **ADR 0006 is amended, not rewritten**, in the style of the amendment to ADR 0011. The comment on `ROUTES.waveOpened` in `packages/contracts/src/api.ts` ("Called by the join page when it loads") is the integrator's to change; proposed in the pull request: "Called by the join page the first time a device opens this wave."

### Open

- Marco's second observation from the phone test, the wording of the code's screens, is a separate decision and is not touched here.
- This entry was written alongside the "Thursday afternoon" entry and merged after the evening and night entries; it sits here by its time of day.
- **The pull request's deploy preview did not build at first, and not because of this change.** The build's first step, `migrate.ts`, was refused by the staging database with `password authentication failed for user 'neondb_owner'`. The evening entry has the cause: the Neon branch behind staging had expired on the console's one-day default. Once it was recreated, an empty commit (20bf6f1) rebuilt the preview, which answered `dbReachable: true`. Before that, the four preview checks were run on the local stack instead: the worktree's client against `apps/api/dev.ts`, in the desktop app's browser. First open of the wave link: address kept, one `POST .../waves/wave-1/opened`, "New here". Reload: no post. Storage cleared (a second device): one post. After joining, the wave link again: "Card 1 of 4", no post. An invite link: address became `/rural-manufacturing/`.

---

## 2026-10-29, Thursday evening. Staging's database branch expired on a Neon timer; recreated

### What

- Found why staging lost its database at about 16:00 UTC: Neon's Create branch dialog ticks **Auto-delete: After 1 day** by default, and the `staging` branch of 28 October was created with that default in place. Neon deleted the branch, compute and all, a day later. From Netlify the vanished compute answered `password authentication failed for user 'neondb_owner'`, which is why the afternoon's diagnosis pointed at the password. Marco saw the default in the dialog, and the Branches page listed `production` alone.
- Ruled out before that: no secret in either repository, no workflow or script that talks to Neon's control plane, no Neon tool or key on the laptop. Neon's "new organization" email of 14:36 UTC is a lifecycle mail sent a day after the welcome mail of 14:34 UTC on 28 October; it changed nothing.
- Marco recreated `staging` (`br-muddy-pine-b58g7t0f`, parent `production`, Auto-delete set to never) and put the new string in the vault and in Netlify's `DATABASE_URL` under Deploy Previews and Branch deploys. Nothing was lost: staging held test data only, and the first deploy recreates the tables and reloads the workshop. The previews proved the Deploy Previews value at once: pull request 4's rebuilt preview answered `dbReachable: true` with the workshop loaded. The stable staging address stayed on the old deploy, because Netlify's Trigger deploy button builds the production branch, not `staging`; staging was rebuilt by fast-forwarding `staging` to `main` (1b74e9e), the documented way to refresh it.
- Docs corrected. `docs/account-setup.md` section 2 says to set Auto-delete to never. The runbook's Neon entry and the ops page `runbook/neon.md` give the real cause, the check (is the branch listed; Monitoring, System operations) and the fix, and the ops page carries the new branch id. `runbook/restore-drill.md` says to leave the one-day timer on the drill branch, where it is the right behaviour. Note 08 has the lesson under "What can go wrong".
- Pull request 4 got an empty commit (20bf6f1) so Netlify builds its preview again; pull request 3's preview rebuilt with this entry. Both previews build against the new branch and answer `dbReachable: true`.

### Why

A database branch with a timer is a new idea in this project: Neon treats a new branch as disposable unless told otherwise, and the console says so only in a dropdown. Production is the default branch, which Neon refuses to expire, so the real data was never exposed to this; every branch created by hand from now on needs the dropdown read.

### How to verify

- `https://staging--worldbuilder-uot.netlify.app/api/health` answers `dbReachable: true` and lists `rural-manufacturing` as open.
- The deploy previews of pull requests 3 and 4 build, and their `/api/health` says the same.
- In Neon, Branches, `staging` shows no expiry on its overview.

### Decisions made on the way

- **Auto-delete off for `staging`, on for `restore-drill`.** The drill branch is meant to vanish, and the timer is a second guarantee that it does. Staging and production are not.
- **An empty commit to retry a preview.** Netlify's Retry button lives in its console; a commit whose message says why is the same action, kept in the record.
- **Staging rebuilt by fast-forward, not from the Netlify console.** The morning entry already names fast-forwarding `staging` to `main` as the way to refresh the stable address; Netlify's Trigger deploy builds the production branch and cannot rebuild a branch deploy. Both runbook pages now say so.

### Open

- The compute id of the new `staging` branch, for `runbook/neon.md`: the `ep-` name on the branch's Computes tab, also the first label of the connection string's host.

---

## 2026-10-29, Thursday night. The first backup ran against staging; two fixes on the way; the backup key replaced

### What

- Marco completed section 6 of `docs/account-setup.md`: the backup key, the Backblaze writer key and the two bucket rules, Neon's direct string, the Better Stack heartbeat and monitor. Four secrets and one variable now exist in the ops repository.
- The first key pair was voided before use: the whole key file, secret line included, was pasted into the session, and a session transcript is not a vault. A new pair was generated with a command that shows only the public half (`age-keygen -o`), its public key set as `AGE_PUBLIC_KEY`, and the old file left for Marco to delete. Nothing had been sealed with the old pair.
- Three runs of `backup.yml` against staging, started by hand:
  1. Run 40963230115 failed in the dump: `pg_dump: error: aborting because of server version mismatch`, server 18.6, pg_dump 16.15. The install step had fetched client 18, but the runner's own PostgreSQL 16 answered through Ubuntu's `pg_wrapper`. Fix: the install step puts `/usr/lib/postgresql/18/bin` first on the path for the later steps and fails at once if the pg_dump there is not an 18.
  2. Run 40963527753 dumped and sealed both files, then Backblaze refused the upload: `Content-MD5 OR x-amz-checksum- HTTP header is required for Put Object requests with Object Lock parameters`. With the newer checksum types turned off, `aws s3 cp` sent neither. Fix: each file goes up with `aws s3api put-object --content-md5`, and the test's aws stand-in checks the MD5 against the body (`ok: 13 checks passed`).
  3. Run 40963927650, from the fix branch, went through: `dumping the database`, `sealed staging-database-20261029T221151Z.sql.gz.age, 2497 bytes`, `sealed staging-workshop-rural-manufacturing-20261029T221151Z.tar.gz.age, 0 events`, `uploading to world-builder-backups`, `recording the run`, `heartbeat sent`, `done: 2 sealed files`. Artifact `backup-staging-40963927650`, 3822 bytes, kept until 12 November. Staging's health now says `lastBackupAt: 2026-10-29 22:12:02`.
- Both fixes are ops pull request 2 (branch `pg-dump-18-on-path`, 9e1d1a0), with the runbook's two "what can go wrong" bullets rewritten to say what happened; note 08's bullets say the same.

### Why

The stubbed test proves the script's logic, not the runner or the vendors: the runner's path and Backblaze's Object Lock rule only show on a real run. Both failures stopped before anything was written, and the fix branch could be run with `--ref` before merging, so `main` never carried a job that was known to be broken.

### How to verify

- `https://staging--worldbuilder-uot.netlify.app/api/health` shows today's `lastBackupAt`.
- Actions in the ops repository: run 40963927650 green, with the seven log lines above; its artifact listed for 14 days.
- Backblaze, Browse Files, `world-builder-backups`: `staging/database/2026-10-29/` and `staging/workshops/rural-manufacturing/2026-10-29/` hold one `.age` file each.
- Better Stack: the heartbeat is up, after two failure pings from the first two runs.

### Decisions made on the way

- **MD5 in the request, not the newer checksums back on.** Backblaze's answer names both as acceptable; the MD5 is one line with `openssl`, works with the newer checksum types still off, and the service verifies the body against it.
- **Fix branch runs before the merge.** `gh workflow run --ref <branch>` runs the job from a branch with the repository's secrets, so a fix is proved on a real run before it reaches `main`. The schedule keeps running `main`, so ops pull request 2 should merge before the first night.

### Open

- Ops pull request 2 to merge before the nightly schedule, or the night's run fails the same way and the heartbeat alerts.
- Marco: delete `.secrets/backup.age.key` once the vault note and the two prints exist; confirm the Backblaze folders and the heartbeat; the compute id for `runbook/neon.md`.
- Friday: the restore drill from this backup, with the drill scripts of ops pull request 1; the decrypt drill from paper.

---

## 2026-10-30, Friday. Four pull requests merged; the restore drill, for real: staging deleted by mistake and brought back from the morning's backup

### What

- Morning: the four open pull requests merged with merge commits, in this order: ops 2 (the first-run fixes), ops 1 (the drill scripts), app 3 (the backup docs), app 4 (the wave fix; its build-log entry moved to its place by time of day on the way). The backup job then ran green from `main` (run 41074724799) and `staging` was fast-forwarded to the merged commit `a6b39f1`. The night's scheduled run had come at 14:18 UTC, seven hours after its 07:17 slot, and failed the first way, `main` not yet carrying the fix; the heartbeat alerted once.
- The drill, by hand, from `runbook/restore-drill.md` in the ops repository, now cloned at `~/Documents/Dev/world-builder-ops`. Step 1 from the bucket: Backblaze's browser download puts the folder path in front of the file name (`staging_database_2026-10-30_staging-database-20261030T144748Z.sql.gz.age`); the scripts read the suffix and did not mind. Step 2, the decrypt drill: the key typed from the printed copy, checked with `age-keygen -y` against `AGE_PUBLIC_KEY` (a match), then `opened ..., 7950 bytes` and `a database dump: 9 tables, 0 sealed answers`. Zero answers is right: staging had been recreated the evening before.
- Step 3 went wrong in the most useful direction. In Neon's branch list, meaning to create `restore-drill`, Marco deleted `staging`. Neon has no undo for a deleted branch. So the scratch database became the real thing: `staging` recreated from `production` with Auto-delete set to never, its direct string into `RESTORE_URL`, and `scripts/restore.sh` loaded the morning's dump: `loading 9 tables`, then `workshops 1`, `waves 1`, `participants 0`, `sessions 0`, `events 0`, `invites 0`, `backup_runs 2`, `rate_buckets 1007`, `events with a sealed body: 0; with any other body: 0`, `done: 9 tables restored`, five seconds from sealed file to counted tables. The comparison against the source could not run, the source being gone; the proof was the deploy and the health endpoint instead.
- The new string went into the vault, into Netlify's `DATABASE_URL` under Deploy Previews and Branch deploys, and into the ops secret `NEON_STAGING_URL`. The backup job run from `main` proved the secret at once (run 41084775381, the restored database dumped again). Staging's rebuild took three tries: the Trigger deploy button built production; the branch deploy's own Retry failed with `migrate: expected a postgres:// URL in this context`, the value under Branch deploys having been pasted in another shape than the plain string; pasted again as the plain `postgresql://` string, the retry built, and health answered `dbReachable: true` with the restored `lastBackupAt`.
- About an hour and a quarter from the first download to the green health line, the detour included.
- Docs: the runbook gains a Netlify entry for the `migrate: expected a postgres:// URL` message and the Trigger deploy button; note 08 records the drill. In the ops repository: `runbook/restore-drill.md` (the download's name, the "staging itself is gone" variant, the record of this drill), `runbook/netlify.md` (the same two lessons), `runbook/neon.md` (the new branch id).

### Why

A drill is for finding what the runbook got wrong before it matters, and this one found four things: the download's name, the Trigger deploy button, the shape of a pasted string, and that one wrong click in the branch list deletes a database with no undo. The restore itself was the part that could not be allowed to surprise anyone, and it did not.

### How to verify

- `https://staging--worldbuilder-uot.netlify.app/api/health`: `version a6b39f1`, `dbReachable: true`, `lastBackupAt` at 15:53 UTC on 30 October, `rural-manufacturing` open.
- Actions in the ops repository: runs 41074724799 and 41084775381 green; Backblaze holds two files under `staging/database/2026-10-30/`.
- Neon, Branches: `production` and `staging`, the latter with no expiry on its overview.

### Decisions made on the way

- **Restore into the recreated staging itself, not into a scratch branch.** The target was empty, the data disposable, and the point of the drill is "the database is gone". The drill page now describes this variant next to the scratch one.
- **The same click on `production` would be the same story**, with the day's answers since the last dump lost for real. Neon's protected branches prevent it and are on paid plans only; a decision for hardening week, with the price next to it.

### Open

- The heartbeat's grace period: the schedule drifted seven hours on its first night, which will trip a two-hour grace on an ordinary day. Suggested: about 12 hours. Marco's decision, one field in Better Stack and one line on `runbook/betterstack.md`.
- `rate_buckets` held 1007 rows after a day with no participants. What fills it, and whether the job's prune keeps it in check, is worth a look next week.
- Branch protection on `main`, and the walkthrough of the skeleton, still on today's list.
- The comparison run of the drill, against a live source, on the next drill day.

---

## 2026-10-30, Friday afternoon. The week-2 briefs, from an audit of the skeleton

### What

- `docs/briefs/`, new: a README with the rules every builder follows (from the plan's sections 3, 4 and 7), `week-2-plan.md` with the gap list, the file ownership table, the schedule as planned and a shortened variant, and the eight decisions Marco must take before Monday; and four briefs, one per stream: the deck engine (`packages/deck`, one day, first), the client (`apps/web`, the long pole, ten items in order), the API and database (done by Tuesday, six items), and operations (tools, runbook, scans, drills, eight items).
- The gap list comes from a read-only audit of `main` at df4a9cb against the plan's "ships by 15 November" list and the screen map, done by a separate agent so the briefs are not written from memory. The short version: the skeleton has the whole path and 122 tests; what is missing is the first-session screens, the deck rules, the wording (every string is hard-coded and errors show as raw codes), the trust page and policy pages, the failure behaviour for an unknown code and for offline join, a set of thin spots in the API's tests, and a runbook that still describes the plan in places rather than the code.
- The README map gains the `docs/briefs/` row.

### Why

The plan's week 2 is the parallel build, and its cohesion rules say the briefs are what keep parallel work coherent: one owner per file, contracts through the integrator, a test that defines done. Writing them from an audit rather than from the plan's list means they say what is actually missing, including things the plan did not foresee (the byte cap measuring the wrong unit, `JOIN_WAVE_CLOSED` unreachable, `rate_buckets` growing by the minute).

### How to verify

- Read `docs/briefs/README.md`, then `week-2-plan.md`, then the four briefs; the plan's section 4 lists the decisions.
- Check the gap list against the code where it makes a claim: `grep -rn "JOIN_WAVE_CLOSED" apps/api/src` finds no return; `apps/web/src/App.svelte` is the only component; `packages/deck` does not exist.

### Decisions made on the way

- **The deck engine is its own brief and package**, not part of the UI brief: pure logic with a contract and tests, one day, and the UI builder consumes it on Tuesday. The README has said `packages/deck` since the planning sprint.
- **The wording pass is the UI builder's first item**, before any new screen: once every string comes from `copy.md`, the partner can change words without a code change, and raw error codes stop reaching participants.
- **The briefs are written for the planned schedule** and mark what to cut if the timeline shortens, in order and with the cost of each cut; the decision stays with Marco and the partner.

### Open

- The eight decisions in `week-2-plan.md`, section 4, before Monday: timeline, `JOIN_WAVE_CLOSED`, the join limit, the look, who writes the policy texts, HSTS preload, the heartbeat grace, branch protection.
- The two contract changes the API brief relies on (`JOIN_WAVE_CLOSED` removed, the join comment corrected) are the integrator's and wait for decision 2.

---

## 2026-11-02, Monday. The eight decisions; the week starts

### What

- Marco answered the eight decisions of `docs/briefs/week-2-plan.md`; they are recorded in its section 4. In short: a complete working version for a demo on Friday 6 November, the week after for UX and UI with Marco and the partner, launch unchanged; `JOIN_WAVE_CLOSED` removed (pull request 7); the join limit raised to 120 per minute with a client retry; a designer's pass, warm, creative, informal, with the Impeccable design skills for the UI builder; the integrator drafts consent, terms and the privacy policy for Mechanism's legal review; no HSTS preload; the heartbeat grace at 12 hours (ops pull request 4); branch protection on.
- Branch protection on `main` in the app repository: pull requests only, the `check` workflow must pass, no force pushes, no deletion, no exception for administrators. GitHub's free plan refuses it on the private ops repository ("Upgrade to GitHub Pro or make this repository public"); the ops repository keeps the habit without the rule.
- The Impeccable design skills (`docs/services.md`) are installed per working copy, never committed: `.gitignore` and `.prettierignore` learn `.claude/skills` and `.claude/agents`. The UI brief carries the design direction and the commands to use.
- Better Stack paused the staging health monitor over the weekend "because it was down for too long" while staging answered `"ok":true` throughout and the nightly job ran on both days (six to seven hours late, as every day). The monitor's definition is the suspect, an inverted condition or a keyword that does not match `{"ok":true,`; Marco checks it in the console and unpauses it. The ops brief's Better Stack page gets the lesson once the cause is seen.
- The four builder sessions start today from the briefs: the deck engine first, the API, operations, and the client on the wording pass.

### Why

HSTS, for the record, since decision 6 asked for the explanation. The `Strict-Transport-Security` header tells a browser that has visited the site once to use HTTPS only for that host for the next year, so a later `http://` link or a downgrade attempt on a public network goes nowhere. That already holds for everyone after their first visit. `preload` goes one step further: the domain is submitted to a list compiled into browsers, so even the very first visit is HTTPS only. The price is that the list takes the registrable domain, `under-over-through.co`, with `includeSubDomains` required, so every present and future subdomain of the company's domain would be bound to HTTPS, and leaving the list takes months. Our app is one subdomain; the newsletter links are `https://` to begin with; so the gain is a first visit from a typed `http://` address, and the cost is a decision about the whole domain. Not worth it for this app. `includeSubDomains` on our own host is free (the app has no subdomains of its own) and goes in.

### How to verify

- `gh api repos/m-under-over-through/world-builder/branches/main/protection` answers with the rules; a push to `main` without a pull request is refused.
- `docs/briefs/week-2-plan.md`, section 4, has the eight answers.
- `git status` in a working copy after `npx -y impeccable@4.8.0 install --project --providers=claude-code --no-hooks -y` shows nothing to commit.

### Decisions made on the way

- **The design tooling is not committed.** It is a 60-kilobyte package plus a native binary per platform; each working copy installs it with one command, and the repository stays the app and its docs.
- **The policy texts are drafted by the integrator, not the UI builder**, in `docs/participant-texts.md`, so that the legal review has one file and the UI lays out whatever that file says.

### Open

- Merging during the week: with branch protection on, every pull request waits for the `check` workflow; the integrator merges after the independent review.
- The Better Stack monitor's definition, to be read in the console.

---

## 2026-11-02, Monday, late afternoon. Ops 2: pepper, migrate and workshop sync, tested

### What

- Twelve tests across three files, each running the tool as a separate process the way the build or the operator runs it, with a clean environment so the laptop's own variables never leak in.
- `tools/ops/test/pepper.test.ts`: the file holds 32 bytes in canonical base64 and a newline, mode 600 in a folder of mode 700; two runs give two peppers; the value is never on the terminal; a second run for the same name is refused with `refusing to overwrite` and the file is as it was; an unknown flag, a missing value, a stray word or a bad name is refused with the usage line and nothing written. The tool gains `--out <dir>` for the tests, the way `keygen` has it.
- `tools/ops/test/migrate.test.ts`: without `DATABASE_URL` it says `nothing to do` and exits 0; the eight wrong shapes (a `psql '...'` command, a `DATABASE_URL='...'` line, single or double quotes, a leading space, `pglite://`, another scheme, a bare word) are refused with the runbook's line `migrate: expected a postgres:// URL in this context`, a second line that says what shape is wanted, exit code 1, and the password in the test string never reaches the terminal; anything on the command line is refused with exit code 2. The tool itself gains the argument check and the second line; the first line stays what the runbook's Netlify entry quotes.
- `tools/workshop/test/sync.test.ts`: against a Postgres on disk, the staging context stores the staging key, its fingerprint and the early opening day with the folder's closing day and cap, opens the workshop and creates `wave-1`; a second run leaves one row and one `wave-1`; the production context stores the production key and the real opening day; a workshop put back to `draft` becomes `open` again and a `closed` one stays `closed`; a connection string in the wrong shape is refused without printing it; anything on the command line is refused. The tool gains the argument check and a comment on the status rule.

### Why

The brief's item 2. These three run inside the Netlify build (`migrate`, `sync`) or make a secret (`pepper`), and none had a test. The migrate refusal is the one that cost a deploy on 30 October; now its eight shapes are a test, and the build command cannot grow an argument by mistake.

## 2026-11-02, Monday afternoon. Ops 1: the export tool, tested; the key checked first; today's file never replaced silently

### What

- `tools/workshop/export.ts` gains three behaviours and six tests (`tools/workshop/test/export.test.ts`). The key is checked against the workshop before any row is read: the tool seals a probe to the workshop's public key and opens it with the key given, so another workshop's key is refused with `CRYPTO_OPEN_FAILED` and the workshop's fingerprint, and a malformed key file with `CRYPTO_BAD_PRIVATE_KEY`; nothing is written either way. The CSV is created exclusively (`flag: 'wx'`): a second export on the same day is refused with a line that names `--overwrite`, the flag that replaces it on purpose. Pseudonyms are handed out in a random order on every run, so two exports of the same workshop cannot be lined up by them and neither the server's ids nor the order of joining can be read back from the file.
- Two flags: `--out <dir>` (the tests use it; the default stays `.secrets/exports`) and `--overwrite`. Unknown flags, a bad slug, a missing key and a missing key file are refused with the usage line and exit code 2 before anything is opened.
- The tests seed a Postgres on disk (PGlite, in a temporary folder) with the real workshop folder sealed to a key made for the test, two or seven participants, an answered and a dismissed event each, then run the tool as the operator would, as a separate process, and read the file back: the eleven columns, every answer opened (one holds a comma, a quote, a newline and an emoji), one pseudonym per participant, `via` as the wave or `invite`, mode 600 on the file and 700 on the folder, no participant id and no code hash anywhere in the file or on the terminal, and no plain answer on the terminal.

### Why

The brief's item 1: the operator's tools must be tested and must not overwrite what they should not. The export is the one place answers are ever readable (ADR 0003), so its mistakes are the expensive ones: an export of the wrong workshop would have been a file of `[could not open]` rows found after the fact; a second run on the same day would have replaced the morning's file, scrub log and all. Fresh pseudonyms are what the architecture plan's section 14 promises in the hand-off package.

## 2026-11-02, Monday, midday. The participant texts, drafted for the legal review

### What

- `docs/participant-texts.md`, new: the consent screen (under 80 words), the terms, the privacy policy, the trust page's seven sections and the one-paragraph data management plan, written for a phone screen from the architecture plan's sections 6.4, 9, 13 and 14. Square brackets mark the three things the reviewers decide: a minimum age, the contact address, a governing law. The UI builder's first pull request creates the `copy.md` sections and later items take these drafts as they are; the words change when the review lands.

### Why

Decision 5 of today: the integrator drafts, Marco reviews with Mechanism's legal team, and the UI never waits for the words. One file, so the review has one thing to read and the client has one place to take the text from.

### How to verify

Read the file against the plan's sections it cites; every claim in it is a fact of the system (what the schema holds, what the headers forbid, the dates), not an intention.

### Decisions made on the way

- **"Locked" and "scrambled" instead of "encrypted" and "hashed"** in the participant-facing text, with the real terms one tap away on the trust page.
- **No promise about hosting logs.** The policy says the hosts may keep technical records under their own policies and that we do not receive them; the trust page's honest limit says why that is the truthful version.

---

## 2026-11-02, Monday afternoon. UI item 1: the component test harness and the copy loader

### What

- **The client reads its words from `copy.md`.** `apps/web/src/lib/copy.ts` parses `workshops/<slug>/copy.md` at build time (a raw import in `lib/workshops.ts`, one `Copy` per workshop folder): one block per `## heading`, looked up by name; `- key: value` lines as the entries of a list; a `[placeholder]` line stripped and remembered; `<!-- notes -->` to the editor never shown; `[word]` slots filled by the app (`fill`). A block the file lacks shows as `[missing: <heading>]` on the screen, never as silence. `App.svelte` has no participant-facing string left in it; every error code reaches the screen through its `Error: <CODE>` line.
- **`copy.md` grew from 9 blocks to 59**, every one a screen or a row the screen map names: titles, buttons, the three welcome cases, enter code, the card's labels and states, the session end for session 1 and for later sessions, closed and not open yet, the privacy panel's rows and caveat, diagnostics, the data management plan, terms, the privacy policy, the trust page's seven blocks, and one line per error code (17 server, 3 client). Consent, terms, the privacy policy, the trust page and the plan carry the drafts of `docs/participant-texts.md` word for word; everything else is placeholder text. All 58 drafts are marked `[placeholder]`, so `grep -c '^\[placeholder\]' copy.md` says how many blocks still wait for words.
- **The component test harness.** `@testing-library/svelte`, `@testing-library/user-event` and `jsdom`, development dependencies of the client only (ADR 0012 names the client libraries; a test harness loads nothing at runtime). The root `vitest.config.ts` now runs two projects: `node` for the packages, the API and the tools, as before; `web` for the client, whose own `vite.config.ts` names the Svelte plugin, the DOM and `test/setup.ts` (an in-memory IndexedDB). `apps/web/test/app.test.ts` renders `App.svelte` the way a phone would: the address picks the route, the device store is in memory, the API is a stub.
- Tests: the parser (headings, notes, paragraphs, lists, placeholders, comments, slots, the missing-block marker); every workshop folder has every heading and list entry the client reads, and a line for every error code; the welcome for a device with no link, a device arriving through a wave link (one `opened` post, the address kept), a wrong address, a code too short (no request), `AUTH_CODE_UNKNOWN` and `RATE_LIMITED` shown in their wording and never as the code, "Not open yet" with the day before the opening day and "closed" after the close day. 144 tests (22 new).
- `PRODUCT.md` at the root, written from the brief and the two plans as the brief asked (the Impeccable `init` step), without an interview: the facts the design skills read before any visual work.

### Why

The first item of the UI brief, because every later screen is text in a file the partner can edit, and because nothing rendered `App.svelte` in a test until now. Raw error codes in front of participants were a trust failure named in the gap list; they are gone.

## 2026-11-02, Monday. API, 1 of 6: the byte cap counts bytes

### What

- `apps/api/src/body.ts`, new. `readBodyBytes` reads the request body as a stream, chunk by chunk, adds up the bytes, and stops at the first byte over `MAX_REQUEST_BYTES`: the rest of the body is never read, and nothing over the cap is ever held in memory. A `Content-Length` header over the cap is refused before a single byte is read; a header under the cap is not trusted, the count on the stream decides. `parseJsonBytes` decodes the bytes as UTF-8 with `fatal` on and parses JSON; bytes that are not UTF-8 are not JSON (RFC 8259) and answer `REQUEST_INVALID` like any other non-JSON body.
- `apps/api/src/app.ts`: `readJson` uses the two. The comparison of `text.length` with the cap is gone.
- Tests. `apps/api/test/body.test.ts`: exactly the cap passes and one byte more does not; three two-byte characters are six bytes; a stream that never ends is stopped at the chunk that crosses the cap; a `Content-Length` over the cap is refused with no read and one under the cap is not believed; a request without a body is zero bytes; chunks are joined in order; bytes that are not UTF-8 or not JSON parse to nothing; multi-byte characters survive. `apps/api/test/app.test.ts`, on join: a `Content-Length` over the cap is 413; a body of two-byte characters, half the cap in length and one byte over it on the wire, is 413; a body of exactly the cap is read and answered by the contract (400); a body larger than its declared `Content-Length` is 413.

### Why

The week-2 gap list: the skeleton compared `text.length` with `MAX_REQUEST_BYTES` after reading the whole body, and a string's length counts UTF-16 units, one to three bytes each on the wire. A body of 600,000 four-byte characters weighed 2.4 MB and passed. The API builder notes in `CLAUDE.md` say to cap the body in bytes before parsing, because a schema can only bound what is already parsed. Item 1 of `docs/briefs/week-2-api.md`.

### How to verify

- `npx vitest run apps/api/test/body.test.ts apps/api/test/app.test.ts`: 28 tests pass; `npm run check` is green.
- On the deploy preview of pull request 10, with `curl`. Make a body one byte over the cap, made of two-byte characters, and post it:

  ```
  node -e 'process.stdout.write(`{"code":"${"é".repeat(499995)}"}`)' > big.json
  wc -c big.json            # 1000001
  curl -s -w '\n%{http_code}\n' -X POST -H 'content-type: application/json' --data-binary @big.json \
    https://deploy-preview-10--worldbuilder-uot.netlify.app/api/rural-manufacturing/join
  ```

  Expected: `{"error":"REQUEST_TOO_LARGE",...}` and `413`. The same with `"a".repeat(999988)` (one byte each, 999,999 bytes) answers `REQUEST_INVALID` and `400`: under the cap, the contract answers, not the cap. The preview proves the `Content-Length` path, since `curl` sends the header and the function host hands the body over in one piece; the streamed path, where the header is absent or wrong, is proved by the tests.

### Decisions made on the way

- **The reader is its own file with its own tests.** The cap is the one place where the API handles bytes rather than parsed values, and it should be readable on its own: twenty lines, no Hono in them.
- **A `Content-Length` under the cap is not trusted.** The header is the sender's claim; the stream is what arrived. Refusing early on a header over the cap is a courtesy to the sender, not the guard.
- **The stream is cancelled, not drained.** Once the cap is crossed the reader tells the stream it wants no more, so an endless body does not keep the function busy.
- **A body that is not UTF-8 is `REQUEST_INVALID`, not a new code.** The decoder's `fatal` flag makes "not UTF-8" the same failure as "not JSON", which is what it is.

### Open

- The remaining five items of the API brief follow as pull requests, each stacked on the one before.

---

## 2026-11-02, Monday. API, 2 of 6: one log line when a body fails the contract

### What

- `apps/api/src/log.ts`, new. A `Logger` with `warn` and `error` that the app takes as a dependency: the console in deployment (`consoleLogger`), an array in tests, so a test can read what was written and prove what was not. `validationLine` builds the one line for a refused body: the route as written in `ROUTES` (`POST /api/:slug/join`, so never a slug or a wave), the error code, and where in the body the contract was not met, as paths of our own field names and array positions with Zod's issue code. Example: `SYNC_PAYLOAD_INVALID POST /api/:slug/sync: events.2.body (invalid_format), events.2 (unrecognized_keys)`. A body that is not JSON gives `body is not JSON`. More than 20 issues become ", and N more".
- `apps/api/src/app.ts`: join and sync write the line through `log.warn` before answering `REQUEST_INVALID` or `SYNC_PAYLOAD_INVALID`. `AppDeps.log` is optional; the function and `dev.ts` use the console.
- Tests. `apps/api/test/log.test.ts`: the line names the route, the code and the field paths with the issue kind and nothing else; an unknown key is pointed at by the object that holds it, never by name (a code hidden in a key and an email address stay out); array positions let the reader count to the bad event; the not-JSON line and the cap. `app.test.ts`: a refused join writes one line, equal to the expected text, carrying neither the code, its hash, the wave text, the extra field's name or value, nor the slug; a non-JSON body writes the one line that says so; a refused sync batch writes one line carrying none of the code, its hash, the session id or seed, the event id or body, the card id, the extra field or its value.

### Why

The runbook's `REQUEST_INVALID` and `SYNC_PAYLOAD_INVALID` entries tell the reader to look at "the validation issues in the log line", and the gap list found no line. The non-negotiable is that no log line carries a value from a request; the way to keep that true is to decide once what a line may contain (paths of our own names, positions, Zod's issue kinds) and to have a test read every line the app writes. Item 2 of `docs/briefs/week-2-api.md`.

### How to verify

- `npx vitest run apps/api/test`: 42 tests pass; `npm run check` is green.
- On the deploy preview of pull request 11: post a join with an extra field and read the function log.

  ```
  curl -s -X POST -H 'content-type: application/json' \
    -d '{"code":"1234567890123456","wave":"wave-1","emailAddress":"x@y.z"}' \
    https://deploy-preview-11--worldbuilder-uot.netlify.app/api/rural-manufacturing/join
  ```

  Expected: `{"error":"REQUEST_INVALID",...}`; in Netlify, Deploys, this preview, Functions, `api`: one WARN line `REQUEST_INVALID POST /api/:slug/join: (root) (unrecognized_keys)`, with nothing of the body in it.

### Decisions made on the way

- **Paths and issue kinds, not messages and not keys.** Zod's message for an unknown key quotes the key, and a key is text the client chose: `{"1234567890123456": 1}` would put a code in the log. The line points at the object that holds the unknown key and says `unrecognized_keys`; the reader opens the contract and sees which keys that object allows.
- **The route pattern, not the path.** `POST /api/:slug/join` is the same text for every workshop; the path would carry the slug and, on the wave route, the wave. Neither is personal, but a line that varies with the request invites a reader to grep for a participant.
- **The logger is a dependency, not a module import.** Tests that read `console` output are brittle and would see lines from other tests; an array passed in is exact. The function passes nothing and gets the console.
- **One line, capped.** A batch of 200 events with the same mistake is one line with 20 paths and "and 180 more"; the first path tells the reader what is wrong.

### Open

- Drizzle wraps a failed query in `DrizzleQueryError`, whose message is `Failed query: <sql> params: <params>`, and the params of a failed insert are code hashes and sealed bodies. The `SERVER_ERROR` line still logs the error object. Item 3 tests that line and will make it carry the error's name, the SQL with its placeholders and the stack, never the params.

---

## 2026-11-02, Monday. API, 3 of 6: every row of the error table tested over HTTP; the SERVER_ERROR line without query parameters

### What

- Tests for the rows the table lacked, each named as a behaviour, in `apps/api/test/app.test.ts`: the route table (every entry of `ROUTES` is served; twelve unlisted paths and wrong methods answer 404 with a contract body); a participant of a workshop past its close day gets `WORKSHOP_CLOSED` on sync, me, invites and delete, and the rows stay; `JOIN_WAVE_UNKNOWN`, `JOIN_WAVE_FULL` (a workshop with a cap of one) and `JOIN_INVITE_INVALID` on join; the same batch twice is accepted twice with the same ids and stored once; a sync body over the byte cap is `REQUEST_TOO_LARGE` and nothing of it is stored; a database failure mid-request answers `SERVER_ERROR` with an errorId that matches one log line. A last test reads the test sources and fails if any key of `ERROR_CODES` is asserted nowhere.
- `apps/api/test/limits.test.ts`, new: one test per bucket, each on its own database, with the 429 body checked against `errorResponseSchema`: health at 60 a minute for everyone; wave opens at 120 a minute per workshop; joins at 30 a minute per workshop, another workshop unaffected; unknown codes at 30 a minute per workshop, a real participant unaffected; an authenticated code at 60 a minute on its own, another code unaffected; the next minute allows again.
- `apps/api/test/helpers.ts`, new: the real workshop, the test pepper, a clock the test moves by day and by minute, a fresh database with the workshop open, and an app on it whose log lines land in an array.
- Two code changes. `GET /me` answers `WORKSHOP_CLOSED` past the close day, as sync, invites and delete already did. The `SERVER_ERROR` line is built by `serverErrorLine` in `log.ts` and goes through the Logger: the errorId, the error's class, the SQL with its `$1` placeholders, the cause's message and the stack frames; the parameters of a failed query and the stack's header are cut out.

### Why

The brief's "tests that define done": every row of the error-code table over HTTP. Writing them found the two code changes. The screen map shows a closing screen on `WORKSHOP_CLOSED` and the trust page says the rows can be seen and deleted "any time until 6 December", so `me` past the close day should say closed, as delete did; before, it kept answering the data. And Drizzle's query error carries the query's parameters in its message, which for our queries are code hashes, bucket keys built from them, and sealed bodies; the skeleton logged the error whole, so a database failure in the limiter would have put a hash in the function log. Item 3 of `docs/briefs/week-2-api.md`.

### How to verify

- `npx vitest run apps/api/test`: 58 tests; `npm run check` is green.
- On the deploy preview of pull request 15, `P=https://deploy-preview-15--worldbuilder-uot.netlify.app`:
  - `curl -s -w '\n%{http_code}\n' -H 'Authorization: Code 1234567890123456' $P/api/rural-manufacturing/me`: `AUTH_CODE_UNKNOWN`, 401, nothing else in the body.
  - `curl -s -w '\n%{http_code}\n' $P/api/rural-manufacturing/join`: `WORKSHOP_UNKNOWN`, 404; `GET` on join is not a route.
  - `curl -s $P/api/health`: `ok`, a seven-character `version`, `dbReachable`, `lastBackupAt`, `eventsToday`, `workshops` as slug and status.
  - A 429 without touching anyone else's bucket: join a test code on the preview, call `me` with it 61 times, read the body of the last call, then delete the code. The exact commands are in the pull request. Do not use health for this: a preview shares the staging database, so its buckets are staging's, and the monitor would see staging's health answer 429 for the rest of the minute.

### Decisions made on the way

- **Drop the table, do not mock the failure.** `db.execute('drop table rate_buckets')` under a running app makes the limiter's upsert fail with a real Drizzle error carrying real parameters, the bucket key built from the hash among them. The test then proves the line has the id and the SQL and not the hash. A mock would prove what the mock was told.
- **The SQL stays in the line, the parameters go.** The SQL is ours, with placeholders; it tells the reader which query failed. The cause's message stays too: a Postgres primary message names the relation or the constraint and keeps values for its detail field, which is not logged.
- **One database per limit test.** The clock is fixed inside a test file, so a bucket filled by one test would be full for the next; a fresh PGlite costs a third of a second.
- **Every code must be asserted somewhere.** The last test is a guard on the table itself: a code added to the contract without an HTTP test fails the suite, the way the runbook test fails on a code without a heading.
- **The test helpers are a file, not a copy.** Item 4's authorization tests need the same setup; one helpers file keeps the two files about behaviour.

### Open

- Whether `GET /me` should stay readable between the close day and the delete day, for the privacy panel's "what we store": the docs say no, the integrator confirms (pull request 15's report).
- "Today" is the UTC day, so the window closes at 7 pm Eastern on 6 December: accept, or set `closesDay` a day later. Marco's call; in the report.
- Two words for the glossary, bucket and budget; the runbook proposals for nine entries; in the report.

---

## 2026-11-02, Monday. API, 4 of 6: the authorization boundary between participants, over HTTP

### What

- `apps/api/test/authorization.test.ts`, new, eight tests on the helpers of item 3. Code A against participant B: A cannot write into B's session through `/sync` (nothing accepted, B unchanged, and the response does not say why); A cannot read B through `/me`; A cannot spend B's invites; A cannot delete B. Invites under replay: an invite spent twice at once is spent once, one join, one `JOIN_INVITE_USED`, one invite paid; a third try is still refused and the guest's rows carry nothing of the issuer. A code from one workshop in another: `AUTH_CODE_UNKNOWN` on me, sync, invites and delete, the home workshop untouched; the same code joined in two workshops is two participants, and deleting one leaves the other.
- No code changed. The queries already scope every read and write by participant and workshop; `packages/db/test/scoping.test.ts` proved it at the query level, and these tests prove it through the header, the hash and the routes.
- `main` merged in: the participant texts; the two build-log entries of the day sit in time order.
- The manual authorization test of the architecture plan, section 12, is written out as `curl` steps with expected answers in pull request 18, proposed for the runbook's Netlify entry.

### Why

Section 12's pre-launch list names "a manual authorization test (code A cannot read, write or delete participant B), invite replay and over-use tests". A test over HTTP is the manual test run on every push; the written sequence is for the day someone wants to see it with their own eyes on staging. Item 4 of `docs/briefs/week-2-api.md`.

### How to verify

- `npx vitest run apps/api/test/authorization.test.ts`: 8 tests; `npm run check` is green, 164 tests.
- By hand: the sequence in pull request 18, on staging or on its deploy preview (`https://deploy-preview-18--worldbuilder-uot.netlify.app`, which shares staging's database). In short: join A and B; B stores a session; A's sync into that session answers empty accepted lists; A's `me` shows nothing of it; A's delete leaves B's `me` intact; B's invite used twice gives one join and one `JOIN_INVITE_USED`.

### Decisions made on the way

- **Two joins in flight through `Promise.all`, not one after the other.** PGlite runs one statement at a time, but the two requests interleave at every `await`, so the test exercises the single-statement claim on the invite (`update ... where used = false returning`) that protects Neon too.
- **The response stays silent on why.** `syncBatch` accepts an id only if the row exists afterwards under this participant, and the response lists what was accepted and nothing more; a reason would tell A that B's session exists. The test asserts the empty lists and nothing else in the body.
- **The manual test is proposed for the runbook, not added to it.** `docs/runbook.md` is the ops builder's file this week.

### Open

- Whether the runbook gets the sequence as a paragraph in the Netlify entry or as its own heading (a heading with spaces does not trip the one-word-heading test).

---

## 2026-11-02, Monday. API, 5 of 6: the limiter prunes its own rows

### What

- `apps/api/src/app.ts`: every hundredth rate-limit check on a function instance (`PRUNE_EVERY_CHECKS`) deletes the buckets older than an hour in one statement, before the request is answered. A failed prune is logged as `rate_buckets prune failed: <error>` and never fails the request. The nightly job's prune stays as the backstop.
- `packages/db/src/queries.ts`: `pruneRateBuckets` returns how many rows it deleted; `countRateBuckets`, new, for the tests and later the status command.
- Tests. `packages/db/test/health-and-rate.test.ts`: pruning removes the buckets older than an hour, keeps the last hour's, says how many went; the pruned minute is allowed again while the kept one still counts. `apps/api/test/limits.test.ts`: every hundredth check deletes the old buckets, so one health call every two minutes for 200 minutes leaves 99 rows before the hundredth call and 31 after it; refused requests count towards the prune too, so a flood of 100 calls with one code (60 allowed, 40 refused) leaves one row and removes the join's rows from 90 minutes earlier.

### Why

The restore drill of 30 October counted 1007 `rate_buckets` rows after a day with no participants, and the build log asked what fills it. The answer: one row per route, subject and minute, from the monitor alone, deleted only at night. The brief offered two ways: prune on the way, or leave it to the job and document the bound. Pruning on the way was recommended and is what landed. **The bound:** a bucket busy for a whole hour owns 60 live rows, and at most 100 rows are written between prunes, so the table holds about 60 rows per bucket busy in the last hour, plus a hundred. A quiet night: about 60 to 160 rows, against 1007. Item 5 of `docs/briefs/week-2-api.md`.

### How to verify

- `npx vitest run apps/api/test/limits.test.ts packages/db/test/health-and-rate.test.ts`: 10 tests; `npm run check` is green, 166 tests.
- By hand, on the deploy preview of pull request 21, which shares the staging database: in Neon's SQL editor on the `staging` branch, `select count(*), min(window_start) from rate_buckets;` and note both. Join a test code on the preview and call `me` with it 100 times (60 answer 200, 40 answer 429, all count), then delete the code; the commands are in the pull request. The query again: `min(window_start)` is under an hour old and the count has dropped to the last hour's rows. If not, the hundred calls were spread over more than one function instance; run the loop again.

### Decisions made on the way

- **On the way, with the job as backstop.** The prune is one `delete` on rows the limiter itself wrote, bounded by the request rate, and it keeps the table legible on Neon at any hour. The job still runs because a function instance that handles fewer than a hundred checks before it is recycled never prunes.
- **Count checks, not requests.** The counter sits in `limited`, which every route calls once or twice; "every hundredth check" is "about every hundredth request" and one place in the code.
- **Refused requests count too.** A flood that trips the limiter is exactly when the table fills; it should also be when it is cleaned.
- **A failed prune is a log line, not a failure.** The participant's request has nothing to do with housekeeping; the line names the error and nothing from any request; the job catches up at night.
- **A count query rather than raw SQL in the test.** `countRateBuckets` is three lines and the operator's status command will want it too.

### Open

- The ops builder's backup job calls `pruneRateBuckets`, which now returns a number; nothing breaks, and the job could log it.
- Whether the words "bucket" and "budget" enter the glossary (pull request 15's proposal).

---

## 2026-11-02, Monday. API, 6 of 6: joins at 120 a minute; a 429 says how long to wait

### What

- `apps/api/src/app.ts`: `LIMITS.join` is 120 a minute per workshop, with Marco's decision 3 and its reasoning in the comment above the table. Every `RATE_LIMITED` answer carries a `Retry-After` header with the seconds left in the current minute, 1 to 60; the body is unchanged.
- Tests in `apps/api/test/limits.test.ts`: the 121st join in a minute is refused and another workshop keeps its budget; a newsletter minute (the clock at 12:00:45, 120 readers join, the 121st is refused with `Retry-After: 15`, waits, and joins); 121 joins with the same code cost one participant row (200, 119 times 409, then 429); health's 61st call on the minute says `Retry-After: 60`; every bucket's 429 is checked for a `Retry-After` between 1 and 60.

### Why

Decision 3 of 2 November (`docs/briefs/week-2-plan.md`, section 4): with 30 a minute, the thirty-first reader to open the newsletter in the same minute would have seen an error on the consent screen and had to tap again; with 120 and one retry, nobody sees anything but a pause. The cap of 150 per wave stays the bound on how many join at all; the per-minute number sets the pace. The decision says the client retries "after the server's wait", and the standard way for a server to say how long that is (RFC 9110, `Retry-After`) costs one header and spares the client a guess: it waits until the minute turns, when every bucket starts again. Item 6 of `docs/briefs/week-2-api.md`.

### How to verify

- `npx vitest run apps/api/test/limits.test.ts`: 9 tests; `npm run check` is green, 168 tests.
- On the deploy preview of pull request 23: 121 joins with one made-up code within a minute answer `200`, then `409` 119 times (the limiter runs before the body is read, so a refused join counts), then `429` with `retry-after: <1 to 60>`; then `DELETE /me` with that code. The commands are in the pull request. The join budget is per workshop and the preview shares staging's database, so staging's own joins are refused for that minute too; do it when nobody is trying staging.

### Decisions made on the way

- **`Retry-After` on every 429, not only on join.** One line in `fail`, the same header for every bucket, and the sync and health clients can use it too. The value is the rest of the minute, because that is when the bucket resets; the client has nothing to compute.
- **The scenario is a test.** "120 readers join, the 121st waits 15 seconds and joins" is the sentence of the decision, run against the real app with a clock set to 12:00:45.
- **The by-hand check uses one code.** 121 joins with distinct codes would leave 120 participant rows on staging; with one code, the limiter still counts every request, and one row is deleted at the end.

### Open

- The UI brief names the silent retry on `JOIN_CODE_TAKEN` but not the one retry on `RATE_LIMITED` with `Retry-After`; the integrator relays it to the UI builder (in the report of pull request 23).
- The six API pull requests are open: 10, 11, 15, 18, 21, 23, each stacked on the one before. The runbook proposals from all six are in their reports, for the ops builder.

## 2026-11-02, Monday evening. Ops 3: the runbook describes the code; the services section written

### What

- Every one of the eighteen entries that said _Provisional_ was read against `apps/api/src/app.ts`, `netlify/functions/api.mts`, `apps/web/src` and `packages/crypto`, and rewritten to say what the code does today. Where the code does not yet do what the plan says, the entry says so and names the builder's item that changes it, so the runbook never describes a behaviour that cannot be seen. The mark is gone from the file; the introduction now says when the check was made.
- The six entries the brief singled out: `WORKSHOP_UNKNOWN` no longer points at a `/api/<slug>/health` route that does not exist (the health listing of slugs does the job, and any unknown path answers this code); `WORKSHOP_CLOSED` covers both ends of the window and the status, and the staging file's earlier day; `JOIN_WAVE_UNKNOWN` says the deploy creates `wave-1` only; `REQUEST_INVALID` and `SYNC_PAYLOAD_INVALID` say nothing is logged today and name the API builder's log line; `CLIENT_STORAGE_UNAVAILABLE` says the client does not produce it yet and names the UI builder's item 9.
- The rest: `REQUEST_TOO_LARGE` (the two checks, the unit the API builder changes), `JOIN_WAVE_FULL` (the cap can be exceeded by one or two), `JOIN_INVITE_INVALID` and `JOIN_INVITE_USED` (hashes compared as strings; one statement claims an invite), `JOIN_CODE_TAKEN` (no log line; the client's retry is the UI builder's item 4; an invite is spent by the collision), `AUTH_CODE_MISSING` (what the header must look like, which routes carry it), `AUTH_CODE_UNKNOWN` (after a reset or a restore; the per-workshop limit on unknown codes; what the client does today with a stored code), `SYNC_BATCH_TOO_LARGE` (the numbers, checked before validation), `INVITES_EXHAUSTED` (existing participants are not topped up), `RATE_LIMITED` (the five buckets with their numbers, decision 3 pending in the API builder's item 6, the rows in `rate_buckets`), `SERVER_ERROR` (the log line's shape and where to read it within the day), `CLIENT_SEAL_FAILED` (a crypto error shows its own code; this one is for everything else), `CLIENT_SYNC_FAILED` (`offline` against `error`, Netlify's own 502 page), `CRYPTO_BAD_PRIVATE_KEY` and `CRYPTO_OPEN_FAILED` (the export's key check of ops item 1). The Netlify build entry mentions migrate's second line (ops item 2).
- The services section replaces "To be written" with an introduction and one entry per service: Netlify and Neon lose their mark and gain their cost, login, failure and ops page; Backblaze, Better Stack, GitHub, Bitwarden and Google Workspace are new, each with where the login is, what it costs, what breaks without it, how to move off it, and its page in the ops repository. The three pages that did not exist, `runbook/github.md`, `runbook/bitwarden.md` and `runbook/google-workspace.md`, are an ops pull request of the same evening.

### Why

The brief's item 3: the runbook must describe the code as it is, not as it was planned. Half the entries were written on 23 October before any handler existed; four of them told the reader to look for a log line or a route that is not there. An operator following those on a bad night would have lost time on the runbook itself.

### How to verify

- `npm test -- packages/contracts/test/runbook.test.ts` (every code has a heading); `grep -c Provisional docs/runbook.md` prints 0.
- Pick an entry and check its claim against the file it names, for example `RATE_LIMITED` against `LIMITS` in `apps/api/src/app.ts`, or `CLIENT_SYNC_FAILED` against `apps/web/src/lib/api.ts` and `sync.ts`.
- On the deploy preview: `curl -s https://deploy-preview-<n>--worldbuilder-uot.netlify.app/api/nope` answers `WORKSHOP_UNKNOWN`, as the entry now says; `curl -s -X POST .../api/rural-manufacturing/join -H 'content-type: application/json' -d '{}'` answers `REQUEST_INVALID` with no log line in the function's log.

### Decisions made on the way

- **An entry names the builder's item when the code lags the plan**, instead of describing the plan as if it were built or leaving the behaviour out. Three such places: the validation log line (API item 2), the byte cap's unit (API item 1), the storage fallback and the stored-code behaviour (UI item 9). When those land, the sentence is removed; the API and UI builders' reports propose the wording and the ops builder applies it.
- **The join limit is written as the code has it (30) with decision 3 next to it (120)**, because the number in the file is the number participants meet until the API builder's change merges.
- **Vendor pages for GitHub, the vault and the mail** rather than longer runbook entries: the public runbook says what and why, the private page names the identifiers, as the other vendors already do.
- **Three forward references** (`runbook/scans.md`, `runbook/staging-reset.md`, `runbook/laptop-is-gone.md` in the ops repository) are left in, since items 4, 5 and 6 create them this week; the pull request says so.

### Open

- The API builder's and UI builder's runbook proposals, from their reports, are applied when the integrator passes them on.
- Better Stack's paused staging monitor: the cause goes on `runbook/betterstack.md` once seen in the console.

## 2026-11-02, Monday, early afternoon. The deck engine, item 1: the session plan and the seeded shuffle

### What

- **`packages/deck` exists**, the package the README has listed since the skeleton. It is pure functions, no I/O: plain data in, a plan out. This pull request is item 1 of the deck brief (`docs/briefs/week-2-deck.md`): `planSession` and the seeded shuffle. Item 2, `applyDismiss` and `isSessionOver`, follows in the next pull request.
- **`planSession(input)`** takes the deck, `warmupsPerSession`, `checkpointsPerSession`, the session's seed, the set of card ids ever answered and the list of card ids deferred in the previous session, and returns `{ queue }`: the card ids of the session, in order. The rules of the architecture plan, section 8: deferred cards first, in the order they were deferred, each counted against its set; then warm-ups up to W, then checkpoints up to C, each set shuffled by the seed, never-answered cards before answered ones, answered ones only when the set's unanswered cards have run out; never the same card twice in a session; a small deck gives what it has.
- **The seeded shuffle**, in `packages/deck/src/random.ts`: FNV-1a turns the seed string into a 32-bit number, mulberry32 turns that into a stream of numbers, and Fisher-Yates turns the stream into an order. Written in the package, no dependency, about thirty lines in all. Learning note 09 explains the idea and the three steps.
- 32 tests in `packages/deck/test/`, named as behaviours: same seed same order; different seeds differ; warm-ups before checkpoints; counts respected; unanswered preferred; cycling when a set is exhausted; deferred first, in order, counted against the set, more than the count all shown, unknown ids skipped, duplicates once; small deck; empty history; counts of zero and counts that are not whole numbers; file order irrelevant; no repeat over forty seeds and three histories; inputs untouched; the real workshop deck; the published answers for the hash and the generator; a fairness check over three thousand seeds; the worked example. 154 tests in the repository.
- Outside the brief's files: the lock file gains the workspace link for the new package (`npm ci` in CI refuses a lock that does not match), `docs/learn/09-seeded-shuffle.md` and its row in the notes' index, because `CLAUDE.md` asks for a note when a change brings an idea the operator has not met here, and this entry.

### Why

The skeleton picks cards in file order, so every participant sees the same first four cards and a resumed session cannot know where it was. Section 8 asks for a seeded shuffle so that a stored seed replays a session, and for the three rules about deferred, unanswered and answered cards. The UI builder picks the package up on Tuesday and replaces `apps/web/src/lib/deck.ts` with it; until then the client is untouched.

### How to verify

```
npm run check                                  # 144 tests, svelte-check included
npx vitest run --project web                   # the client's 41 tests alone
grep -c '^\[placeholder\]' workshops/rural-manufacturing/copy.md   # 58
```

On the pull request's deploy preview, in a fresh browser: open `/rural-manufacturing/join/wave-1`; "New here" and "I have a code" are there. Tap "I have a code", type 15 digits, Continue: "That is not a 16-digit code yet." Type a sixteenth digit, Continue: "That code is not ours. Check the digits." (no code anywhere on the screen). Back, New here: the consent screen carries the draft from `docs/participant-texts.md`. I understand, answer one card, set aside three: the session end, the masked code, "Come back another day for the next cards.", "Everything is synced." Your privacy: every row's label is from `copy.md`. Open `/nowhere/`: "This address is not a workshop. Use the link you were sent."

### Decisions made on the way

- **Blocks are looked up by heading, and the headings are the client's.** `COPY_TEXT` and `COPY_LISTS` in `lib/copy.ts` are the list of what the client reads; a test fails for any workshop folder that lacks one. Renaming a heading is a code change; rewording a block is not, and no test breaks on it, because the tests read the wording through the same loader.
- **Notes to the editor are HTML comments**, so the file can say under a heading when a block is shown without the app ever showing that sentence.
- **The "three cases" on Welcome are read as three blocks of wording**: next to "New here" when a link is remembered; next to "I have a code", always; in place of "New here" when nothing is remembered. A fourth block, "code not accepted", waits for item 9.
- **Before a workshop is known** ("Loading…", "not a workshop") the first workshop folder's copy serves; those words are the same in every folder.
- **The root `vitest.config.ts` is edited**, outside the brief's file list, because the Svelte plugin and the DOM have to reach the test runner somewhere; the change is the two-project split and nothing else.
- **`apps/web/test/deck-and-route.test.ts` reads files by path, not URL**: the client's tests now run in a DOM whose `URL` class is not the one `node:fs` accepts.

### Open

- **The local API refuses joins before 16 November.** `apps/api/dev.ts` does not pass `workshop.staging.json`'s opening day to `syncWorkshop`, so a join on the laptop answers `WORKSHOP_CLOSED` today while the client, which reads the staging day, shows the welcome. The by-hand check above was run against a copy of `dev.ts` with `opensDay: staging.opensDay` added; the file is the API builder's, so the fix is proposed in the pull request's report.
- The session-end text under "Session end: your code" begins with "That is a session.", which is also the screen's title, so the words appear twice. A wording question for Marco, not a code change.
- The buttons' labels sit in a `<span>` inside the primary button (a styling habit of the skeleton); the visual pass of item 10 removes it.
  npm test -- tools/ops tools/workshop/test/sync.test.ts # 12 tests
  DATABASE_URL="psql 'postgresql://x:y@h/db'" node tools/ops/migrate.ts # refused, exit 1, nothing printed but the two lines
  node tools/ops/pepper.ts demo --out /tmp/wb-pepper && node tools/ops/pepper.ts demo --out /tmp/wb-pepper # second run refused

```

### Decisions made on the way

- **A new workshop reports `draft -> open`, not `new -> open`.** The tool reads the row after the upsert, so the row is already there in `draft`; the test says what happens rather than changing the tool to say `new`.
- **`migrate` prints a second line, not the value.** The shape of a pasted string was the whole diagnosis on 30 October; the line now says "nothing in front of postgresql://, no quotes around it" and nothing else.
- **Clean environment in the tests.** The tools read `DATABASE_URL` and `VITE_WB_ENV`; a test that inherited the laptop's environment could pass or fail for reasons outside the repository.

### Open

- Nothing from this item.
  npm test -- tools/workshop/test/export.test.ts # 6 tests
  npm run dev:api # once, so .secrets/local-db exists with the workshop loaded
  node tools/workshop/export.ts rural-manufacturing --key .secrets/dev-rural-manufacturing.private-key
  node tools/workshop/export.ts rural-manufacturing --key .secrets/dev-rural-manufacturing.private-key

```

The first run prints the counts and `written to: .../.secrets/exports/rural-manufacturing-<today>.csv`; the second ends with `refusing to overwrite ... pass --overwrite if you mean to replace today's export` and exit code 1, and the file is as it was. With `--key` pointing at any other key file: `CRYPTO_OPEN_FAILED: this key does not open answers sealed to rural-manufacturing (workshop key de7f-523e-d6db-ad50) ...`, exit code 1, no file.

### Decisions made on the way

- **The key check uses the crypto package's public functions only.** Sealing a probe to the workshop's public key and opening it proves the pair without a "public key from private key" helper, which `@wb/crypto` does not export and which this builder does not add.
- **Pseudonyms in random order, rows grouped by pseudonym.** The earlier export numbered participants in the order of their server ids, so two exports gave the same mapping. `joined_day` stays a column, so nothing the partner needs is lost; what is lost is the link between exports, on purpose.
- **`--overwrite` removes the old file and still writes exclusively**, so a symlink planted at the path is removed rather than followed.
- **Per-row failures stay non-fatal.** Once the key is proved, a single envelope that will not open is a corrupt row, reported in the file and counted on the terminal, not a reason to stop the export.

### Open

- The runbook's `CRYPTO_OPEN_FAILED` and `CRYPTO_BAD_PRIVATE_KEY` entries describe the export's old behaviour (a `[could not open]` row per envelope). They are rewritten in ops item 3 with the rest of the runbook.
- The README's `tools/workshop` row names `keygen`, `sync` and `export`; the `--out` and `--overwrite` flags change nothing there. A proposal for the integrator comes with item 7.
  npm run check # typecheck, 154 tests, formatting
  npx vitest run packages/deck # the 32 tests of the engine alone

```

The worked example, which the last test pins: a deck of six cards, four warm-ups (`tuesday-night`, `on-tv`, `embarrassing`, `cool`) and two checkpoints (`immigrants`, `rich-poor`), counts 3 and 1, seed `example`, no history. The plan is `cool, on-tv, embarrassing, immigrants`. The same call gives the same plan every time; seed `other` gives `cool, embarrassing, on-tv, rich-poor`. With `tuesday-night`, `on-tv` and `embarrassing` already answered, the plan is `cool` first, then two of the answered three in the seed's order, then the checkpoint. With `cool` and `rich-poor` deferred in the previous session, the plan is `cool, rich-poor, on-tv, embarrassing`: both deferred cards first, and the deferred checkpoint has taken the one checkpoint place.

Nothing to see in the browser yet; the client still uses the skeleton's file order until the UI builder's item 5.

### Decisions made on the way

- **mulberry32 over xoshiro.** Both were named in the brief. mulberry32 is one 32-bit number of state and five lines; xoshiro128 is four numbers and needs a second generator to spread the seed into them. For a deck of a few dozen cards, the smaller one is as good and far easier to read, and the operator can hold the whole recipe in mind. Pinned in the tests against the published outputs, because a change to the generator would reorder every stored session.
- **FNV-1a for the seed string.** The seed the client makes is already 64 random bits as hex; the hash exists so that any string, `example` included, works as a seed, and so that each set can have its own sub-seed. 32 bits of generator state means two different seeds give the same order about once in four billion pairs, which is harmless: it is an order, not a secret.
- **One sub-seed per set, and the set's ids sorted before the shuffle.** The order of a set then depends on the seed and on which ids the set holds, not on the other set's size or on the order of the cards in the file. Reordering `deck.json` by hand changes nothing; adding or removing a card changes that set's order, which a deck version bump records anyway.
- **Deferred cards are never capped.** The brief says they come first and count against their set; it does not say "up to the count". A deferred card was promised a future session, and the Later pile that would otherwise catch it is a later tier, so the engine shows every deferred card and adds nothing fresh from a set whose count is spent. In practice a previous session can only defer as many as it showed, so this matters only if the counts are lowered between sessions.
- **The caller's list of deferred cards is trusted, not filtered against the answered set.** A card answered in session 1, back in session 5 because the set had run out, and deferred there is in both lists and is still owed a showing. The caller is the one who knows "not answered since the deferral".
- **The engine never throws.** There is no failure path and therefore no error code: an unknown deferred id is skipped, a duplicate is shown once, a count that is not a whole number is read towards zero and never below. The counts come from `workshop.json`, where the schema already bounds them.
- **Types only from `@wb/contracts`.** The engine imports `Deck`, `Card` and `CardSet` as types, so nothing of the contracts package runs inside it and the client bundle grows by the engine alone.
- **The word "queue".** Section 8 and the brief both say "the queue" for the session's ordered cards; the plan's field is `queue`. The glossary does not have the word yet; proposed in the report.

### Open

- For the integrator: the reading of "counted against the set" when the deferred cards outnumber the count (all shown, nothing fresh added), the field name `queue` and its glossary line, and the README row, all proposed in the pull request's report.
- The UI builder's `deferredIds`: the ids with a `deferred` event in the previous session, in `seq` order, minus any answered since. The engine shows exactly that list first.

---

## 2026-11-02, Monday, afternoon. The deck engine, item 2: dismiss, defer and the end of a session

### What

- **`applyDismiss(plan, cardId, dismissedThisSession)`** returns `{ plan, event }`. The first dismissal of a card in this session moves it to the end of the queue and names the event `dismissed`. The second dismissal of the same card in the same session takes it out of the queue and names the event `deferred`. A card that is not in the queue gives the same plan back and no event. The input plan is never changed. `dismissedThisSession` is the set of card ids already dismissed in this session, kept by the caller.
- **`isSessionOver(plan, answeredOrDeferredThisSession)`** is true when every card in the queue is in the set: the queue is exhausted. With warm-ups then checkpoints that is after the last checkpoint; a card dismissed once is still owed its second showing and keeps the session open.
- `DismissEvent` is `Extract<EventKind, 'dismissed' | 'deferred'>`, so the names the engine returns are, by type, names the event contract knows. The header of `packages/deck/src/index.ts` now describes all three functions. This is item 2 of the deck brief; the package is complete as the brief specifies it.
- 21 tests in `packages/deck/test/dismiss-and-session-over.test.ts`: first dismissal to the end; second removes and defers; not in the queue, no-op and no event; a card already deferred cannot be dismissed again; middle of the queue; last card stays last; input untouched; only this session's dismissals count; set or array; the names are contract kinds; the session is not over before the last checkpoint and is over after it; over when the last card is deferred instead; a once-dismissed card keeps it open; order of answering irrelevant; ids outside the queue do not count; an empty queue is over; a resumed session rebuilds its queue by replaying its dismissals; feeding this session's answers back as history changes the plan; the worked example continued. 175 tests in the repository.

### Why

Section 8: "Dismiss moves the card to the end of this session's queue. A second dismiss defers it to a future session", and "A session ends after the checkpoints". The skeleton's "Set aside" writes `dismissed` and moves on, so a set-aside card is gone for the session and never comes back. The UI builder's item 5 replaces that with these two functions.

### How to verify

```

npm run check # typecheck, 175 tests, formatting
npx vitest run packages/deck # the 53 tests of the engine alone

```

The worked example continued, pinned by the last test. Same deck of six, counts 3 and 1, seed `example`: the plan is `cool, on-tv, embarrassing, immigrants`.

| Step                                                                   | Queue after                             | Event       |
| ---------------------------------------------------------------------- | --------------------------------------- | ----------- |
| the participant sets `cool` aside                                      | `on-tv, embarrassing, immigrants, cool` | `dismissed` |
| they answer the other three; `isSessionOver` with those three answered | the same                                | not over    |
| `cool` comes round again and they set it aside a second time           | `on-tv, embarrassing, immigrants`       | `deferred`  |
| `isSessionOver` with the three answered                                |                                         | over        |
| next session, with `cool` in the deferred list                         | `cool` first, then three more           |             |

### Decisions made on the way

- **The engine names the event, it does not build it.** An event has an id, a session id, a seq, a day and a deck version, all of which belong to the client; the engine answers "which kind", `dismissed` or `deferred`, typed from the contract, and the client builds the event the way it already builds `answered`.
- **The engine is stateless; the caller keeps `dismissedThisSession`.** The set is this session's `dismissed` events, so a resumed session remembers which cards have had their first chance. A dismissal in an earlier session does not count: a deferred card that comes back starts fresh and gets its two chances again.
- **"After the last checkpoint" is read as "the queue is exhausted"**, as the brief says in so many words. The two agree unless a warm-up was dismissed once, in which case it sits after the checkpoint and the session waits for it. The alternative, ending the session at the checkpoint and leaving the dismissed card unresolved, would lose the second dismissal that makes a card `deferred`.
- **A deferred card leaves the queue, and `isSessionOver` also accepts its id in the done set.** The client can hold the latest plan or the first plan plus the done set; both give the same answer. Nothing depends on which bookkeeping the UI builder picks.
- **The no-op returns the same plan object**, so a caller can see by identity that nothing changed.
- **Resuming is replay, not storage.** The client stores the seed and the events, never the queue. On resume it calls `planSession` with the history as it stood when the session started, which is every answer from other sessions and the previous session's deferrals, then replays this session's `dismissed` and `deferred` events through `applyDismiss` in `seq` order. Two tests show the recipe and the pitfall: this session's own answers must not be fed back as history mid-session, or the plan changes under the participant.

### Open

- The Later pile and `revisited` are outside the brief's three functions; a later item would add a function for it, probably one that puts a card back at the front of the queue.
- For the UI builder: the resume recipe above, and which bookkeeping (latest plan, or first plan plus done set) the client keeps. Either works.

```

```

```

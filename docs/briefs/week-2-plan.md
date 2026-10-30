# Week 2: what is missing, who does it, and the schedule

Written Friday 30 October 2026 from an audit of `main` at df4a9cb against the plan's "ships by 15 November" list (`docs/design-and-development-plan.md`, section 5) and the screen map. The audit is the ground truth for the briefs; the briefs in this folder divide it.

## 1. The gap list

What the skeleton already has: the wave and invite landings, the welcome and enter-code screens, consent with join, the card with sealed answers and the outbox, sync in bounded batches, the session end with the code, the privacy panel in most of its rows, the API with every route and 18 error codes, the keyed hash, the byte cap, the rate buckets, cross-workshop scoping with tests, the backup job with its drills, the health endpoint and the monitor on staging. 122 tests pass.

What is missing, by stream.

**Client (UI brief).**

- The wording. Every string is hard-coded in `App.svelte`; the client does not read `copy.md`; errors are shown as raw codes ("Something went wrong: JOIN_WAVE_FULL"). This is the first item because everything after it is text in a file the partner can edit.
- First session: intro 1 and 2 (the text exists, nothing renders it), Back and Next, the demo card, the first-card dictation hint per platform, "Prefer to talk?" from any card.
- Consent screen behaviour: the silent retry on `JOIN_CODE_TAKEN`, the queued join when offline (today the session never starts offline), wording for `RATE_LIMITED` and `SERVER_ERROR`.
- Welcome for the three cases (link, code, neither) and the session-end wording for the code, both decided in the phone-test entry of the build log but not built. The `/continue` route. Digits grouped as typed.
- The core loop: seeded shuffle, dismiss to the end of the queue, second dismiss writes `deferred` and carries the card to the next session, `shown` events, the swipe, a visible saving state, the sync line on the right card.
- Session end only shows the code reveal and install prompt on session 1; the install prompt itself, which needs the web app manifest and the service worker (ADR 0012 names vite-plugin-pwa for this).
- Privacy panel: the rows of "what we store" (today: counts), the one-line meaning of the last error code, the data management plan, the two-step delete, a copy button, the day of the last sync, the link to the source, a way to "I have a code".
- The trust page: the seven sections of the architecture plan, section 13, with the fingerprint and the scanner links. Terms and privacy policy pages from `copy.md`.
- Failure behaviour: `AUTH_CODE_UNKNOWN` on a stored code must clear the code and show Welcome with an explanation (today the session starts anyway); `CLIENT_STORAGE_UNAVAILABLE` is never produced; sync does not retry on reconnect or on a timer; sessions are never re-queued after a restore and a re-queued event can be pruned while waiting; `WORKSHOP_CLOSED` from a sync shows only "Sync problem".
- Tests: the client's tests cover pure logic only; nothing renders `App.svelte`. A component test harness is part of the first item.

**Deck engine (deck brief).**

- `packages/deck` does not exist; the README lists it. The session's cards are chosen in `apps/web/src/lib/deck.ts` in file order. The engine is pure logic with a contract to satisfy: seeded shuffle, warm-ups then checkpoints by the workshop's counts, dismiss to the end of the queue, second dismiss to `deferred`, deferred cards first next session, answered cards never again. It is one day of work and the UI builder consumes it.

**API (API brief).**

- `JOIN_WAVE_CLOSED` can never be returned: the wave window is the workshop's days (ADR 0006). Decision for the integrator: remove the code from the contract and the runbook, or give waves a window. Recommended: remove.
- The byte cap measures UTF-16 units after reading the body, not bytes before. A body of 600,000 four-byte characters passes the cap and weighs 2.4 MB.
- No log line on `REQUEST_INVALID` or `SYNC_PAYLOAD_INVALID`, though the runbook tells the reader to look for one.
- `SERVER_ERROR` has no test. `WORKSHOP_CLOSED` is untested on sync, me, invites and delete. `RATE_LIMITED` is tested on join only, and only its status. Authorization over HTTP: no test that code A cannot write into B's session through `/sync` or delete B.
- The contracts comment says join shares the authenticated limit; the code gives join its own bucket per workshop, which matches ADR 0012. The comment is wrong; the integrator fixes it.
- `rate_buckets` grows by one row per minute per live bucket until the nightly prune: about a thousand rows a day from the monitor alone. Bounded and harmless; the API brief says whether to prune on the way or leave it to the job.
- 30 joins per minute per workshop against a wave cap of 150: a newsletter that lands at once will push some joins into `RATE_LIMITED`, and the client does not retry a join. The number, or the client's retry, is a decision.

**Ops (ops brief).**

- The export tool is untested and overwrites a same-day export (no `wx`). `pepper`, `migrate` and `workshop sync` are untested.
- The runbook: 15 server and 3 client entries still say _Provisional_ though the code exists, and six of them describe something the code does not do (a `/api/<slug>/health` route, a wave's dates, a validation log line, a client storage fallback). The services section says "To be written".
- No headers scan, no ZAP baseline, no dependency audit in CI. HSTS lacks `includeSubDomains`; `preload` is a decision (the app lives on a subdomain of the company's domain).
- The laptop-is-gone drill has no script and no page. The staging reset (Neon's Reset from parent, then a retry of the staging deploy) has no page and has not been rehearsed.
- `workshop status`, `new`, `close`, `delete` and the deck simulator are the 17-23 November tier.
- The README map lists `packages/deck`, which does not exist yet, and `docs/services.md` says the artifact is kept 30 days (it is 14).

**Marco and the partner.**

- The cards: `deck.json` holds 13 placeholders. Final by Thursday 5 November.
- The wording: `copy.md` holds placeholders for the intro, the demo card, the hints, the nudge and the session end, and nothing yet for welcome, enter code, the errors, closed and not-open, terms, the privacy policy, the trust page body and the data management plan. The UI builder adds the sections with placeholder text in its first pull request; the words are Marco's and the partner's.
- Decisions, listed in section 4.

## 2. Who owns which files

| Owner      | Files                                                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Deck       | `packages/deck/**`                                                                                                            |
| UI         | `apps/web/**` except `apps/web/public/_headers`; `workshops/*/copy.md` structure only (the text is Marco's and the partner's) |
| API        | `apps/api/**`, `packages/db/**`, `netlify/functions/**`                                                                       |
| Ops        | `tools/**`, `docs/runbook.md`, `docs/services.md`, `.github/workflows/**`, `apps/web/public/_headers`, the ops repository     |
| Integrator | `packages/contracts/**`, `docs/glossary.md`, `docs/screen-map.md`, `docs/adr/**`, `docs/briefs/**`, `README.md`, merges       |
| Marco      | `workshops/*/deck.json`, the text of `workshops/*/copy.md`, `workshops/*/workshop.json`, vendor consoles, decisions           |

`docs/build-log.md` is appended by everyone; a conflict at merge is resolved by the integrator, entries in order of time.

## 3. The schedule

**As planned** (`docs/design-and-development-plan.md`, section 5):

- Mon 2 to Tue 3: deck engine lands Monday; API done by Tuesday; UI starts Monday on the wording and the harness, picks up the engine Tuesday; ops runs all week.
- Wed 4: deck tuning on staging with the partner (numbers in `workshop.json`, cards in `deck.json`).
- Thu 5: cards final; copy final.
- Fri 6: integration, the skeleton end to end on staging, the walkthrough, content freeze.
- Mon 9 to Tue 10: security pass, device matrix, every drill, VoiceOver and TalkBack, low-end Android.
- Wed 11 to Fri 13: pilot with five to eight people, two sessions in three days.
- Sat 14 go or no-go; Sun 15 buffer; Mon 16 newsletter.

**If the timeline must shorten.** The plan's tiers already defer invites, the Later pile screen, the illustrations and the status command to the week after launch. The next things to cut, in order, with what each costs:

1. The demo card and "Prefer to talk?": half a day of UI. Cost: the first card explains itself a little less.
2. The install prompt, manifest and service worker: a day. Cost: no home-screen icon at launch; participants return through the newsletter link, which works. Ships as an update in week 4.
3. The seeded shuffle and the second-dismiss rule: half a day of engine plus half a day of UI. Cost: cards in file order, set aside means gone for this session. The partner feels this one.
4. The pilot shortened from three days to two, with one session asked instead of two. Cost: no evidence that people come back, which is the question the pilot exists to answer.

Not cut, whatever the timeline: consent, the privacy policy and the trust page (the promise the newsletter makes); the wording pass (raw error codes in front of participants are a trust failure); the failure behaviour for an unknown code and for offline join; the security pass; one day of pilot; the drills, already done.

A schedule one week shorter, launching Monday 9 November, would be: build Mon 2 to Wed 4 with cuts 1 to 3, hardening Thu 5, pilot Fri 6 to Sat 7 with cut 4, go or no-go Sun 8. Possible, with the partner's cards final by Tuesday 3 instead of Thursday 5. The decision is Marco's and the partner's; the briefs are written for the planned schedule and mark the cuttable items.

## 4. Decisions needed before Monday

1. **The timeline:** as planned, or shortened, and by how much.
2. **`JOIN_WAVE_CLOSED`:** remove the code (recommended) or give waves a window.
3. **The join limit:** raise it to 120 per minute per workshop, or have the client retry a `RATE_LIMITED` join after the server's wait. Recommended: both; the retry is cheap.
4. **The look.** The screen map says what, not how it looks. Recommended for this round: one stylesheet of tokens (two fonts from the system, four colours, three sizes), large type, high contrast, no illustration. The partner's colours can replace the four. A designer's pass is not in the plan; say if one is wanted.
5. **Who writes terms, the privacy policy and the consent text**, and by when. The UI needs the sections to exist by Wednesday 4 to lay them out; the words can land Thursday.
6. **HSTS `preload`:** no (recommended; the app is a subdomain of the company's domain, and preload binds the whole domain) or yes.
7. **The heartbeat grace period** in Better Stack: 12 hours (recommended) or as it is.
8. **Branch protection on `main`** in both repositories: on (recommended; every change already goes through a pull request) or not yet.

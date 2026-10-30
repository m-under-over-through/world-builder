# Brief: the client (`apps/web`)

One builder, all week, against the real staging API from day one. The long pole.

## Goal

Every screen and state in `docs/screen-map.md`, with the words from `workshops/<slug>/copy.md`, the deck rules from `packages/deck`, and the failure behaviour the map describes, so that on Friday 6 November a participant can go from the newsletter link to the end of session one on a phone and understand every screen, and the operator can read every line of it.

## Read first

`CLAUDE.md` (the UI builder notes at the end); `docs/glossary.md`; `docs/screen-map.md`, the whole of it; `docs/architecture-and-risk-plan.md` sections 6, 8 and 13; `docs/adr/0003`, `0006`, `0007`, `0012`; `docs/learn/06-the-skeleton-end-to-end.md`; `apps/web/src/App.svelte` and `apps/web/src/lib/*` as they are; `workshops/rural-manufacturing/copy.md`; the build-log entries of 29 October for the phone-test observations.

## The contract to satisfy

- The screen map is the specification. A screen or a state not in it is not built; a gap in it is a question in the report.
- Copy comes from `copy.md`, loaded at build time, never typed into a component. Every participant-facing string, including the one-line wording of every error code, lives there under a heading the client reads by name. Missing text falls back to a visible placeholder in staging and to the heading's name in tests, so a missing section is seen, not silent.
- The API is `packages/contracts/src/api.ts`; error codes are shown to participants through their `copy.md` wording, and shown as codes only in the diagnostics part of the privacy panel.
- Answers are sealed before they are stored (`sealAnswer` before the outbox), truncated by code points, and no readable answer stays on the device after sync (ADR 0007). The outbox, batches and retention rules in `CLAUDE.md` hold.
- The deck engine (`packages/deck`, the deck brief) decides order and dismissals; the client records the events it returns.

## Files owned

`apps/web/**` except `apps/web/public/_headers` (the ops builder's). `workshops/*/copy.md`: its structure (headings and placeholder text), not its words; the words are Marco's and the partner's, and a placeholder is marked `[placeholder]` so the export of missing text is one grep away.

## Items, each one pull request, in this order

1. **A component test harness and the copy loader.** Add the Svelte testing setup (the testing library for Svelte with a DOM environment in Vitest; both are development dependencies of the client and need no services line) so that `App.svelte` and its parts can be rendered in tests. Load `copy.md` at build time (a raw import and a small parser of `## headings`, tested) and replace every hard-coded string in the skeleton with a lookup. Extend `copy.md` with the sections the map needs and the file lacks: welcome (three cases), enter code, every error code's one line, closed, not open yet, saving states, session end for sessions after the first, the privacy panel's labels, the data management plan, terms, privacy policy, the trust page's seven sections. Placeholder text in each, marked.
2. **Split `App.svelte`** into one component per screen of the map, a small router on `lib/route.ts` (including `/<slug>/continue`, `/<slug>/panel`, `/<slug>/trust`), and a store for the screen state. No behaviour change; the tests from item 1 keep passing.
3. **Welcome and enter code, as decided.** The three cases on Welcome (arrived by link; has a code; neither, with "open the link you were sent"); digits grouped as typed, 16 and no more; `RATE_LIMITED` and `AUTH_CODE_UNKNOWN` with their wording; `/continue` as its own route.
4. **The first session.** Intro 1, Intro 2, Intro 3 with consent and Back and Next; the silent single retry on `JOIN_CODE_TAKEN`; the queued join when offline (the session starts, the join is sent with the first sync); the demo card; the dictation hint per platform on the first card, dismissible, and "Prefer to talk?" on every card. Platform detection for iPhone and iPad, Android, Mac, Windows and ChromeOS; nothing on Linux and unknown.
5. **The core loop on the engine.** Replace `lib/deck.ts` with `packages/deck`; `shown` on display; dismiss and second dismiss as the engine says; the swipe as well as the button; the saving state; the "Saved on this device" and "Synced" lines on the card they belong to; the session ends after the last checkpoint.
6. **Session end and install.** Code reveal and install prompt on session 1 only, in that order (section 8.1 says why); "Come back another day" on every session; the install prompt per platform, dismissible, never again after two dismissals; the web app manifest, icons and the service worker through vite-plugin-pwa (named in ADR 0012). The service worker caches the client only; `/api/*` is never cached.
7. **The privacy panel in full.** The rows of "what we store" from `GET /me` shown plainly, sealed bodies shown as sealed; the last error code with its one-line meaning; the day of the last sync; the outbox size counting sessions and events; the copy button; the link to the source at the running commit; the data management plan; the two-step delete; a way to "I have a code" from the panel; the caveat from section 13 that the counters come from the same app.
8. **The trust page, terms and privacy policy.** The seven sections from section 13 with the key fingerprint from `workshop.json`, links to the source and to the scanners; terms and policy as pages from `copy.md`; the closed screen links to the trust page.
9. **Failure behaviour.** `AUTH_CODE_UNKNOWN` on a stored code clears the code and shows Welcome with the explanation; `CLIENT_STORAGE_UNAVAILABLE` is detected on open and the app runs one session in memory, warns, and shows the code at the end; sync retries on reconnect (the `online` event) and on a timer with backoff while the outbox is not empty; sessions are re-queued with their events after a restore; a re-queued event is never pruned while waiting; `WORKSHOP_CLOSED` from a sync shows the closed screen; a `RATE_LIMITED` join is retried once after the server's wait.
10. **The visual pass.** One stylesheet of tokens (system fonts, four colours, three sizes), large type, high contrast, a 44-pixel minimum tap target, the whole flow checked at 320 pixels wide and with the system font size at its largest. No illustration this round. The partner's colours replace the four if they arrive.

Items 1 to 3 are Monday. Item 5 waits for the deck engine, Tuesday. Items 4 and 6 to 10 follow in order; 6 is the one to drop if the week runs short (the plan says why), then 4's demo card and "Prefer to talk?".

## Tests that define done

- Every component renders in a test with the copy loader's placeholder text, and every error code the map lists for a screen has a test that shows its wording.
- Logic that already has tests keeps them (`batches`, `days`, `store`, route parsing, `countsAsOpen`, `parseArrival`).
- New logic: the copy parser, platform detection, the retry rules, the re-queue of sessions, the prune rule for waiting events, the install prompt's dismiss count.
- `npm run check` passes, including `svelte-check`.

## By hand, on the deploy preview, per pull request

The description names the preview address and the taps, in order, and what is seen at each. The whole flow, once per week at least: open the wave link on a phone with nothing stored; read the three intro screens; consent; the demo card; the first card with the hint; answer, set aside, set aside again; the session end with the code; the install prompt; close everything; open the installed app or the link again; land on the next card; open the privacy panel and read every row; delete; land on Welcome.

## Do not touch

`packages/*` (propose; the deck engine is the deck builder's until merged, then yours to call, not to edit), `apps/api`, `tools`, `netlify`, `apps/web/public/_headers`, `docs/screen-map.md` (ask), the words in `copy.md`.

## Report

Under "Report" in every pull request: what was built; what the screen map or the copy left unsaid and how it was read; every string added to `copy.md`; proposals for the contracts (an error code the client needs and the API lacks, a field in `/me`) and for the glossary; what the next item needs from the integrator.

## Already decided, so not to be asked again

The wave stays in the address bar and an open counts once per device (pull request 4); the code is shown at the end of session one and continue-with-code is on Welcome (ADR 0002, section 6.2); no revising earlier answers; the Later pile screen and personal invites are the week after launch; rate limiting is per code and per workshop, never per address (ADR 0012).

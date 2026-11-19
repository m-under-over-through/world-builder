# Brief: the page is never empty, and no request waits for good

For one builder. Read first, in this order: `CLAUDE.md`; `docs/adr/0028-the-page-is-never-empty.md` (the decision; it is the specification, and "What this does not do" is part of it); `docs/glossary.md`; `apps/web/index.html`, `apps/web/src/main.ts`, `apps/web/src/App.svelte` (the header and the `loading` screen), `apps/web/src/lib/api.ts`, `apps/web/src/lib/sync.ts`, `apps/web/pwa.ts`, `apps/web/public/_headers`.

You are on the branch `never-an-empty-page`, in a worktree where `npm ci` has run. The decision record, this brief and one addition to `packages/contracts/src/api.ts` (the new client code `CLIENT_NOT_STARTED`) are in the working tree and not yet committed: three tests fail until the new code has its line in `copy.md` and its entry in `docs/runbook.md`, which are yours to write, and nothing is committed while `npm run check` fails. Commit them unchanged with your first commit. `packages/contracts` is the integrator's: do not edit it further; if you need a change there, say so in your report.

Why this exists: on 19 November 2026 the first open of a production link on Marco's phone gave a page with nothing on it until he reloaded. Once the app's script starts the page always shows the header and "Loading", so the script did not start. The page has nothing in it until then. Marco: "be careful, methodical, and don't rush things."

## What to build

### 1. The page's own first screen

In `apps/web/index.html`, inside `<div id="app">`:

- The app's name, "World Builder", in the header's place: use the same elements and classes the app's header uses while loading (`.app`, `header.topbar`, `.lines`, `span.name`), so the name does not move when the app takes over. No organizer line (the page does not know the workshop).
- Under it, in the place of the `loading` line (`main.text`, `p.muted`), one line with the text of `CLIENT_NOT_STARTED`. It is hidden for 8 seconds and then shown. Do it in the stylesheet alone: `visibility: hidden`, and an animation with an 8 second delay that ends on `visibility: visible` (so a screen reader does not read it before it shows). No script is involved in showing it. Check the reduced-motion rules at the end of `apps/web/src/app.css`: a delay is not motion, so the 8 seconds must hold there too; say in a comment why.
- Mark the whole thing so the stylesheet, `boot.js`, `main.ts` and the tests can find it: one class on its outer element (suggested: `boot`), stated once as a constant where code needs it.
- No inline `style`, no inline script, no `on...` attribute: the Content Security Policy forbids them.
- Only these tags inside it: `div`, `header`, `main`, `span`, `p`. The operations repository's scan holds the served page to a list of tags; the integrator changes that list to match.

The text: add `## Error: CLIENT_NOT_STARTED (one line)` to `workshops/rural-manufacturing/copy.md`, after `CLIENT_COPY_FAILED`, in the form of its neighbours, with this draft (Marco will read it and may change it):

> This is taking longer than it should. Reload the page, or open your link again.

Add nothing else to `copy.md` and change nothing else in it; it is Marco's file. List the lines you added in your report. If the copy file's own rules need an editor's note for a new section, follow what the neighbouring sections do.

`apps/web/src/main.ts`: before `mount`, take the page's own first screen out of `#app` (Svelte's `mount` adds to its target, it does not empty it), and after the mount forget the reload mark (below). Put the logic in a small module (suggested: `apps/web/src/lib/boot.ts`) so it can be tested; `main.ts` calls it. If the mount throws, the page's own screen must not have been lost for nothing: decide the order with that in mind, say what you chose and why in a comment.

### 2. One reload when the script did not start

`apps/web/public/boot.js`: plain JavaScript that every browser the app supports can run, no module, no build step, a few lines, with a comment at the top that says what it is and points to ADR 0028. Loaded from `index.html` with `<script async src="/boot.js"></script>`.

- When the window has loaded (the `load` event; or at once when `document.readyState` is already `complete`), look for the page's own first screen inside `#app`. If it is gone, the app started: do nothing.
- If it is still there, the app did not start. If `sessionStorage` holds the mark, do nothing (one try only). Otherwise set the mark and call `location.reload()`.
- If `sessionStorage` throws on read or on write, do not reload.
- The mark: one key, named in the style of the others (`wb:...`), no value that says anything about a person. The app removes it when it starts (in the module above), inside a `try`.
- It reads and writes nothing else, asks the network for nothing, and logs nothing.

Check where Vite puts it: a file in `public/` is copied to `dist/` as it is. Check that the service worker's precache picks it up (`globPatterns` in `apps/web/pwa.ts` covers `js`), and that the built `dist/index.html` still carries the `async` tag before the module script or wherever Vite leaves it; say in your report what the built page looks like (paste its `<head>` and `<body>`).

### 3. A time limit on requests

In `apps/web/src/lib/api.ts`:

- `api()` takes an optional `timeoutMs` and uses `REQUEST_TIMEOUT_MS = 15_000` when none is given. Use an `AbortController` and `setTimeout` (not `AbortSignal.timeout`, which older Safari lacks). Clear the timer when the answer has been read, body included. A request over its limit is stopped and returns exactly what the `catch` returns today: `{ ok: false, error: 'CLIENT_SYNC_FAILED', status: 0 }`.
- The sync request that carries the outbox (find it in `apps/web/src/lib/sync.ts`) passes `SYNC_TIMEOUT_MS = 60_000`. Say next to each constant why it has that value (ADR 0028, point 3).
- Do not change what any caller does with a failed request. Read each caller of `api()` and confirm in your report, one line each, that a `status: 0` failure is already handled there.

Mind the tests: many client tests use held routes and fake or injected timers (`apps/web/test/helpers.ts`; a client test that syncs without `stubRoutes` hangs the whole run). A new real timer in `api()` can change what a test that advances time sees. Run the whole suite; where a test changes meaning because of the limit, fix the test to say what is now true, and list each one in your report.

## Tests (Vitest, `apps/web/test`, named as behaviours)

At least:

- "the page as served has the app's name and the line for a script that did not start": read `apps/web/index.html` as text; the page's own first screen is inside `#app`; its line equals the `CLIENT_NOT_STARTED` text of every workshop folder's `copy.md` (so the two cannot drift); the `boot.js` tag is there and is `async`; the page has no inline script, no `style` attribute and no `on...` attribute.
- "the stylesheet keeps the line hidden for eight seconds, with reduced motion too": read `app.css` as text and pin the rule (this is a text check; say so in the test's name or comment).
- `boot.js`, loaded as text and run against a stand-in `window`, `document`, `sessionStorage` and `location`: the app started, no reload; the page's screen still there at `load`, one reload and the mark set; the mark already set, no reload; storage that throws on read, no reload; storage that throws on write, no reload; the document already complete when the script runs, it checks at once.
- The module `main.ts` calls: it removes the page's own screen from the target; it removes the mark; it does not throw when storage throws; it leaves a target without that screen alone.
- `api()`: a request with no answer within the limit resolves as `CLIENT_SYNC_FAILED` with status 0 and the fetch was aborted (assert on the signal); an answer in time is returned as before and no timer is left running; a body that takes longer than the limit to read is also stopped; the sync request passes the longer limit.
- Every existing test still passes. `npm run check` must pass before every commit.

## Check it by hand, and say what you saw

The failure cannot be made to happen on a phone, so prove the behaviour on a built page:

1. `npm run build --workspace=apps/web` (set `VITE_WB_ENV=staging` if the build needs it; read `netlify.toml`).
2. Write a small static server as a throwaway script outside the repository (your scratch folder, not committed) that serves `apps/web/dist` with the single-page fallback and can be told, by a query or a counter, to (a) answer the app's script under `/assets/` with a 404 or with the HTML page once and then normally, (b) do that every time, (c) never answer it.
3. With a headless browser if one is installed, or by reading the server's request log if not, show: (a) the page asks for itself twice and then the app starts; (b) the page asks for itself exactly twice, never a third time, and the line is in the page; (c) the page asks once, and does not reload. Do not install anything to do this; if no browser is available, say so and give the request logs you could get. The integrator will look at all three in a browser before the merge.

## Documents (in the same pull request)

- `docs/build-log.md`: one entry at the top in the form of its neighbours: date 19 November 2026, what, why, how to verify by hand, decisions made on the way, open questions (take "What this does not do" from the ADR). Leave the pull request number as the literal text `PR_NUMBER`; the integrator fills it in.
- `docs/learn/16-what-a-page-shows-before-its-script.md`, linked from the log entry and from `docs/learn/README.md`: for a reader who understands systems at a high level. What a browser does between getting a page and running its script; why a stylesheet holds up the first paint and a module script does not; what `async` means for a script; what the window's `load` is and why it comes even when a file failed; why a page that answers 200 for a missing script still breaks. Short.
- `docs/runbook.md`: an entry `### CLIENT_NOT_STARTED` in the form of its neighbours (what the person sees, causes, what to check, what to do), and one sentence added to `CLIENT_SYNC_FAILED` about the time limits.
- `docs/participant-texts.md`, `docs/screen-map.md`, `docs/device-tests.md`: wherever the first screen, the loading line or the list of texts is described, add what is now true. In `docs/device-tests.md` add a short part: on a phone, an ordinary open looks as before (the name does not jump, the line never flashes, the page does not load twice); on a laptop, blocking the app's script in the browser's developer tools shows the name, one reload, then the line after eight seconds.
- `docs/glossary.md`: do not add a word. If you need one, propose it in your report.

Plain words, short sentences, no em-dashes. Comments say why and point to ADR 0028.

## Not yours

`packages/contracts`, `docs/adr/`, `design/`, `apps/api`, `packages/db`, `tools/`, `.github/`, `netlify.toml`, anything in the operations repository, and every part of `copy.md` except the one new section. Do not change the service worker's update behaviour. Do not add a dependency. Do not push to `main` or `staging`.

## When you are done

Commit on this branch (messages as `CLAUDE.md` says, with its trailer), push the branch, and open a pull request against `main` titled "The page is never empty, and no request waits for good", with: what changed and why; how to verify by hand; error codes added (`CLIENT_NOT_STARTED`); the decision record it follows (0028). End the description with the line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

Then report to the integrator, in plain text: the pull request's address; the built page's `<head>` and `<body>`; what you saw in the three hand checks; each caller of `api()` and how it handles `status: 0`; each existing test you changed and why; the lines added to `copy.md`; anything in this brief you did differently and why; anything you are not sure of. Do not say a thing works unless you ran it.

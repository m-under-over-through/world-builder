# 0028. The page is never empty, and no request waits for good

Date: 2026-11-19. Status: accepted, from Marco's report of 19 November, on the first open of a production link on his phone ("the first time I open the url the page was blank and stayed blank. only after forcing a reload on the browser the normal onboarding appeared"), and his "Yes, build it" the same day.

## Context

The blank page was seen once and has not been made to happen again. Its cause is not known. What is known narrows it down.

Once the app's script has started, the page is never blank: the header with the app's name and the line "Loading" are drawn before anything is asked of the device's store or of the server. A page with nothing on it at all means the script did not start.

The page as it is served holds an empty `<div id="app">` and one script. If that script fails to load, stalls, or throws before the first screen, nothing is shown, nothing says so, and nothing tries again. One way to get there without any network trouble: the server answers a missing file under `/assets/` with the page itself and a 200 (the fallback that makes every address open the app), and a browser refuses a page as a script.

A second gap was found by reading, not seen: `api()` in `apps/web/src/lib/api.ts` has no time limit. A request that gets no answer keeps "Loading" on the screen for as long as the browser itself waits, which is about a minute in Safari and several minutes elsewhere.

What any fix has to respect: the Content Security Policy is `'self'` only, so no inline script and no inline style; every word a participant reads is in the workshop's `copy.md`; a link's value sits after `#` in the address until the app reads it (ADR 0018), so whatever reloads the page must keep the address whole.

## Decision

**1. The page carries its own first screen.** `apps/web/index.html` has, inside `#app`, what the app's own loading screen has: the app's name in the header's place. Under it, one line that stays hidden for eight seconds and then shows: the text of `CLIENT_NOT_STARTED` in `copy.md`. When the app's script starts, `main.ts` takes this away and mounts the app in its place. On every ordinary open the name is all anyone sees of it, for a moment, in the place where the app then draws it.

**2. The page tries once more when its script fails to load.** A second, very small script of the page's own, `/boot.js`, is loaded `async`, so it holds nothing up. When the page has finished loading (the window's `load`, which comes after every file has arrived or failed) and the page's own first screen is still there, the app did not start, and the script reloads the page: once. It remembers that it did in `sessionStorage`, and the app forgets it again when it starts, so a later failure in the same tab gets its one try too. Where the browser refuses the storage, there is no reload. `location.reload()` loads the same address, value included.

**3. A request has a time limit.** Fifteen seconds for every request; sixty for the sync request that carries the outbox, because that one has a body of up to `MAX_REQUEST_BYTES` and a small phone line must be allowed to finish sending it. A request over its limit is stopped and is, to the rest of the app, exactly what a request the network refused already is: `CLIENT_SYNC_FAILED` with status 0. Every caller handles that today: the join waits in its queue, the outbox waits, the open goes on with what the device holds.

**4. One new client code, `CLIENT_NOT_STARTED`**, in `packages/contracts/src/api.ts`, with its line in `copy.md` and its entry in `docs/runbook.md`. The app cannot show it, since it is the app that is missing; the page shows its text.

## What this does not do

- **A stylesheet that stalls.** A browser paints nothing until the stylesheet has arrived or failed. The page's first screen cannot be styled from inside the page, because the policy forbids inline style. So the page can still be empty for as long as the stylesheet takes.
- **A script that stalls without failing.** Nothing reloads then; the line after eight seconds says what to do. A reload after a fixed time was refused: on a slow line it would throw away a download that was going to finish.
- **A browser that draws nothing at all.** If the page itself is never drawn, nothing in the page can help. From now on a blank page without the app's name means that, which is worth knowing.
- **A device store that never answers.** `openStore` waits for IndexedDB with no limit. Not seen. Left open.
- **The reload a moment after a deploy.** The service worker's update still reloads an open page (the "flicker"). Unchanged here.

## Consequences

- The page has two scripts. The weekly scan in the operations repository holds the served page to what the build writes, so its rule changes in the same step.
- The line's words live in `copy.md` and are repeated in `index.html`; a test holds them equal for every workshop folder. The app's name is in `index.html` already, as the page's title.
- "Loading" ends: at most fifteen seconds for each request the open makes.
- The cause of the blank page on 19 November is still not known. This makes the next one visible, and in the commonest case it mends itself.

## Alternatives refused

- **A script that blocks, or waits its turn, and listens for the app script's `error`.** It would be in place before the event. It would also be one more file that, stalling, holds up the page or the app.
- **A "Reload" link in the line.** A link to the same address loads it without what follows `#` and loses the link's value. Words only.
- **Filling the line into the page at build time from `copy.md`.** More machinery than a test that holds two texts equal.

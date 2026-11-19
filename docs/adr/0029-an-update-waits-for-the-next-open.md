# 0029. An update waits for the next open

Date: 2026-11-19. Status: accepted, from Marco on staging the same day ("it loads, but it still does the second jump") and his answer to the proposal: "build it now, I want to test it before sending anything".

## Context

The app keeps a copy of its own files on the device, through a service worker (ADR 0012, `apps/web/pwa.ts`, learning note 10). On every open the browser asks the server whether the worker has changed. After a deploy it has. The new worker then downloads every file of the client again, takes over at once, and drops the old files.

Until now the page reloaded itself the moment the new worker took over. The registration code that comes with `vite-plugin-pwa` does that in its `autoUpdate` mode, and `main.ts` used it. So a device that had opened the app before showed the page, and then showed it again: once, on its first open after each deploy. Marco saw it on every test, because every test came minutes after a deploy. He called it a flicker, and then "the second jump".

On a fast line the reload comes within a second. On a slow line it comes when the download is done, which can be many seconds after the person has started. A half-written answer is kept in memory only, so that reload takes it away. And it is one more thing happening at the start of the page on exactly the opens where something has just changed.

## Decision

**1. The page registers the worker itself and does nothing when a new one takes over.** `main.ts` calls `navigator.serviceWorker.register('/sw.js')` through a small module of the app's own, and no code of the client reloads the page. The new version is what the next open gets.

**2. The worker itself is unchanged.** It still installs in the background, takes over at once (`skipWaiting`, `clientsClaim`) and drops the old files. Taking over at once is what makes the next open the new version, even when that open is a reload in the same tab. A worker that waited for every tab to close could wait for weeks on a phone where a tab is never closed.

**3. The page that is open keeps running the version it was loaded with**, until it is closed or loaded again. That is safe because nothing the open page may still ask for goes away. Its script and its stylesheet are loaded before the new worker can take over. What it may ask for later is a typeface, an icon, the manifest or the calendar file, and those keep their names from build to build and are in the new copy as well. A test holds the client to having no part that is loaded later (no dynamic `import`).

**4. Between a deploy and a device's next open, the old page talks to the new server.** So a deploy made while a collection is open must not refuse what the previous client sends. That was already true for the seconds before the reload and for a tab left open; it now holds until the next open.

## What this does not do

- **A device that holds a copy from before this change reloads one last time**, on its first open after this change is deployed: the page in that copy still has the old code. Only the testers' devices hold such a copy; no participant has opened the app yet.
- **A fix reaches a device one open later than before.** The first open after a deploy runs the version the device already had; the one after it runs the new one. There is no way to push a version onto an open page. Accepted: no page is reloaded under a person.
- **Testing a deploy takes two opens, or a private tab.** A tester who opens staging once after a deploy sees the version from before it. `docs/device-tests.md` and the runbook say so.
- **The first open ever is as it was.** There is no copy yet, the page comes from the network, and the worker is installed for next time.

## Consequences

- No page of the app is reloaded by the app, except the one reload of ADR 0028 for a page whose app did not start.
- The page no longer loads `workbox-window`: one request and one file fewer.
- The version a device runs can be one deploy behind the server for one visit. The page about the app shows the running version (the link to the source at that commit), which is how a tester tells.

## Alternatives refused

- **Reload only when nothing is being written.** It would keep fixes fast and lose no draft. It would also keep the jump on almost every open after a deploy, which is what was asked to go, and it needs the registration code to know the state of the screen.
- **Let the new worker wait until every tab is closed** (no `skipWaiting`). Standard, and wrong for a phone: a reload does not close the tab, so the new version might never come.
- **Ask the person to reload.** A new piece of screen and new words, for something the next open does by itself.

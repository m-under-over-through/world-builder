# Brief: an update waits for the next open

For one builder. Read first: `CLAUDE.md`; `docs/adr/0029-an-update-waits-for-the-next-open.md` (the decision; it is the specification, "What this does not do" included); `apps/web/pwa.ts`; `apps/web/src/main.ts`; `apps/web/src/lib/boot.ts` and `apps/web/test/boot.test.ts` (the last change, for the way a small module and its tests are written here); `docs/learn/10-the-installed-app.md`.

You are on the branch `an-update-waits`, in a worktree where `npm ci` has run. The decision record, this brief and two rows in `docs/adr/README.md` are in the working tree, not yet committed; commit them unchanged with your first commit.

Why: after every deploy, a device that has opened the app before reloads the page once, a moment after it opens (Marco: "it still does the second jump"). On a slow line that reload can come many seconds in and take a half-written answer with it. Marco will test this before the production address goes to anyone, and he hopes it is the last fix before the launch: be careful, change as little as possible.

## What to build

1. **A small module of the app's own** (suggested: `apps/web/src/lib/offline-copy.ts`), with one function that registers the service worker: `navigator.serviceWorker.register('/sw.js', { scope: '/' })`. Nothing where the browser has no `serviceWorker`. A registration the browser refuses is swallowed (no unhandled rejection, nothing logged). It adds no listener of any kind and never reloads: say why in the comment (ADR 0029).
2. **`apps/web/src/main.ts`** calls it where `registerSW({ immediate: true })` is called today, at the same moment (do not move it to `load`), and no longer imports `virtual:pwa-register`. Not in development: the development server has no worker; keep whatever today's behaviour is there (find out what the virtual module does in development and match it: no registration).
3. **`apps/web/pwa.ts`**: the worker's settings do not change. Correct the comments that speak of the virtual module. `registerType: 'autoUpdate'` stays: it is what makes the generated worker call `skipWaiting` and `clientsClaim` (confirm that in the built `dist/sw.js` and say so in a comment). Leave `apps/web/tsconfig.json` and the package's dependencies alone unless something fails without a change; no dependency is added or removed in this pull request.
4. Nothing else in the client changes. In particular `apps/web/public/boot.js` and `lib/boot.ts` are not touched.

## Tests (Vitest, `apps/web/test`, named as behaviours)

- The module: it registers `/sw.js` with scope `/`; where there is no `serviceWorker` it does nothing and does not throw; a refused registration does not throw and leaves no unhandled rejection; it adds no listener to the worker container (assert on a stand-in whose `addEventListener` is a spy).
- `main.ts`, read as text with comments stripped (as the `startApp` test does): it calls the module's function, and the words `virtual:pwa-register` are not in it.
- The client reloads nowhere: no file under `apps/web/src` contains `location.reload` or `.reload(` (comments stripped). The one reload of the page is `apps/web/public/boot.js`, outside `src`; a second assertion pins that `boot.js` has exactly one `location.reload()`.
- No part of the client is loaded later: no file under `apps/web/src` contains a dynamic `import(` (comments stripped). Say in the test why: an open page keeps running after a new worker has dropped the old files (ADR 0029, point 3).
- For each new test, remove the behaviour once, see it fail, put it back; list these in your report.
- `npm run check` green before every commit.

## Check it by hand on built pages, and say what you saw

Use the method of the last change (a throwaway server outside the repository, the installed Chrome headless over the DevTools protocol, nothing installed, everything stopped afterwards). The server must be able to switch between two built folders while it runs, as a deploy does.

Make three builds of the client into three folders outside the repository (copy `apps/web/dist` after each build): **old** = the commit `a0ab58e` as it is on `main` (build it from a second throwaway worktree or by stashing; do not disturb this branch's files), **new-1** = this branch, **new-2** = this branch built so that its script has a different name (for example `VITE_WB_ENV=production` against `staging`; say what you used). Then, in one browser profile, in this order, noting for each open: how the page came (`performance.getEntriesByType('navigation')[0].type`), the script's file name in the page, whether the page was reloaded within 10 seconds of opening (set a property on `window` right after load and read it back), and which worker controls the page:

1. Serve **new-1**. Open a workshop address for the first time: the page comes from the network, once; no reload; a worker is installed.
2. Still **new-1**, open again: one load, no reload.
3. Switch to **new-2** (the deploy). Open: the page is still **new-1**'s script, it is NOT reloaded, and within some seconds the worker in control is the new one and the cache holds **new-2**'s script. Type into a card's field before the worker changes and show that the text is still in the field after it changed.
4. Open again: the page is **new-2**'s script, one load, no reload.
5. In a fresh profile: serve **old**, open (the old registration code is in this page), switch to **new-1**, open: the page reloads once (the last time, as the ADR says), and from then on steps 3 and 4 hold.
6. With the worker from step 4 in control, turn the server off and open the workshop address again: the page still opens from the copy (the installed app opens offline, as before).

Paste the notes of each step in your report. If a step does not behave as the ADR says, stop and report it; do not paper over it.

## Documents (same pull request)

- `docs/build-log.md`: one entry at the bottom in the form of its neighbours, with the literal `PR_NUMBER` for the integrator to fill in. What, why, how to verify by hand (the two-deploy way, below), what you saw, decisions on the way, open questions (take "What this does not do" from the ADR).
- `docs/learn/10-the-installed-app.md`: extend it, short, for a reader who understands systems at a high level: what a service worker's update is (the browser asks on every open; install, take over, drop the old files), what "take over at once" means and why it is kept, why the page used to reload and no longer does, and what it means for a tester (two opens or a private tab).
- `docs/runbook.md`: where deploys or staging tests are described, add that a device runs a new version from its second open after the deploy, that a private tab always gets the new one, and that a deploy during a collection must not refuse what the previous client sends. If there is an entry about the page reloading after a deploy, correct it.
- `docs/device-tests.md`: a short part for this change. On staging it needs two deploys in a row: after the first (this change) each device that had staging before jumps once more, for the last time; after the second (any later commit) the first open shows no jump and the page keeps working, and the open after that shows the new version (the page about the app links to the source at the running commit, which is how to tell). Also: wherever the file tells a tester to open staging after a deploy, add "in a new private tab, or twice".
- `docs/screen-map.md`: only if it describes the update or the reload.

Plain words, short sentences, no em-dashes. No new glossary word; if you need one, propose it in the report.

## Not yours

`packages/`, `apps/api`, `tools/`, `.github/`, `netlify.toml`, `design/`, `workshops/` (no word a participant reads changes), `docs/adr/` (already written), the operations repository. No dependency added or removed. Do not push to `main` or `staging`.

## When you are done

Commit (messages as `CLAUDE.md` says, with its trailer), push the branch, open a pull request against `main` titled "An update waits for the next open", with what changed and why, how to verify by hand, error codes added (none), the decision record (0029), ending with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Then report in plain text: the pull request's address; the notes of the six hand-check steps; what the built `dist/sw.js` says about `skipWaiting` and `clientsClaim`; whether `workbox-window` is still in the build output and whether anything still asks for it; each test and the removal that made it fail; anything you did differently and why; anything you are not sure of. Do not say a thing works unless you ran it.

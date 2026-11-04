# 0016. A page per workshop, and the service worker written by hand

Date: 2026-11-04. Status: accepted. Amends ADR 0012 (the generated service worker) and the installed-app fix of 3 November 2026 (build log; `docs/learn/10-the-installed-app.md`).

## Context

On 3 November Marco's home-screen app on his iPhone opened "This address is not a workshop": the root manifest started every installed app at `/`, and an iPhone's home-screen app has storage of its own, so `/` had no remembered workshop to go to. The fix of that day wrote one manifest per workshop folder and had the page's script point its manifest link at the workshop it opened. On 4 November Marco removed the app, added it again from the new build, and opened it: the same screen.

The page as Netlify serves it links the root manifest; the script repoints the link a moment later. Chrome reads the link when the participant installs, and is right. An iPhone reads it when the page loads, and ignores what a script changes afterwards, so every install on an iPhone takes the root manifest and starts at `/`. The 3 November fix could only ever work on Android.

A second thing stands in the way even once the page is right: the service worker. Once it is installed it answers every navigation from its cache with one page, the root one, so a page served by Netlify with the right link would only ever be seen on the first visit.

## Decision

**One copy of the page per workshop.** At build, after Vite has written the root page, a small plugin (`workshopPages` in `apps/web/pwa.ts`) writes a copy of it at `/<slug>/index.html` for every folder under `workshops/`, with the manifest link pointed at `/<slug>/manifest.webmanifest` and nothing else changed (`workshopPage` in `apps/web/src/lib/pages.ts`, which refuses a page without the root link, so a change in how the plugin writes the link breaks the build, not the install). Netlify serves the copy under `/<slug>/*` by one line per workshop in `public/_redirects`, before the catch-all; a file that exists at the address, the manifest or the reminder, is served as itself. The link an iPhone reads at load is now the workshop's.

**The service worker is written by hand.** `apps/web/src/sw.ts` replaces the worker ADR 0012 had vite-plugin-pwa generate, through the plugin's `injectManifest` strategy: the plugin still builds it and injects the list of files to keep; the worker keeps those files (the pages, the manifests, the reminders, the type, the scripts and styles), cleans up older caches, and answers a navigation with the page the address belongs to: the workshop's own under `/<slug>/`, the root page elsewhere (`pageFor` in `lib/pages.ts`; the slugs are read off the list of kept files, so nothing is injected twice). It still never answers the API or a calendar file with a page, and caches nothing at runtime. The worker is about twenty lines, each explained; the rule it applies is a pure function with its own tests.

**A safety net at `/`.** An address without a workshop goes to the workshop this device last opened, as before, or, when the build has exactly one workshop and the device remembers none, to that one (`onlyWorkshop` in `lib/workshops.ts`). An app installed before this change still starts at `/`; with one workshop in the build it now lands in it. With two or more there is no telling, and the screen says so as before.

## Consequences

- An app added to an iPhone's home screen from a workshop's page starts in that workshop. It still has storage of its own and asks for the code once (learn note 10). Apps installed before this change keep their old start address; the safety net covers them while the build has one workshop.
- `workbox-core`, `workbox-precaching` and `workbox-routing` become direct dependencies of `apps/web` (`docs/services.md`): the hand-written worker imports them; `workbox-build` already carried them.
- `public/_redirects` carries one line per workshop folder, written by hand when a folder is added; a test checks every folder has its line before the catch-all. Generating the file at build would collide with Vite's copy of `public/`.
- The precache grows by one page per workshop, a few kilobytes each.
- The worker's own code is no longer regenerated from options; a change to what it caches is a change to `sw.ts`, read by the operator like any other file.

## Open

- Whether iPhone also caches a manifest it has fetched once and keeps using it after the link changes: not relevant now that the link is right at load, but worth knowing if an install ever starts at the wrong place again.
- When the second workshop folder arrives, the safety net at `/` stops applying; the installed apps of the first workshop, added after this change, are unaffected since they start at their own address.

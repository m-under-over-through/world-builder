# The installed app

A participant can add World Builder to a phone's home screen. What they get is the same web page, opened by the phone as if it were an app: no browser bar, its own icon, and the client's files kept on the phone so it opens offline. Three small things make that work, and one of them bit us twice, on 2 and on 4 November 2026.

## The manifest

The manifest is a small JSON file the page links to. The phone reads it when the participant adds the app to the home screen: the name and icon to show, the colours, and three addresses.

- `start_url`: where the installed app opens.
- `scope`: which addresses count as "inside" the app. A link outside the scope opens in the browser instead.
- `id`: what makes two installs the same app or different apps.

One deployment serves many workshops (ADR 0004), so the build writes one manifest per workshop at `/<slug>/manifest.webmanifest`, with all three addresses at `/<slug>/`.

Which manifest a phone reads is decided by the `<link rel="manifest">` in the page, and here the phones differ. Chrome reads the link at the moment the participant installs, so a script that changes the link beforehand is enough. An iPhone reads it when the page loads and ignores what a script changes afterwards; that is why the first fix, which repointed the link from `main.ts`, worked on Android only. So the build also writes one copy of the page per workshop, at `/<slug>/index.html`, with the link already pointed at that workshop's manifest (`workshopPages` in `apps/web/pwa.ts`, the rule in `src/lib/pages.ts`), and Netlify serves that copy for every address under `/<slug>/` (`public/_redirects`, one line per workshop folder). The script in `main.ts` still repoints the link, which costs nothing and keeps the root page right in Chrome.

## Storage is not always shared

On Android, Chrome and an app installed from Chrome share one storage: the code, the outbox and the "last workshop" are all there. On an iPhone, a home-screen app has its own storage, apart from Safari's. It starts empty. That is why an installed app cannot find its workshop by memory: the address in the manifest has to say. It is also why, on an iPhone, the installed app asks for the code once. The screen map shows the code before the install prompt for that reason.

## The service worker

The service worker keeps the client's files so the installed app opens offline. It never keeps anything from the API: every `/api/*` request goes to the network. The workshop manifests and pages are kept like the rest, so the install works offline too.

Once it is installed, the worker answers every navigation itself, from its cache, and so it has to know which page an address belongs to, or it would hand the root page to a workshop's address and undo the copies above. That is why it is written by hand (`apps/web/src/sw.ts`, ADR 0016) rather than generated: twenty lines that keep the files, read the workshop slugs off the list of kept files, and answer a navigation under `/<slug>/` with that workshop's page and any other with the root page. The list of files is injected at build by the same plugin that used to generate the whole worker.

To check it: build (`npm run build:web`), then `ls apps/web/dist/rural-manufacturing/index.html` and `grep -c 'rural-manufacturing/manifest.webmanifest' apps/web/dist/rural-manufacturing/index.html` (1: the copy links its own manifest), and `grep -c 'rural-manufacturing/index.html' apps/web/dist/sw.js` (at least 1: the copy is kept).

## What to remember

- An app installed before a change to its manifest keeps the old start address. Remove it and add it again. While the build has one workshop, an app that still starts at `/` lands in it anyway (ADR 0016).
- A browser reads the manifest link from the page as it was served, not as a script left it. Whatever must be right at install time has to be in the page itself.
- Nothing identifying ever goes into the manifest or the address: only the workshop's slug, which is public.

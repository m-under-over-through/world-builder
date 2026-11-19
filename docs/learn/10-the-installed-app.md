# The installed app

A participant can add World Builder to a phone's home screen. What they get is the same web page, opened by the phone as if it were an app: no browser bar, its own icon, and the client's files kept on the phone so it opens offline. Three small things make that work, and one of them bit us on 2 November 2026.

## The manifest

The manifest is a small JSON file the page links to. The phone reads it when the participant adds the app to the home screen: the name and icon to show, the colours, and three addresses.

- `start_url`: where the installed app opens.
- `scope`: which addresses count as "inside" the app. A link outside the scope opens in the browser instead.
- `id`: what makes two installs the same app or different apps.

One deployment serves many workshops (ADR 0004), so the build writes one manifest per workshop at `/<slug>/manifest.webmanifest`, with all three addresses at `/<slug>/`. The page points its manifest link at the workshop it opened as soon as it runs (`apps/web/src/main.ts`), before the phone can ask for it. The plugin that writes the files is in `apps/web/pwa.ts`.

## Storage is not always shared

On Android, Chrome and an app installed from Chrome share one storage: the code, the outbox and the "last workshop" are all there. On an iPhone, a home-screen app has its own storage, apart from Safari's. It starts empty. That is why an installed app cannot find its workshop by memory: the address in the manifest has to say. It is also why, on an iPhone, the installed app asks for the code once. The screen map shows the code before the install prompt for that reason.

## The service worker

The service worker keeps the client's files so the installed app opens offline. It never keeps anything from the API: every `/api/*` request goes to the network. The workshop manifests are kept like the rest, so the install works offline too.

It is not only for installed apps. Every browser that opens the app gets the worker, and from then on the page comes from the copy on the device, not from the server.

## When a new version is deployed

**The update.** On every open the browser asks the server, in the background, whether `/sw.js` has changed. After a deploy it has: the list of files in it names the new script. The browser then installs the new worker beside the old one. Installing means downloading every file of the new version into a fresh copy. The open page goes on meanwhile, served by the old worker.

**Taking over at once.** Once installed, a new worker would normally wait until every tab of the app is closed. Ours does not wait (`skipWaiting` and `clientsClaim` in `dist/sw.js`, from `registerType: 'autoUpdate'` in `apps/web/pwa.ts`). It takes over at once and drops the old files. This is kept on purpose (ADR 0029): on a phone a tab is almost never closed, and a reload does not close it, so a worker that waits might never take over. Taking over at once makes the next open the new version, even a reload in the same tab.

**Why the page used to reload, and no longer does.** Until 19 November 2026 the page registered the worker through code that came with the plugin, and that code reloaded the page the moment a new worker took over. So the first open after each deploy showed the page twice: "the second jump". On a slow line the second showing came when the download was done, many seconds in, and took a half-written answer with it. Now the page registers the worker itself (`apps/web/src/lib/offline-copy.ts`) and does nothing when it takes over. The open page keeps running the version it was loaded with. That is safe because the client is one script and one stylesheet, both already loaded; it asks for no file later, so nothing it needs is among the files dropped. A test holds the client to that.

**What it means for a tester.** The first open after a deploy runs the version from before it; the open after that runs the new one. So to test a deploy, open staging twice, or open it in a new private tab, which has no copy and always gets the newest version. The page about the app links to the source at the running commit: that is how to tell which version is open.

## What to remember

- An app installed before a change to its manifest keeps the old start address. Remove it and add it again.
- After a deploy, a device runs the new version from its second open. A private tab gets it at once.
- An installed app that is only brought back to the front does not load its page again, so it stays on the version it has until it is opened afresh. That was so before ADR 0029 as well.
- Nothing identifying ever goes into the manifest or the address: only the workshop's slug, which is public.

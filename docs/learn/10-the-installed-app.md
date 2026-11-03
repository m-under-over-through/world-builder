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

## What to remember

- An app installed before a change to its manifest keeps the old start address. Remove it and add it again.
- Nothing identifying ever goes into the manifest or the address: only the workshop's slug, which is public.

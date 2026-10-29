# The skeleton, end to end: where an answer goes, file by file

## The idea

A walking skeleton is the thinnest path that touches every part of the system. Nothing in it is finished, but everything in it is real: the real schema, the real encryption, the real API, the real client, the real export. Once it stands, every later change is an addition to something that already works, and you can always answer "where does an answer go after I tap save" by reading five files.

## The path, with the files

1. **The participant taps Save** in `apps/web/src/App.svelte`, function `save`. The text is cut to 4,000 code points (not UTF-16 units, so an emoji is never halved: `apps/web/src/lib/deck.ts`) and handed to `sealAnswer` from `@wb/crypto` with the workshop's public key. The key came from the workshop folder at build time (`apps/web/src/lib/workshops.ts`): production builds embed `workshop.json`'s key, every other build the staging key, which is why the panel shows `de7f-…` locally and will show `07aa-…` in production.
2. **The sealed envelope becomes an event** in the device store (`apps/web/src/lib/store.ts`, a Dexie database named after the workshop). The event carries a client-generated UUID, the card id, a sequence number, the day, and `synced: 0`. The plain text is gone the moment `sealAnswer` returns; nothing readable is ever written to the device.
3. **Sync** (`apps/web/src/lib/sync.ts`) collects everything with `synced: 0`, splits it into batches the API accepts (`batches.ts`: at most 200 events, under one megabyte each, sessions first), and posts each to `/api/<slug>/sync` with the code in the `Authorization` header (`api.ts`). Accepted ids are marked `synced: 1` with the day, kept for fourteen days, and re-sent if the server ever reports them missing (`reconcile`).
4. **The Netlify Function** (`netlify/functions/api.mts`) receives the request and hands it to the Hono app (`apps/api/src/app.ts`). The app resolves the workshop from the slug, computes the keyed hash of the code with the pepper (`apps/api/src/auth.ts`), finds the participant, checks the per-code rate bucket, reads the body with a byte cap, parses it with the strict contract schema, and calls `syncBatch`.
5. **The database layer** (`packages/db/src/queries.ts`, `syncBatch`) inserts sessions and events with `ON CONFLICT DO NOTHING`, so a retry can never duplicate, and only reports an id as accepted if it exists afterwards under a session of this participant. The schema (`schema.ts`) has no column that could hold a name. The SQL that created the tables is in `packages/db/drizzle/0000_*.sql`, generated from the schema.
6. **The export tool** (`tools/workshop/export.ts`), run on your machine with the private key file, joins events to sessions to participants for one workshop, opens each sealed body with `openAnswer`, assigns fresh pseudonyms, and writes a CSV into `.secrets/exports/`. This is the only place in the whole system where an answer is readable.

## Run it yourself

Two terminals:

```
node apps/api/dev.ts          # the API on :8788, Postgres in .secrets/local-db, wave-1 open
npm run dev:web               # the client on :5173, proxying /api to the API
```

Open `http://localhost:5173/rural-manufacturing/join/wave-1`. Go through a session. Then stop the API (the local database can be opened by one process at a time) and run:

```
node tools/workshop/export.ts rural-manufacturing --key .secrets/dev-rural-manufacturing.private-key
```

The CSV in `.secrets/exports/` has your answers in plain text. The database never did: `node --input-type=module -e "..."` against `.secrets/local-db` shows bodies starting with `v1.`.

## The same thing, deployed

On Netlify the build runs three steps (`netlify.toml`): apply migrations to the context's database, load the workshop folders into it, build the client. The context decides everything: production deploys use the `production` Neon branch, the production pepper and the production key; branch deploys and previews use the `staging` branch, the staging pepper and the development key. No connection string is ever on a laptop; the operator sets them once in Netlify's environment variables and in the vault.

## What the skeleton taught, this time

- The local on-disk Postgres (PGlite) takes a lock: one process at a time. The export tool against the local database needs the development API stopped. Neon has no such limit.
- "Cards already answered" must come from the server's record, not only the device's: a wiped or second device would otherwise repeat the first card. The client now combines both.
- The empty session: the client creates a session row the moment a session starts, so a participant who opens the app and leaves has a session with no events. Harmless for the analysis, slightly misleading in "sessions count"; a later change can count only sessions with events.
- `npm install` with several packages in one command sometimes installed only the first. Installing one at a time, or checking `npm ls` afterwards, is the habit.
- Prettier needs a plugin to format Svelte files, and a command that chains on its success stops silently when it fails. Check the exit, not the output.

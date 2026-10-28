# 0012. Libraries for the walking skeleton, and rate limiting without addresses

Date: 2026-10-28. Status: accepted.

## Context

The skeleton needs a database layer, an API runtime, a client framework and a way to run everything locally with no accounts, so the operator can read and run the whole path on a laptop. ADR 0009 named candidates; this record fixes them and adds the rule for rate limiting, which the architecture plan left open because the usual tool, the client's IP address, is something we never store.

## Decision

- **Database access: Drizzle ORM** with its SQL migrations (`drizzle-kit generate`). The schema is TypeScript that reads like the table list in the architecture plan, every query is typed, and the generated migrations are plain SQL files you can read in `packages/db/drizzle/`.
- **Two drivers, one schema.** In production and staging, Neon's serverless HTTP driver (`@neondatabase/serverless`), which suits a function that lives for one request. In tests and on a laptop, **PGlite** (`@electric-sql/pglite`), a real Postgres compiled to WebAssembly that runs inside the Node process. The same migrations run on both, so `npm test` exercises the real SQL with no database to install and CI needs no service.
- **API: Hono.** A small router on web-standard Request and Response. The same `app.fetch` serves a Netlify Function in deployment and a local Node server (`@hono/node-server`) in development.
- **Client: Svelte 5 with Vite**, Dexie for IndexedDB, and later vite-plugin-pwa for the service worker and install manifest. Svelte templates read close to the screen map, and the bundle is small for phones on poor connections.
- **Rate limiting without addresses.** Authenticated routes are limited per participant: a counter per (code hash, route, minute) in a small table. Unauthenticated routes (join, wave opened, unknown codes) have no per-client identity on purpose, so they get a **budget per workshop per minute** instead: a counter per (workshop, route, minute) with a generous ceiling. A flood exhausts the budget for everyone on that workshop for a minute, which is the accepted cost of never looking at an address. Both counters hold no personal data and are deleted after an hour by the nightly job.
- **Bundling the function: esbuild**, run by our own tool at build time (`tools/ops/bundle-api.ts`), so the deployed function is one plain JavaScript file with nothing to resolve at runtime. Why the packager alone did not suffice is in ADR 0011's amendment of 28 October.
- **Secrets and environment.** `DATABASE_URL` and `WB_PEPPER` come from the environment: Netlify environment variables in deployment, a gitignored `.secrets/local.env` on a laptop, nothing at all in tests (PGlite in memory, a fixed test pepper).

## Consequences

- `npm test` runs the real schema against real Postgres SQL in memory. Slower than mocks by a second or two; worth it.
- One line of configuration selects the driver by the shape of `DATABASE_URL`: `pglite://` for local, `postgres://` for Neon.
- The workshop and its waves are rows in the database, loaded from the workshop folder by a tool (`workshop sync`), so the API never reads the repository at runtime.

## Alternatives not taken

- Raw SQL without an ORM: fine for this size, but typed queries catch the cross-workshop mistake the plan fears most.
- Prisma: heavier, its own query engine, less transparent SQL.
- A Postgres container for tests: needs Docker on every machine and in CI.
- IP-based rate limiting with hashed addresses: a hashed address is still an address.

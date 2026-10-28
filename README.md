# World Builder

A card-based reflection app for participatory future-building workshops. Participants open a link from a newsletter, see one simple question at a time about an alternative future, and answer in their own words over several short sessions. No accounts, no cookies, no tracking; answers are encrypted on the device to a key the server never has.

Planning sprint: 23 October 2026. First workshop: the future of local manufacturing in rural America, launching 16 November 2026. Next: a worldbuilding class at the end of November.

## The map

| Path                                  | What it is                                                                                                                                      | Owner                 |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `docs/architecture-and-risk-plan.md`  | Why the system is shaped this way, and what it does about each failure we fear                                                                  | Marco                 |
| `docs/design-and-development-plan.md` | How we work, who does what, the schedule to launch                                                                                              | Marco                 |
| `docs/services.md`                    | Every outside service, why, cost, and what breaks without it                                                                                    | Marco                 |
| `docs/glossary.md`                    | The words. Law.                                                                                                                                 | integrator            |
| `docs/screen-map.md`                  | Every screen and state of the client                                                                                                            | integrator            |
| `docs/adr/`                           | Decision records, one per decision, numbered                                                                                                    | integrator            |
| `docs/learn/`                         | Explainers for the ideas in this codebase, written for the operator                                                                             | integrator            |
| `docs/account-setup.md`               | The order and settings for opening the vendor accounts, with checkboxes                                                                         | Marco                 |
| `docs/build-log.md`                   | What was done, when, why, how to verify. Read this first when returning                                                                         | everyone              |
| `docs/runbook.md`                     | One entry per error code and per service: meaning, cause, fix, check                                                                            | ops                   |
| `CLAUDE.md`                           | Instructions for agents                                                                                                                         | integrator            |
| `packages/contracts`                  | The shared vocabulary as Zod schemas: events, sessions, decks, workshops, API, error codes                                                      | integrator            |
| `packages/crypto`                     | Sealing answers to a workshop key and opening them with the private key                                                                         | integrator            |
| `packages/db`                         | The database: Drizzle schema, generated SQL migration, queries, the workshop loader; tests on an in-process Postgres                            | integrator            |
| `packages/deck`                       | The deck engine: seeded shuffle, dismiss and defer (not yet; the skeleton picks cards in file order)                                            | deck builder          |
| `apps/web`                            | The client: Svelte and Vite, Dexie store, outbox and sync, the privacy panel. Skeleton flow today; intro, Later pile, install and hints to come | UI builder            |
| `apps/api`                            | The API: Hono app with every route, keyed hash, byte caps, rate buckets; `dev.ts` runs it locally                                               | API builder           |
| `netlify/functions`                   | The one function that hands `/api/*` to the Hono app                                                                                            | integrator            |
| `tools/workshop`                      | `keygen`, `sync` (folders into the database at deploy), `export` (decrypt to CSV on your machine); later `new`, `close`, `delete`               | ops                   |
| `tools/ops`                           | `migrate` (at deploy) and `pepper`                                                                                                              | ops                   |
| `workshops/<slug>/`                   | A workshop: `workshop.json`, `deck.json`, `copy.md`                                                                                             | Marco and the partner |

## Where an answer goes

1. A participant types an answer on the card. The client seals it to the workshop's public key (`packages/crypto`) and writes an `answered` event to the outbox on the device. No readable copy stays behind.
2. When online, the client posts the outbox to `/api/<slug>/sync` with the anonymous code in a header. Every event has a client-generated id, so a retry can never duplicate.
3. The API validates the batch against `packages/contracts`, checks the code's keyed hash, and stores the rows under the workshop. It cannot read the answer.
4. Nightly, the backup job dumps the database and each workshop's rows, encrypts the dumps, and uploads them to a Backblaze bucket and keeps a copy as a GitHub artifact in the private ops repository.
5. At the end, the operator runs the export tool on their own machine with the private key from the vault. The answers become readable there, and only there, and are scrubbed and handed over as a spreadsheet.

## Running things

```
npm install
npm run check          # typecheck (tsc and svelte-check), tests, formatting
npm run dev:api        # the API on :8788 with a local Postgres and wave-1 open
npm run dev:web        # the client on :5173; open /rural-manufacturing/join/wave-1
npm run workshop:keygen -- rural-manufacturing --dev
```

Node 24 or later. No global tools.

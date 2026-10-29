# 0011. Zero-cost hosting: Netlify for client and API, Neon free, Backblaze plus GitHub artifacts for backups

Date: 2026-10-24. Status: accepted. Amends the hosting parts of ADR 0009 and ADR 0010.

## Context

The first partner's budget turned out to be small and the following use is a class whose students use the app for themselves. The project is an experiment, not a service with a hosting line, and Marco asked for a setup that costs nothing without giving up security. The earlier plan spent about 10 to 20 USD a month on Cloudflare's paid Workers plan and Neon's paid tier. Neither held any of the privacy or security properties; they bought operational margin.

## Decision

- The client and the API run on Netlify, which already hosts the domain's DNS and the main site. The API is a Netlify Function on the same hostname, so ADR 0008 (one origin) holds. Staging is a branch deploy with its own environment variables.
- The database is Neon's free tier, US East (Ohio), the region of Netlify's functions, with a `staging` branch.
- Backups: the nightly GitHub Actions job in the ops repository dumps and encrypts, uploads to one Backblaze B2 bucket with Object Lock, and keeps the same file as a workflow artifact for 30 days. Two vendors, two copies, zero cost.
- Monitoring: Better Stack's free tier, with a heartbeat from the backup job.
- Cloudflare is not used.

## What free tiers take away, and what covers it

- **Restore window: six hours instead of seven days.** The nightly dumps are the real backup. In addition the device keeps events the server has accepted for fourteen days and, if the server reports fewer than the device holds, re-sends them; sync is idempotent, so a restored database refills itself from the phones. Participants cannot read those envelopes even if they wanted to.
- **A usage allowance that can pause the site.** Netlify pauses a free site over its monthly allowance until an upgrade. At this scale that takes deliberate abuse. Netlify's usage alerts are on, and the lever is one month of the paid plan, which unpauses within minutes.
- **Thinner logs.** Netlify's free plan keeps function logs for about a day. The health endpoint, the diagnostics view and the error codes were designed to carry the signal themselves.

## Consequences

- Monthly cost is zero beyond the vault's ten dollars a year.
- Three new free accounts instead of four, one of them paid.
- If a workshop becomes a paid service again, the paid tiers are a setting change, not a rewrite.
- The API builder writes a Netlify Function (web-standard fetch handler calling `app.fetch`) and uses Neon's serverless HTTP driver; secrets are Netlify environment variables scoped to functions.

## Alternatives not taken

- Cloudflare's free Pages and Functions: no pause risk, a fourth vendor and a card on file for R2.
- Keeping Neon's Launch plan: a seven-day restore window for a few dollars a month; the re-sync covers the gap for an experiment.

## Amendment, 28 October 2026: the function is bundled by our own script

The first staging deploy failed at the function's first request: Netlify's packager had turned `netlify/functions/api.mts` into JavaScript but left the workspace packages outside the file, and its copy of them held manifests without the TypeScript source behind the links. The fix, and the rule from here on:

- `tools/ops/bundle-api.ts` bundles the function entry with esbuild into `netlify/functions-build/api.mjs`, one file whose only remaining imports are Node's own modules. It runs as the third step of the build command, refuses to finish if any other import is left outside, and bakes the deploy's commit into the file so `/api/health` reports it. `netlify.toml` names that folder as the functions directory.
- `@wb/db` exposes the Neon connector at its root and the PGlite-capable dispatcher at `@wb/db/connect`, so the function's import graph never contains a test database.
- `apps/api/test/bundle.test.ts` proves both: the graph, and the built file running in a plain Node process.

esbuild is a declared development dependency (it was already present through drizzle-kit and Vite). Explained in `docs/learn/07-bundling-the-function.md`.

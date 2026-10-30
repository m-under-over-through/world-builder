# Brief: operations (`tools`, the runbook, scans, drills)

One builder, all week, independent of the other three. Works in this repository and in the private ops repository.

## Goal

The operator's tools are tested and cannot overwrite what they should not; the runbook describes the code as it is, not as it was planned; the headers and dependencies are scanned in CI; every drill the plan names has a page and a script; and nothing in either repository says "to be written".

## Read first

`CLAUDE.md` (the "Everyone" notes at the end); `docs/glossary.md`; `docs/runbook.md`, the whole of it; `docs/services.md`; `docs/architecture-and-risk-plan.md` sections 11, 12 and 14; `docs/adr/0011`, `0012`; `docs/learn/08-backups.md`; `tools/**`; in the ops repository, `README.md`, `runbook/*.md`, `scripts/*.sh` and `.github/workflows/*`.

## Files owned

`tools/**`, `docs/runbook.md`, `docs/services.md`, `.github/workflows/**`, `apps/web/public/_headers`; in the ops repository, everything.

## Items, each one pull request

1. **The export tool, tested and safe.** `tools/workshop/export.ts` gets tests (a sealed fixture, the CSV's columns, the pseudonyms fresh per run, a wrong key refused with its code) and writes with `wx`, so a second export the same day is refused unless an explicit `--overwrite`-style flag says so. Unknown flags refused, as `CLAUDE.md` says.
2. **The other tools, tested.** `pepper.ts` (32 bytes, mode 600, refuses to overwrite), `migrate.ts` (does nothing without a URL, refuses a URL that is not `postgres`), `workshop sync` (upserts, uses the staging key outside production, turns draft into open, never creates a second `wave-1`).
3. **The runbook, de-provisioned.** Every entry marked _Provisional_ whose code exists loses the mark and is checked against the code, including the six that describe something the code does not do (a `/api/<slug>/health` route, a wave's dates, a validation log line until the API builder writes one, a client storage fallback until the UI builder builds one). The services section is written: Netlify, Neon, Backblaze, Better Stack, GitHub, Bitwarden, the Google Workspace alias, each with where the login is, what it costs, what breaks without it, and the vendor page in the ops repository. The API and UI builders' runbook proposals, from their reports, are applied here.
4. **Scans in CI.** A headers test in this repository that reads `apps/web/public/_headers` and asserts the CSP's every directive is `'self'` or `'none'` (with the two allowed exceptions, `img-src data:`), the Permissions-Policy denies microphone, camera and location, and HSTS carries `includeSubDomains` (add it; `preload` is Marco's decision in the plan). A weekly workflow in the ops repository that runs the OWASP ZAP baseline scan and a headers scan against staging, with a page that says what a finding looks like and which ones are accepted. A dependency audit step in `ci.yml` (`npm audit --audit-level=high`, or Dependabot; propose which in the report).
5. **The staging reset page.** `runbook/neon.md` or a new page in the ops repository: Neon's Reset from parent on `staging` (connection details unchanged, per Neon's guide), then the staging branch deploy retried from its row; rehearsed once, with the observations recorded; a note on what a device with a stored code sees afterwards (`AUTH_CODE_UNKNOWN`, Welcome), checked against the client once the UI builder's item 9 lands.
6. **The laptop-is-gone drill.** A page in the ops repository: from a blank machine, what to install, what to take from the vault and from paper, in what order, until `npm run check` passes and `scripts/unseal.sh` opens a backup. Scripted where it can be (`scripts/setup-laptop.sh` that installs the tools and checks versions), the rest a checklist with expected observations. Run once in a fresh user account on the laptop.
7. **Small corrections.** `docs/services.md` artifact retention 30 to 14 days; the heartbeat page's grace period once Marco sets it; the README map's `tools/workshop` row when tools change (propose; the README is the integrator's).
8. **If the week allows: `workshop status`.** The operator's command from the plan: participants, sessions, events, invites spent, last backup, per workshop, read with the direct string; nothing per person. The 17-23 November tier; start only when items 1 to 7 are merged.

## Tests that define done

Every tool has a test file under `tools/*/test`; `packages/contracts/test/runbook.test.ts` still passes with every code present; the headers test passes; the ops repository's `checks.yml` runs every script's test. `npm run check` passes.

## By hand

Each pull request's description says what to run and what to see: an export refused the second time, the migrate tool refusing a `psql` snippet, the ZAP workflow's first report, the reset rehearsal's observations, the fresh-account run of the laptop drill.

## Do not touch

`apps/api`, `apps/web` except `public/_headers`, `packages/*`, `workshops/*`, the briefs.

## Report

Under "Report": every runbook entry changed and why; the scan findings accepted and why; the drill observations; proposals for the contracts, the glossary and the README.

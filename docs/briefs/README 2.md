# Briefs

A brief is the whole contract between the integrator and a builder: the goal, the files the builder owns, the tests that define done, what not to touch, and the shape of the report back. A builder is an agent session in its own working copy with nothing but this folder, the repository and `CLAUDE.md`. It builds what the brief specifies; when the brief is wrong or silent, it asks in its report rather than inventing.

The rules below apply to every brief in this folder. The plan behind them is `docs/design-and-development-plan.md`, sections 3, 4 and 7.

## How a builder works

- **Read first:** `CLAUDE.md`, `docs/glossary.md`, `docs/screen-map.md`, the brief, and the parts of `docs/architecture-and-risk-plan.md` the brief names. The glossary's words are the only words.
- **One branch per pull request, one pull request per item** of the brief's list, in the brief's order unless the brief says the order is free. Small: one screen, one rule, one tool. A pull request that touches two items is two pull requests.
- **Every pull request** has tests for the behaviour it adds, a description that says what changed and why, a "how to verify by hand" section the operator can follow on the deploy preview or on a laptop, an entry at the end of `docs/build-log.md` (date, what, why, how to verify, decisions, open questions), and a runbook entry for every new error code. `npm run check` passes before the commit. Commit messages end with the trailer in `CLAUDE.md`.
- **Deploy previews are the test bench.** Every pull request gets `https://deploy-preview-<n>--worldbuilder-uot.netlify.app`, built against the staging database. The by-hand section names the address and the taps.
- **Files owned.** The brief lists them. Nothing outside the list is edited; a change needed outside it is a line in the report, with the reason. Two builders never hold the same file; the integrator keeps the table in `week-2-plan.md` free of overlaps.
- **Contracts are the integrator's.** `packages/contracts` is read, never edited. A builder that needs a new schema, route, error code or word writes the proposal in its report and carries on with what the contract allows.
- **No new dependency** without a line in `docs/services.md` or a decision record; ADR 0012 already names the client, database and API libraries, so those need nothing more.
- **No personal data, one origin, sealed answers, workshop scoping, append-only events**: the non-negotiables in `CLAUDE.md` hold for every line. A pull request that weakens one is not ready, whatever else it does.
- **The report** at the end of each pull request's description, under the heading "Report": what was built, what was left out and why, every question for the integrator, every proposal for a contract or glossary change, and anything learned that the next builder should know. Plain words; the operator reads it.

## What the integrator does with a pull request

Reads the report, runs the independent reviewer, reads the diff, tries the preview, merges with a merge commit, runs the skeleton end to end on staging, and answers the report's questions in the next brief or in a comment on the pull request.

## The briefs

| File             | Stream                           | Builder session                                            |
| ---------------- | -------------------------------- | ---------------------------------------------------------- |
| `week-2-plan.md` | The gap list and the schedule    | Nobody builds from it; it is the map                       |
| `week-2-deck.md` | The deck engine, `packages/deck` | First; one day; the UI builder depends on it               |
| `week-2-ui.md`   | The client, `apps/web`           | The long pole; starts on the skeleton, picks up the engine |
| `week-2-api.md`  | The API and database tests       | Done by Tuesday, so the client tests against the final API |
| `week-2-ops.md`  | Tools, runbook, scans, drills    | Independent of the other three                             |

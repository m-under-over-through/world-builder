# Brief: the API and the database (`apps/api`, `packages/db`)

One builder, done by Tuesday 3 November, so the client tests against the final thing.

## Goal

Every route and error code in the contract behaves as the runbook says, is tested over HTTP, and refuses what it must: the byte cap in bytes, the authorization boundary between participants, the limits that keep a bad day from becoming a bad week. The API is small and its correctness needs no taste; finish it first.

## Read first

`CLAUDE.md` (the API builder notes at the end); `docs/glossary.md`; `packages/contracts/src/api.ts` and `events.ts`; `docs/architecture-and-risk-plan.md` sections 6, 9 and 12; `docs/adr/0002`, `0005`, `0006`, `0012`; `docs/runbook.md` entries for every server code; `apps/api/src/app.ts`, `apps/api/test/*`, `packages/db/src/queries.ts`, `packages/db/test/*`.

## The contract to satisfy

`packages/contracts/src/api.ts` as it is, with two changes the integrator makes before Monday and the builder then relies on: `JOIN_WAVE_CLOSED` is removed from `ERROR_CODES` and the runbook (the wave window is the workshop's days, ADR 0006, enforced as `WORKSHOP_CLOSED`), and the comment on `JOIN_CODE_TAKEN` is corrected to say that join has its own bucket per workshop. If Marco decides to raise the join limit, the number arrives in the brief's first comment.

## Files owned

`apps/api/**`, `packages/db/**`, `netlify/functions/**`.

## Items, each one pull request

1. **The byte cap in bytes.** Refuse by `Content-Length` when present, else read the body with a limit in bytes and refuse at the limit, before parsing; never measure a string's length. Test with a body of multi-byte characters just over the cap.
2. **A validation log line.** On `REQUEST_INVALID` and `SYNC_PAYLOAD_INVALID`, one log line with the route, the error code and the Zod issue paths; never a value, never a body, never a code or a hash. Test that the line is written and carries no data from the request.
3. **The tests the table lacks.** Over HTTP: `WORKSHOP_CLOSED` on sync, me, invites and delete; `JOIN_WAVE_FULL`, `JOIN_INVITE_INVALID`, `JOIN_WAVE_UNKNOWN` on join; `RATE_LIMITED` on every bucket, with the response body checked against `errorResponseSchema`; `SERVER_ERROR` with its `errorId` matching a log line; `REQUEST_TOO_LARGE` on sync; idempotent sync (the same batch twice, the same accepted ids, one row); the route table (every entry of `ROUTES` is served, and nothing else is).
4. **Authorization over HTTP.** Code A cannot write into B's session through `/sync`, read B through `/me`, spend B's invites or delete B; an invite spent twice at once is spent once; a code from one workshop is unknown in another. Each a test named as a behaviour. The manual authorization test from section 12 becomes a short section in the runbook's Neon or Netlify entry, the ops builder's file: propose the text in the report.
5. **The limiter's rows.** Decide and implement one of: prune `rate_buckets` older than an hour on every hundredth request (one delete, bounded), or leave the prune to the nightly job and document the bound (about one row per minute per live bucket). Recommended: prune on the way; the job's prune stays as the backstop. Test the bound either way.
6. **Join under a newsletter.** If Marco raises the join limit, change the number and the test; either way, document in the runbook's `RATE_LIMITED` entry what a participant sees and that the client retries once.

## Tests that define done

`apps/api/test` and `packages/db/test` cover every row of the error-code table over HTTP; `npm run check` passes; the bundle test still runs the function three ways.

## By hand

On the deploy preview, with `curl`: a 413 for a large body, a 401 with no data for a wrong code, a 429 with the contract's body after the limit, and the health endpoint's shape. The description lists the commands.

## Do not touch

`packages/contracts` (propose), `apps/web`, `tools`, `docs/runbook.md` (propose the wording in the report; the ops builder edits it).

## Report

Under "Report": every proposal for the runbook (the ops builder applies them), for the contracts, for the glossary; any behaviour the runbook describes that the code cannot do; the limiter decision and its bound.

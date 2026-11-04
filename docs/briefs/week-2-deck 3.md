# Brief: the deck engine (`packages/deck`)

One builder, one day, first in the week. The UI builder picks this package up on Tuesday.

## Goal

A package of pure functions that decides which cards a session shows, in what order, and what happens on dismiss, exactly as the architecture plan's section 8 says. No I/O, no storage, no Svelte: inputs in, a plan out, so every rule has a test and the client only renders.

## Read first

`CLAUDE.md`; `docs/glossary.md`; `docs/architecture-and-risk-plan.md` section 8; `packages/contracts/src/deck.ts` (the deck schema), `packages/contracts/src/events.ts` (the event kinds), `packages/contracts/src/workshop.ts` (`warmupsPerSession`, `checkpointsPerSession`); `apps/web/src/lib/deck.ts` (what the skeleton does today, to be replaced by this package); `packages/crypto` for the shape of a package in this repository (package.json, `src/index.ts`, `test/`).

## The contract to satisfy

Exports, from `packages/deck/src/index.ts`, with these names:

- `planSession(input): SessionPlan`. Input: the deck, `warmupsPerSession`, `checkpointsPerSession`, the session's `seed` (a string; the client already generates and stores one), and the participant's history: the set of card ids ever answered, and the list of card ids deferred in the previous session and not answered since, in the order they were deferred. Output: the ordered list of card ids for this session.
  - Deferred cards come first, in their order, counted against the set they belong to.
  - Then warm-ups up to the count, then checkpoints up to the count, each chosen by a seeded shuffle of the set, preferring cards never answered and cycling back to answered ones only when the set's unanswered cards run out.
  - The same inputs give the same output, always. Different seeds give different orders. A deck with fewer cards than the counts gives what it has, never a repeat within a session.
- `applyDismiss(plan, cardId, dismissedThisSession): { plan, event }`. First dismissal of a card in this session: the card moves to the end of the queue and the event to record is `dismissed`. Second dismissal of the same card in the same session: the card leaves the queue and the event to record is `deferred`. The caller writes the event; the engine never does.
- `isSessionOver(plan, answeredOrDeferredThisSession): boolean`: the queue is exhausted, which is after the last checkpoint.

Seeded shuffle: a small deterministic generator from the seed string (for example mulberry32 or xoshiro from a hash of the seed), written in the package, no dependency. The shuffle is the Fisher-Yates one.

Nothing in this package knows about sessions on the server, events in the outbox, or the screen. It takes plain data and returns plain data.

## Files owned

`packages/deck/**` (new). The workspace entry in the root `package.json` if the repository's other packages need one; look at how `packages/crypto` is wired and do the same.

## Items, each one pull request

1. The package with `planSession` and the seeded shuffle, with tests: same seed same order; different seeds differ; warm-ups before checkpoints; counts respected; unanswered preferred; cycling when exhausted; deferred first; small deck; empty history. The README's `packages/deck` row becomes true (propose the one-line change in the report; the README is the integrator's).
2. `applyDismiss` and `isSessionOver`, with tests: first dismiss moves to the end; second dismiss defers and removes; a dismiss of a card not in the queue is a no-op with no event; the session is over after the last checkpoint and not before.

## Tests that define done

`npm test` runs `packages/deck/test/*.test.ts`; every rule above has a test named as a behaviour ("a deferred card is shown first next session"). `npm run check` passes.

## By hand

None in the browser: the UI builder wires it. The pull request's "how to verify" says how to run the tests and shows one worked example: a deck of six cards, counts 3 and 1, seed `example`, the resulting order, and the order after one and two dismissals of the first card.

## Do not touch

`apps/web` (the UI builder replaces `lib/deck.ts` with this package), `packages/contracts`, the deck file in `workshops/`.

## Report

Under "Report" in the pull request description: the generator chosen and why; any rule in section 8 that is ambiguous and how it was read; the proposed README line; anything the UI builder must know to call it.

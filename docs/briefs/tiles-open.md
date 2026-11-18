# Brief: tiles open

For one builder. Read first, in this order: `CLAUDE.md`, `docs/adr/0024-tiles-open.md` (the decision; it is the specification), `docs/adr/0022-the-blank-card.md`, `docs/adr/0023-the-header-and-the-open-card-on-a-phone.md`, `docs/adr/0020-the-deck-rules-of-5-november.md`, and the glossary entries **tile**, **latest answer** and **blank card**. Then the files named below. Do not read the whole repository.

Marco asked for this on the evening of 18 November, as a thing to fix before the production address goes out. He will try it on his iPhone and on a laptop.

## What to build

A tap on a tile in "Your world so far" opens that card in a place to write. A card set aside can be answered there. An answer can be changed there. A blank card too.

1. **The latest answer.** One small pure function, in `apps/web/src/lib/session.ts` or a file next to it: given the history, the latest `answered` event for each card id, by the session's number and then by `seq`. Use it everywhere "the answer" is meant.
2. **The world** (`get world()` in `apps/web/src/lib/state.svelte.ts`):
   - one tile per card that has an answer, placed where its first answer is, showing the words of its latest one from this device's copies, or no words if that latest one was written elsewhere;
   - the set-aside tiles: every card with a `dismissed` or `deferred` event in any round and no `answered` event, oldest first, not only this round's;
   - each tile says whether it can be opened: a set-aside tile always; an answered tile or a blank-card tile only when this device holds the words of its latest answer;
   - the counts in the pill, the summary and the laptop's header follow the tiles.
3. **The place to write.** `OwnCard.svelte` becomes the one place to write for three cases: a blank card (as now), a card set aside (its area and question on top, the field empty), an answer being changed (the same, the field holding the words). One piece of state in `AppState` says which card is open there, and one draft per card id survives "Not now" in memory. Opening, closing, focus, Escape, the scrim, the limit and the counter are as for the blank card. The title is the question for a card of the deck; the blank card keeps its title and its hint.
4. **Saving.** As `saveOwnCard` does it: cut to the limit by code points, `sealAnswer` before anything is written, one `answered` event for that card id on the live round's session, the readable copy under `answerKey(live session, card id)`, the sync in the background. Then:
   - the live round knows the card is answered. If it is the front card, the next card comes forward as after any answer, and its draft in the stack is dropped;
   - a changed answer leaves the round as it was: the front card, its draft and the queue do not move;
   - an empty text, or spaces only, is not saved; a failed seal is `CLIENT_SEAL_FAILED` and stores nothing.
5. **The tiles as buttons** (`World.svelte`, `WorldSheet.svelte`): a tile that can be opened is a button whose name is what the tile shows. It carries the small pen the front card has next to "Write an answer", so it reads as something to tap. A tile that cannot be opened is as it is today. On a phone, a tap on a tile in the sheet closes the sheet and opens the place to write; closing that returns to the card screen, with the focus on the world pill.
6. **The export** (`tools/workshop/export.ts`): by default one row per participant and card id, the latest answer; the summary prints how many earlier versions were left out. With `--all-versions`, every row, and a last column `latest` with `yes` or `no`. Unknown flags are still refused. The file's header comment and the usage text say so.
7. **Words.** Two items for screen readers and for the pen's label, in `workshops/rural-manufacturing/copy.md` under "Your world so far", listed in `apps/web/src/lib/copy.ts`: `open answer: Change your answer` and `open aside: Answer this card`. No other new words: "Save" and "Not now" are the blank card's.

## Files you own

- `apps/web/src/lib/state.svelte.ts`, `apps/web/src/lib/session.ts`, `apps/web/src/lib/copy.ts` (key lists only)
- `apps/web/src/components/OwnCard.svelte`, `World.svelte`, `WorldSheet.svelte`, `Stack.svelte` where the front card must follow, `App.svelte`, `apps/web/src/app.css`
- the test files under `apps/web/test` that fit, and a new one for the tiles
- `tools/workshop/export.ts` and `tools/workshop/test/export.test.ts`
- `workshops/rural-manufacturing/copy.md` (the two items only)
- `docs/screen-map.md`, `docs/device-tests.md` (steps for opening a tile), `docs/build-log.md` (your entry)

Not yours: `packages/*` (nothing there needs to change: the server takes more than one `answered` event for a card, and the deck engine ignores a card that is answered), `apps/api`, `docs/adr`, `docs/glossary.md`, `docs/runbook.md`. If you find one of them must change, stop and say so in your report.

## Tests, named as behaviours

- "the latest answer to a card is the one from the highest round, then the highest place in the round"
- "a card set aside opens empty from its tile; Save records one answered event for that card, sealed, and its white tile becomes a tile with the words"
- "Not now on a card set aside records nothing, and the words are there the next time"
- "a card set aside twice opens and can be answered, and never comes round again"
- "answering the front card from its own set-aside tile brings the next card forward"
- "the set-aside tiles are those of every round, oldest first, and a card answered since is not among them"
- "an answer opens with its words; Save records a second answered event for the same card and the tile shows the new words in the same place"
- "changing an answer leaves the round as it was: the same front card, the same draft, the same queue"
- "a blank card opens with its words and keeps its id when changed"
- "one tile per card, also after a reload and after the server's rows come back"
- "an answer written on another device is a tile without words and not a button"
- "an empty text cannot be saved over an answer"
- "the counts follow the tiles: a changed answer does not count twice"
- accessibility: a tile that opens is a button with a name, at least 44 pixels to a finger; the focus goes into the field and comes back to the tile, or to the world pill on a phone; one h1, no level skipped
- the export: "one row per participant and card, the latest answer; the summary counts the earlier versions"; "with --all-versions every row, with the latest marked"; "an unknown flag is refused"

The traps from earlier weeks: a client test that syncs without `stubRoutes` hangs the whole Vitest run; hold only the timer you mean when you use fake timers.

## Looking at it

Start the local API (`node apps/api/dev.ts`, port 8788; it needs the folder `.secrets/` in the worktree) and the dev server yourself in the background, and stop both when done. In a phone view at 375 by 553 and 390 by 844, and at a laptop width: set a card aside, answer one, write a blank card; then open each tile, change the answer, answer the set-aside card, reload, and look again. Measure only after the layout has settled. One pass is enough.

## Done

- `npm run check` passes: output to a log file, look at the exit code, once before the pull request.
- One pull request from `tiles-open-and-edit` into `main`, opened with `gh pr create --repo m-under-over-through/world-builder`. Open it before you write its number in the build log. Its description: what changed and why; how to verify by hand, step by step; error codes (none); the decision record (ADR 0024). It ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- A build-log entry: date, what, why, how to verify, decisions made on the way, open questions.
- Commit messages: imperative first line under 72 characters, the why and the how-to-verify, and the trailer `CLAUDE.md` gives.
- No new dependency, nothing third-party, relative imports end in `.ts`, plain words, short sentences, no em-dashes.
- Do not merge. Report: the pull request; the files changed; every decision the brief did not make; what you saw at each width; the last lines of the check; and what you could not verify.

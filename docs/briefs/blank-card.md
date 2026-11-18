# Brief: the blank card

For one builder. Read first, in this order: `CLAUDE.md`, `docs/adr/0022-the-blank-card.md` (the decision; it is the specification), `docs/adr/0014-answers-stay-readable-on-the-device.md`, `design/DESIGN.md` (tokens, the card, the sheet, motion, accessibility), and the glossary entry **blank card**. Then the files named below. Do not read the whole repository, and do not copy from `design/artboards`.

This lives on the branch `blank-card` and is **not merged**. Marco will test the design and the words on the pull request's preview, and may ask for changes. Build it so that the words and the place of the button are easy to change.

## What to build

A participant on the card screen can press "Write your own card" and write a text of up to 4,000 characters under no question. Saved, it is an `answered` event like any other, and a tile in "Your world so far".

1. **The id.** `apps/web/src/lib/own-card.ts`, small and pure: `newOwnCardId(random?)` gives `OWN_CARD_PREFIX` (from `@wb/contracts`) and eight characters made the way `lib/invitations.ts` makes a link value. Reuse `VALUE_ALPHABET` and the `Random` type from there; do not write a second generator.
2. **The state**, in `apps/web/src/lib/state.svelte.ts`, only what this needs:
   - whether the blank card is open, and its draft, which survives "Not now" in memory (never in the store);
   - `openOwnCard()`, `closeOwnCard()`, and `saveOwnCard()`. Saving does what `save` does for a card, for a card id from `newOwnCardId`: truncate by code points to `MAX_ANSWER_CHARS`, `sealAnswer` before anything is written, one `answered` event on the live round's session through the same outbox, the readable copy through `putAnswer`, then the sync in the background. A sealing failure is `CLIENT_SEAL_FAILED`, as for a card, and nothing is stored. An empty text, or one of spaces only, is not saved.
   - Saving a blank card changes nothing about the round: the front card, its draft, the queue and the stack stay as they were. No `shown` event is recorded for it.
   - It is available whenever there is a live round, also when the deck is done. It is not available on the welcome, on the about page or while the onboarding card is in front.
3. **The world.** `get world()` leaves out events whose card is not in the deck. Blank cards are the exception: an `answered` event whose card id `isOwnCardId` is a tile, in the order written within its round, after that round's card tiles. The tile has no question; where a card's tile shows its area it shows the label from the copy file. On a device that did not write it, it shows as every answer does there.
4. **The place to write.** A new component, shown over the card screen. On a phone a sheet, built the way `WorldSheet.svelte` is (focus moves in, stays in, and returns to the button that opened it; Escape and "Not now" close it). On a laptop (`app.wide`) a wide card over the desk with the same content. Title, the hint, the line about names, a large field with its own accessible name, the counter only near the limit as `Stack.svelte` does it, and the buttons "Save" and "Not now". "Save" is disabled while the field is empty.
5. **The button.** In `Stack.svelte`, under the stack with "Set aside": a quiet text button, less prominent than "Set aside". When the deck is done it sits under the thank-you card. It is not there while the onboarding card is in front.
6. **The words**, in `workshops/rural-manufacturing/copy.md`, under a new screen heading `# Your own card`, placed before `# Invitation page`, and their names in the key lists of `apps/web/src/lib/copy.ts`. Drafts below.

## The words, as drafts

```
# Your own card

## Own card: button (a few words)

Write your own card

## Own card: title (a few words)

Your own card

## Own card: hint (under 40 words)

[placeholder]
Is there something you already want to say that no card has asked? A story, an idea, a worry. Write it here, in your own words and at your own length.

## Own card: names (one line)

[placeholder]
Please leave out the names of people.

## Own card: field (a few words)

Your own words

## Own card: buttons (one or two words each)

- save: Save
- not now: Not now

## Own card: tile (a few words)

Your own card
```

Follow the file's conventions: a comment above each block saying who sees it and where, the length note in parentheses, `[placeholder]` on the drafts of whole sentences.

## Files you own

- `apps/web/src/lib/own-card.ts` (new), `apps/web/src/lib/state.svelte.ts` (only what this needs), `apps/web/src/lib/copy.ts` (key lists only)
- the new component, `apps/web/src/components/Stack.svelte`, `World.svelte` and `WorldSheet.svelte` where the tile needs it, `App.svelte`, `apps/web/src/app.css`
- `apps/web/test/own-card.test.ts` (new) and the test files that fit (state, card, app, accessibility)
- `workshops/rural-manufacturing/copy.md` (the new section only)
- `docs/screen-map.md` (the blank card under "Always reachable"), `docs/build-log.md` (your entry)

Not yours: `packages/contracts` (`OWN_CARD_PREFIX`, `isOwnCardId` and the deck rule are already there), `packages/deck`, `apps/api`, `tools`, `docs/adr`, `docs/glossary.md`, `docs/runbook.md`. The server and the export need no change; if you find they do, stop and say so in your report.

## Tests, named as behaviours

- "a blank card's id is own- and eight characters of the alphabet, and is never an id of the deck"
- "Write your own card opens a place to write with no question; Not now closes it, the front card is unchanged, and the words are there the next time"
- "Save records one answered event with a sealed body and a card id that starts with own-; the text sent is not the text written; the readable copy stays on this device"
- "saving a blank card leaves the round as it was: the same front card, the same draft, the same queue"
- "a second blank card gets another id, and both are tiles in Your world so far, after the round's cards, in the order written"
- "an empty text, or spaces only, is not saved"
- "a text longer than the limit is cut at 4,000 characters by code points, never through a pair"
- "when sealing fails nothing is stored and the page says CLIENT_SEAL_FAILED"
- "with the deck done, the blank card is still offered, and saving it does not bring a card back"
- "the blank card is not offered on the welcome or while the onboarding card is in front"
- "on a device that did not write it, the tile shows without its words"
- accessibility: the focus goes into the field on opening and back to the button on closing; Escape closes; the two buttons and the opener are at least 44 pixels to a finger; one h1 on the screen, no level skipped

The traps from earlier weeks: a client test that syncs without `stubRoutes` hangs the whole Vitest run, so stub the routes in every test that opens the app; and hold only the timer you mean when you use fake timers.

## Done

- `npm run check` passes. Run it once, before the pull request, with its output in a log file; look at the exit code.
- One look in a browser at the end, at phone width and at laptop width. To serve this worktree, start the dev server yourself in the background on a free port (`npm run dev --workspace=apps/web -- --port <port> --strictPort`) and stop it when you are done. Open a join link with a new value after `#p=`, press "I understand", open the blank card, write, save, and look at the tile. Do not loop on screenshots.
- One pull request from `blank-card` into `main`, opened with `gh pr create --repo m-under-over-through/world-builder`, marked as a draft (`--draft`): it waits for Marco. Open it before you write its number in the build log. The description has: what changed and why; how to verify by hand, on the preview; error codes added (none); the decision record (ADR 0022, proposed); and a line saying it must not be merged before Marco has tested it. It ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- A build-log entry: date, what, why, how to verify, decisions made on the way, open questions.
- Commit messages: imperative first line under 72 characters, the why and the how-to-verify, and the trailer `CLAUDE.md` gives.
- No new dependency. No third-party anything. Relative imports carry `.ts`. Plain words, short sentences, no em-dashes.
- Do not merge. Report what you built, every decision the brief did not make for you, what you saw in the browser, the result of the check, and what you could not verify.

## After the first review (18 November 2026)

The reviewer's verdict: ready to merge once Marco approves the design. Nothing blocks. These are for the next round, together with whatever Marco asks for on the preview:

1. **A test on `seq`.** Save a card, a blank card, a card, a blank card: the events' `seq` are in order and no number comes twice. Two `saveOwnCard()` calls started together store one event.
2. **The open flag.** `ownCardOpen` stays true when the screen leaves the cards while the dialog is open (a sync that finds the workshop closed). Clear it when the blank card stops being offered.
3. **The swipe hint.** Saving a blank card before any card is answered marks the round as touched, so the hint under the first card is gone after a reload. A blank card should not count as a touch.
4. **Three tests that are missing**: a click on the scrim closes and keeps the words; "Delete everything" removes a blank card's copy; a second device that replays the server's rows shows the blank card's tile and plans the same round.
5. **The limit with an emoji.** `sealAnswer` now counts characters as the client does (pull request 63). Once `main` is merged into this branch, the test on the limit can save a full-length text that holds an emoji.

Not for this branch: if the readable copy cannot be written after the event is stored, the save can be repeated with the same `seq`. An ordinary card's save has the same gap; it gets its own change.

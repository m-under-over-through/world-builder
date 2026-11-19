# Brief: one open card (first of two pull requests)

For one builder. Read first, in this order: `CLAUDE.md`; `docs/adr/0027-one-open-card.md` (the decision; it is the specification); `docs/adr/0025-while-a-card-is-open-only-the-card-scrolls.md`, `docs/adr/0024-tiles-open.md` and `docs/adr/0022-the-blank-card.md` (what stands); `docs/learn/13-the-keyboard-and-the-page.md`. Then the files named below, in full.

You are on the branch `one-open-card`, in a worktree where `npm ci` has run. The decision record, its index row and the glossary word are already committed there.

Marco found the inconsistency on a laptop the night before the production address goes out, and said: "You need to be more careful with logic and consistency of behaviors and animations." He will try the result on his phone and his laptop. Be exact, and say plainly what you could not see for yourself.

## What is wrong today

There are two ways to open a card.

1. `apps/web/src/components/Stack.svelte` opens the card in front in place: `app.cardState` goes to `answering`, the stack gets the class `answering`, and the slot draws `.card.open` with a head, a ×, the field, the dictation hint, "Prefer to talk?" and "Save". `app.save()` records the answer and `app.exiting` draws the answered card flying off (`card-exit`).
2. `apps/web/src/components/OwnCard.svelte` opens a tile's card or a blank card as a dialog: a box in the centre from 600 pixels wide (`.own-desk`), a sheet in the keyboard's frame on a phone (`.own-card.sheet`), with "Not now" and "Save". `app.writing` says which card, `app.ownDraft` holds the words, `app.saveOwnCard()` saves.

## What to build in this pull request

The structure of ADR 0027: one open card for every card, with fades. The travelling motions of ADR 0027 ("A motion says where the card went", except what is listed under "Motion in this pull request" below) are the second pull request and are not yours.

### 1. One component

- `OwnCard.svelte` becomes the open card. Rename the file to `apps/web/src/components/OpenCard.svelte` and say in its opening comment what it is now.
- Every card opens in it: the card in front of the stack, a card set aside, an answer, a blank card.
- `Stack.svelte` loses the open card: the `.card.open` branch, the room the stack makes (`answering`), its field, its focus on the field. The card in front is always the button it is today when closed. A tap, a click or Enter on it opens the open card for that card.
- The parts of the open card, in this order, for every card:
  1. A head: the card's area on the left (the same empty label as today when a card has none), and on the right the × of today's stack card, with its name from the copy ("Card labels", "close without saving"). For a blank card the head has the × only.
  2. The part that may scroll on a phone (`.scrolls`, ADR 0025): the title, which is the question, or "Own card: title" and "Own card: hint" for a blank card; the rule (on a tint); the field; the dictation hint when it is open.
  3. The counter.
  4. A failed save, as today (`role="alert"`, and named in the field's description).
  5. The row with "Prefer to talk?" on the left, when the platform has dictation and the hint is closed, and "Save" on the right.
- "Not now" goes. ×, Esc and a tap or click on the scrim close, and keep the words for that card, exactly as "Not now" did.
- The dictation hint and "Prefer to talk?" behave on every open card as they do on the stack's card today: `app.platform`, `app.hintOpen`, "Got it". The hint opens by itself only where it does today (`showCard` sets `hintOpen` for the first card of the first round).
- The tint: as today's `OwnCard.svelte` (`app.writingTint`): a card of the deck on its tint with the rule and no box around the field, a blank card white with the boxed field.

### 2. One state

- One way in the state to open a card, close it and save it. The card in front opens through the same path as a tile: `app.writing` is its id. A draft is one per card id, as today: the card in front keeps its own (`draft`), the others wait in `drafts`.
- `saveOwnCard` already handles the card in front when it is a card set aside (it brings the next card forward). Make it handle the card in front when it is a fresh card too, and make sure that what `save()` did and `saveOwnCard` does not is kept: read both and list the differences in your report. In particular: the event and its seq, the readable copy with its event id, the round after the save (`withAnswer` against `replaySession`: say whether they give the same round and prove it with a test), the draft cleared, the `saved` announcement for a screen reader, the next card and its `shown` event, the sync in the background, `CLIENT_SEAL_FAILED`.
- `cardState`'s `answering` and `saving`, `openCard`/`closeCard` as they are, `save()` as a second save, `app.exiting`, `leave` and `EXIT_MS` go, or are folded into the one path. Do not leave two of anything.
- Names: after the change, nothing that serves every card may be called "own" or "blank". Rename what would otherwise lie (`saveOwnCard`, `ownDraft`, `ownSaving`, `ownCardOpen`, `closeOwnCard`, the `.own-card` classes and ids). Keep the blank card's own names where they are about the blank card (`openOwnCard`, `NEW_OWN_CARD`, the copy blocks "Own card: ..."). List the renames in your report.
- `App.svelte`: `writing` (a phone, and an open card) and `framed` follow the one state. The page behind an open card is `inert`, on a phone and on a laptop, for every card.

### 3. What was tapped is lifted

- While a card is open, the thing it was opened from is not drawn where it lay: the card in front of the stack (its slot keeps its place; the cards behind stay), or the tile (its place in the list stays). `visibility: hidden` on that element is enough; it must not take a tap or the focus meanwhile.
- A new blank card lifts nothing.

### 4. Where it opens, and how it looks

- From 600 pixels (`app.wide`): today's `.own-desk`, for every card.
- On a phone: today's framed box of the place to write (ADR 0025), for every card. Every rule of ADR 0025 must hold for the card in front as it holds for a tile's card today: the frame from the visual viewport, the strip while the keyboard is up, the page held (`lockPage`), the low frame under `LOW_FRAME`, what scrolls and what never moves, `touch-action` on the parts that never scroll, the field taking the focus only after `tick()`.
- The head is new in this box. It never moves, like the counter and the row with "Save". On a phone the × must be at least 44 pixels to a finger, as today's is (see the stylesheet test of targets).
- One set of rules in `app.css` for the open card. The rules of `.card.open` that were for the card in the stack go; do not keep two sets that say the same thing. `.card.front`, `.card.back`, `.slot` and the stack's own rules stay.
- Look at the result at 375 by 553, 375 by 667, 390 by 844 and 1280 by 800 if you can run a browser; if you cannot, say so.

### 5. Motion in this pull request

- The open card fades in and out where it stands, as the place to write does today, on a phone and on a laptop, for every card. It never slides or grows.
- The answered card no longer flies off (`card-exit` and `.slot.exit` go). After a save from the stack the open card fades out and the next card comes forward in the stack, as it does today behind the flying card.
- Set aside, by the button or a swipe, is unchanged.
- A tile still comes in with `tile-in`.
- Reduced motion: unchanged rules; nothing new travels.

### 6. Focus and a screen reader

- Opening: the field takes the focus after `tick()` (ADR 0025).
- Closing without saving: the focus goes back to what was lifted. The card in front; the tile on a laptop; the world pill on a phone for a tile; "Write your own story" for a new blank card.
- After a save from the stack: the focus goes to the new card in front, or to the thank-you card when that was the last card (today's rule in `Stack.svelte`).
- After a save from a tile or of a blank card: as today.
- The open card is `role="dialog"`, `aria-modal="true"`, named by its title. Tab stays inside. The hidden line that says "saved" still speaks.

### 7. The copy file

- `workshops/rural-manufacturing/copy.md` is Marco's. Change no word of it. Delete only the block "Own card: buttons" with its two entries, which no screen reads after this change, and take it out of the lists in `apps/web/src/lib/copy.ts`. "Save" is "Buttons", "save". Say so in your report.

## What must not change

- Nothing in `packages/`, in `apps/api`, in `tools/`. If you think the contract needs a change, stop and say so in the report.
- An answer is sealed before anything is written; the readable copy goes to its own table; the event carries the sealed text only.
- No new dependency. No request to any other origin.
- The card screen while every card is closed: the stack, "Set aside", the swipe, "Write your own story", the pill, the sheet "Your world so far", the laptop's column.
- The onboarding card and the thank-you card.

## Tests

- `npm run check` must pass before every commit.
- Tests are named as behaviours. Many tests open the card in the stack (`card.test.ts`, `viewport.test.ts`, `page-lock.test.ts`, `screens.test.ts`, `state.test.ts`, `accessibility.test.ts`, `own-card.test.ts`, `tiles.test.ts`). Move each to the one open card; do not delete a behaviour that still holds. If a test's behaviour is gone by ADR 0027 (the stack making room, the answered card flying off, "Not now"), delete it and list it in the report with the reason.
- New tests, at least:
  - the card in front opens in the open card: a dialog named by its question, on its tint, with the area, the ×, "Prefer to talk?" where the platform has dictation, and "Save";
  - the stack does not open a card in place: with a card open, the stack holds no field, and the card in front is lifted;
  - ×, Esc and the scrim close every kind of card and keep its words: the card in front, a card set aside, an answer, a blank card;
  - a save from the stack through the open card records exactly what `save()` recorded (one `answered` event for that card, sealed; the copy; the next card in front; its `shown`), and the focus lands on the new card in front;
  - the dictation hint opens by itself on the first card of the first round in the open card, and "Prefer to talk?" opens it on a tile's card and on a blank card;
  - on a phone, framed, the open card of the card in front obeys ADR 0025 (the same stylesheet tests that hold for the place to write today hold for it; the head is among the parts that never move);
  - on a laptop the page behind an open card is `inert` for the card in front too;
  - no rule in the stylesheet names `.card.open`, `.stack.answering` or `card-exit` any more.
- A client test that syncs without `stubRoutes` hangs the whole run. Every test stubs the routes before anything can sync.

## Docs you own in this pull request

- `docs/screen-map.md`: the rows that describe the card, the open card, "Your world so far" and "Your own card", as they are after this change.
- `docs/device-tests.md`: every step that opens a card, closes one, or names "Not now" or the place to write. In part 4b, step 3 (clicking a tile while the card in front is open) is gone: the page behind is not reachable.
- Do not edit the decision records, the build log's earlier entries, or the learning notes.
- A build-log entry, written after you open the pull request, with its number: what, why, how to verify, decisions made on the way, open questions. Write for someone who understands systems at a high level and wants the actual procedure.

## The pull request

- Open it against `main` when `npm run check` passes: what changed and why; how to verify by hand; tests; error codes added (none expected); the decision record (ADR 0027). End the description with the line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Commit messages: imperative first line under 72 characters, a blank line, the why and the how-to-verify, and the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` as `CLAUDE.md` says.
- Add files by name, never `git add -A`. Do not merge. Do not push to `main` or `staging`.

## Your report

In your last message: the pull request's number; what you built; the renames; the differences you found between the two saves and what you did about each; the tests deleted and why; what you looked at in a browser and at which sizes, or that you could not; anything in this brief you think is wrong, said plainly, with what you did instead; and every open question.

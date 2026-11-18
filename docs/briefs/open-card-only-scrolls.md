# Brief: while a card is open on a phone, only the card scrolls

For one builder. Read first, in this order: `CLAUDE.md`, `docs/adr/0025-while-a-card-is-open-only-the-card-scrolls.md` (the decision; it is the specification), `docs/adr/0023-the-header-and-the-open-card-on-a-phone.md` (what stands), and the build-log entries of pull requests 66 and 68. Then the files named below. Do not read the whole repository.

Marco found these on his own iPhone. He will check the result on that phone, and the production address goes out after it. Be exact, and say plainly what you could not see for yourself. You are on the branch `open-card-only-scrolls`, in a worktree where `npm ci` has run.

## What is wrong today

1. With a card open and the keyboard up, a finger can drag the page behind. `followViewport` moves the frame after it, a moment late: flicker.
2. `OwnCard.svelte` calls `field.focus()` in `onMount`. At that moment the sheet is at the first frame of `sheet-in` (`translateY(100%)`), and `App.svelte`'s effect has not yet put `framed` and the two custom properties on the root. The field is at the bottom of the screen when it takes the focus, so Safari scrolls the page up for it.
3. The field grows with its text and the card scrolls. Marco wants the opposite: a fixed card, the text scrolling in the field.

## What to build

### 1. The page is held

- A small module, `apps/web/src/lib/page-lock.ts`. `lockPage(root)` returns the function that unlocks. It listens on `document` to `touchstart` and `touchmove`, the second with `{ passive: false }` (Safari treats a document's touch listeners as passive otherwise, and `preventDefault` is then ignored).
- On a `touchmove` with one finger: take the direction from where the finger went down. Walk from the event's target up to, and not including, `root`. If one of those elements scrolls up and down (a `textarea`, or computed `overflow-y` of `auto` or `scroll`) and has more to show in that direction, leave the event alone. Otherwise call `preventDefault()`, when the event is `cancelable`.
  - Finger moving down the screen: an element has more to show when its `scrollTop` is above 0. Finger moving up: when `scrollTop + clientHeight` is more than a pixel short of `scrollHeight`.
  - A move that is more sideways than up or down is stopped as well: nothing in an open card scrolls sideways.
- Two fingers or more: leave the event alone. Pinching to zoom must keep working.
- Keep the arithmetic in a pure function that takes numbers, so a test needs no layout.
- `App.svelte` locks while `writing` is true (a phone, and a card open or the place to write shown) and unlocks when it stops. It does not depend on `visualViewport`.
- In the stylesheet, on the parts of the open card and of the place to write that never scroll (the head with the close button, the counter line, the row with the buttons, the scrim): `touch-action: pinch-zoom`. Not on the card itself and not on anything that holds the field: see the alternatives of ADR 0025. On the one part that scrolls: `overscroll-behavior: contain`. Not on the field: the field must hand a drag on to the part around it once its own text is at its end.

### 2. The open card is a fixed box

- In `Stack.svelte`, one new element inside `.card.open`, around the question (`label`), the rule, the field and the dictation hint. It is the only part of the card that may scroll. Give it a plain class name and say what it is in a comment. On a laptop it must change nothing: `display: contents` there.
- The order inside the card becomes: the head; the part that scrolls (question, rule, field, hint); the counter; the error; the row with "Prefer to talk?" and "Save".
- While framed on a phone: `.card.open` no longer scrolls (`overflow: hidden`). The part that scrolls takes the space left (`flex: 1 1 0`, `min-height: 0`, `overflow-y: auto`), and is itself a column. The field in it is `flex: 1 1 0` with `min-height: 3lh` and scrolls its own text. So: with room, the field fills the space and its text scrolls inside it; without room for the question and three lines, the part around them scrolls.
- The 52 pixels kept free under the last row while the keyboard is up stay.
- `growField`, `keepEndInView`, `FIELD_TEXT` and `--field-text` go, with their callers, their `resize` listeners and their tests. `followViewport` and the rest of `viewport.ts` stay as they are.
- The caret: a browser keeps the caret in sight inside a field that scrolls. Do not add code for it.

### 3. The place to write follows

- `OwnCard.svelte`, on a phone: the same shape. The title and the hint, or the area and the question, and the field are in the part that scrolls; the counter, the error and the row with "Not now" and "Save" never move. The sheet itself no longer scrolls.
- On a phone it fades in and out (`fade-in`, `fade-out`, both in the stylesheet already) and does not slide. This must hold from its first frame: `framed` is set in an effect today, one render late. Make the class true in the same render that shows the card or the sheet (a derived value, read when `writing` turns true, so the tests that take `visualViewport` away still work).
- The field takes the focus only after `tick()`, as `Stack.svelte` does, so that the class and both custom properties are on the root first. Check that the same holds for the open card.
- The laptop's place to write is not to change.
- Look at the `prefers-reduced-motion` block: the fades stay, movement goes.

### 4. Words

- No new word for the participant. If you find you need one, say so in your report.
- Update the comments at the top of `Stack.svelte`, `OwnCard.svelte`, `App.svelte`, `viewport.ts` and the stylesheet's section "the open card above the keyboard" so they say what is true now, and point to ADR 0025.

## Files you own

- `apps/web/src/lib/page-lock.ts` (new), `apps/web/src/lib/viewport.ts`, `apps/web/src/App.svelte`, `apps/web/src/app.css`, `apps/web/src/components/Stack.svelte`, `apps/web/src/components/OwnCard.svelte`
- `apps/web/test/page-lock.test.ts` (new), `apps/web/test/viewport.test.ts`, and `card.test.ts`, `own-card.test.ts`, `tiles.test.ts`, `app.test.ts`, `accessibility.test.ts` where they speak of the open card or the place to write
- `docs/learn/13-the-keyboard-and-the-page.md` (new) and its line in `docs/learn/README.md`
- `docs/device-tests.md`, `docs/screen-map.md` if it speaks of the field growing, `docs/build-log.md` (your entry)

Not yours: `packages/*`, `apps/api`, `tools`, `docs/adr`, `docs/glossary.md`, `docs/runbook.md`, `workshops/`.

## Tests, named as behaviours

- "a finger dragged on the open card's head, its buttons or the page behind moves nothing"
- "a finger dragged on a field whose text is all in sight moves nothing"
- "a finger dragged up on a field with more text below scrolls the field; at the end of the text it moves nothing"
- "a finger dragged down on a field at the top of its text hands the drag to the part around it when that has more to show above"
- "a drag more sideways than up or down moves nothing"
- "two fingers are left alone"
- "a touch that cannot be cancelled is left alone"
- "the page is held while a card is open on a phone and let go when it closes"; the same for the place to write; "on a laptop the page is never held"
- "when the field of the place to write takes the focus on a phone, the root already carries the frame's class and both properties"; the same for the open card
- the stylesheet tests: while framed the open card and the sheet do not scroll, the part around the field does, and the field is never lower than three lines; the framed sheet's animation is a fade; nothing reads `--field-text`
- the tests of `growField` and `keepEndInView` go with the functions

The traps from earlier weeks: a client test that syncs without `stubRoutes` hangs the whole Vitest run; hold only the timer you mean when you use fake timers. jsdom has no layout: give `scrollTop`, `scrollHeight` and `clientHeight` to an element with `Object.defineProperty` where a test needs them.

## The learning note

`docs/learn/13-the-keyboard-and-the-page.md`, for the operator: someone who understands systems at a high level and wants the actual procedure. In plain words: the page and the visible part of it are two boxes on a phone; an iPhone's keyboard covers the page and an Android's shortens it; why a covered page can be dragged; how the app finds the visible part (`visualViewport`); how the guard decides which touches to stop; why the field takes the focus only once its box is in place; what cannot be tested without a phone. Short. Link it from your build-log entry.

## The device script

`docs/device-tests.md`: in the iPhone part and the Android part, steps Marco can follow with a card open and the keyboard up.

1. Drag the question, the "Save" row and the grey around the card: nothing moves and nothing flickers.
2. Write more lines than the field shows: the text scrolls inside the field, the question and "Save" stay.
3. Open a card with a long question on a small phone, or turn the phone on its side: the question and the field scroll together inside the card, "Save" stays.
4. Tap "Write your own story": the cards behind do not move.
5. Pinch with two fingers: the page zooms.

Take out the steps that say the field grows.

## Looking at it

Do not start servers. The integrator looks at the phone sizes after you. What you can do without a browser: read the stylesheet you wrote against the cases in "What to build", and say in your report which of them only a real phone can confirm.

## Done

- `npm run check` passes: output to a log file, look at the exit code, once before the pull request.
- One pull request from `open-card-only-scrolls` into `main`, opened with `gh pr create --repo m-under-over-through/world-builder`. Open it before you write its number in the build log. Its description: what changed and why; how to verify by hand, on a phone, step by step; error codes (none); the decision record (ADR 0025). It ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- A build-log entry: date, what, why, how to verify, decisions made on the way, open questions.
- Commit messages: imperative first line under 72 characters, the why and the how-to-verify, and the trailer `CLAUDE.md` gives.
- No new dependency, nothing third-party, relative imports end in `.ts`, plain words, short sentences, no em-dashes.
- Do not merge. Report: the pull request; the files changed; every decision the brief did not make; the last lines of the check; and what only a real phone can tell.

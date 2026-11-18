# Brief: the header, and the open card on a phone

For one builder. Read first, in this order: `CLAUDE.md`, `docs/adr/0023-the-header-and-the-open-card-on-a-phone.md` (the decision; it is the specification), `design/DESIGN.md` (the phone and laptop layouts, the card, the sheet), and the build-log entry "A short phone screen" of 18 November. Then the files named below. Do not read the whole repository.

Marco found these on his own iPhone, the evening before the production address goes out. He will check the result on that phone. Be exact, and say plainly what you could not see for yourself.

## What to build

### 1. The header

- On every screen and at every width: the name and the organizer on the left, and on the right a round "?" button that opens the about page (`app.showAbout` as the foot's link does today). Its accessible name is the copy file's "About this app" (the item the foot's link uses now). 44 pixels to a finger. On the laptop's card screen the count of answers stays, to the left of the "?".
- Not shown on the about page, the terms and the policy, which have "Back".
- The link in the foot goes. On a phone's card screen the foot is the world pill alone; on every other screen there is no foot. Keep the foot's safe-area padding on the phone.
- The invitation page keeps its own frame: it gets the header as every screen does.

### 2. Air on the card screen

- `header.topbar`, `.loop`, `.stack`, `.aside-row` and `.foot` in `apps/web/src/app.css`. The stack's height is `clamp(280px, calc(100dvh - 330px - safe areas), 430px)`. Work the budget out again for the new foot, and write the sum in the comment above the rule.
- At every height from 553 pixels up: at least 16 pixels between the header and the top of the stack (the back cards count: measure the highest painted edge of the stack, not the front card), and at least 12 between the last row under the stack and the foot. Nothing overlaps anything.
- The rule of 18 November for short screens (`@media (max-height: 620px)`) stays, with its threshold worked out again if the budget moves it.
- The laptop's two-column page is not to change, apart from the header and the foot.

### 3. The open card above the keyboard

- A small module, `apps/web/src/lib/viewport.ts`: it reads `window.visualViewport` (height and `offsetTop`), keeps two CSS custom properties on the app's root up to date on its `resize` and `scroll` events, and says whether the keyboard is up (the visual viewport is clearly lower than the layout viewport). It starts when a card or the blank card opens on a phone and stops when it closes. Without `visualViewport` it does nothing. Pure parts are testable with a stand-in object.
- While a card is open on a phone, the open card's frame is that box: fixed to the visual viewport's top, as tall as the visual viewport. In it, from the top: the close button, the question, the field, the row with "Prefer to talk?" and "Save". The field takes the space left, never lower than three lines of text.
- The field grows with the text: when the text is taller than the field, the field's height follows the text and the frame scrolls. The caret stays in view. "Save" is at the end, reachable by scrolling.
- While the keyboard is up, 52 pixels stay free under the last row: Safari floats its address bar there.
- The page behind must not scroll or jump when the keyboard rises or falls, and must be back in place when the card closes.
- The blank card's place to write (`OwnCard.svelte`) follows the same rule on a phone: title, hint, field, the two buttons, all above the keyboard, the field growing with the text.
- On a laptop nothing of this applies.

## Files you own

- `apps/web/src/App.svelte`, `apps/web/src/app.css`, `apps/web/src/components/Stack.svelte`, `apps/web/src/components/OwnCard.svelte`, `apps/web/src/lib/viewport.ts` (new), `apps/web/src/lib/state.svelte.ts` only if the open state needs a hook
- the screens under `apps/web/src/screens/` where the foot's link or the header is touched
- `apps/web/test/viewport.test.ts` (new), and `app.test.ts`, `accessibility.test.ts`, `card.test.ts`, `screens.test.ts`, `own-card.test.ts` where they speak of the foot, the header or the open card
- `docs/screen-map.md`, `docs/device-tests.md` (the steps that say "About this app" at the bottom; a new step for the keyboard on an iPhone and on an Android), `docs/build-log.md` (your entry)

Not yours: `packages/*`, `apps/api`, `tools`, `docs/adr`, `docs/glossary.md`, `docs/runbook.md`, `workshops/` (no new words are needed: the "?" is a sign, and its name is an existing item of the copy file; if you find you need a word, say so in your report and use the existing item meanwhile).

## Tests, named as behaviours

- "the header has the name on the left and one button on the right, named About this app, on the welcome, the card screen, closed, not a workshop and the invitation page; it opens the about page"
- "the about page, the terms and the policy show Back and no question mark"
- "the foot of a phone's card screen is the world pill alone; no other screen has a foot"
- "on the laptop's card screen the count of answers and the question mark share the header's right side"
- the stylesheet tests: the question mark is 44 pixels to a finger; the stack's budget in the stylesheet matches the sum in its comment; the short-screen rule still holds
- "the visual viewport's height and top reach the app's root as custom properties, and follow its resize and scroll events" (with a stand-in for `visualViewport`)
- "the keyboard counts as up when the visual viewport is clearly lower than the page, and not for a few pixels of browser bar"
- "opening a card on a phone starts following the visual viewport, and closing it stops and clears the properties"; the same for the blank card
- "without visualViewport the open card is laid out as before"
- "the field is never lower than three lines, and grows with the text"

The traps from earlier weeks: a client test that syncs without `stubRoutes` hangs the whole Vitest run; hold only the timer you mean when you use fake timers.

## Looking at it

No desktop browser shows a phone's keyboard, so two kinds of look:

1. **Boxes, measured.** Start the local API (`node apps/api/dev.ts`, port 8788) and the dev server yourself in the background (`npm run dev --workspace=apps/web -- --port <free port> --strictPort`), stop both when done. In a phone view, at 375 by 553, 375 by 667, 390 by 844, 393 by 760 and 320 by 568, on the card screen with a card set aside and one answered: read the boxes of the header, the stack (its highest painted edge), each control under it and the foot, with `getBoundingClientRect`. Wait over a second after each resize and measure twice: the stack animates its height, and a measurement taken during the animation shows overlaps that are not there. Report the gaps as numbers.
2. **The keyboard, stood in for.** In the same phone view, open a card, then set the two custom properties by hand to what an iPhone gives with the keyboard up (a visual viewport of about 393 by 410 at the top of the page), and look: the close button, the question, the field and "Save" are all inside that box, with the strip free under them. Do the same for the blank card. Say in your report that this is a stand-in.

## Done

- `npm run check` passes: output to a log file, look at the exit code, once before the pull request.
- One pull request from `phone-layout-and-keyboard` into `main`, opened with `gh pr create --repo m-under-over-through/world-builder`. Open it before you write its number in the build log. Its description: what changed and why; how to verify by hand, on a phone, step by step; error codes (none); the decision record (ADR 0023). It ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- A build-log entry: date, what, why, how to verify, decisions made on the way, open questions, and the measured gaps.
- Commit messages: imperative first line under 72 characters, the why and the how-to-verify, and the trailer `CLAUDE.md` gives.
- No new dependency, nothing third-party, relative imports end in `.ts`, plain words, short sentences, no em-dashes.
- Do not merge. Report: the pull request; the files changed; every decision the brief did not make; the measured gaps at each size; what the stand-in look showed; the last lines of the check; and what only a real phone can tell.

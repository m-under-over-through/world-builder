# Brief: a motion says where the card went (second of two pull requests)

For one builder. Read first, in this order: `CLAUDE.md`; `docs/adr/0027-one-open-card.md` (the decision; its points "A motion says where the card went" and "The open card itself never travels" are the specification); `docs/adr/0025-while-a-card-is-open-only-the-card-scrolls.md`; `docs/learn/13-the-keyboard-and-the-page.md`; the build-log entry of pull request 77, which made the one open card. Then the files named below, in full.

You are on the branch `card-motions`, in a worktree where `npm ci` has run. Pull request 77 is merged: there is one open card (`apps/web/src/components/OpenCard.svelte`), one state path (`openCard`, `openTile`, `openOwnCard`, `closeCard`, `save`, `app.writing`, `app.openedFrom`, `app.closing`, `app.saving`, `CLOSE_MS`), and what a card was opened from is lifted while it is open (`.lifted`, `visibility: hidden`, decided by which card is open).

Marco asked for this in so many words: "the animation should either move the card to the saved list, back to the card stack, or away if dismissed." And: "You need to be more careful with logic and consistency of behaviors and animations." He will try it on his iPhone and on a laptop. Be exact, and say plainly what you could not see for yourself.

## What happens today

Every open card fades in where it stands and fades out where it stands (`fade-in`, `fade-out`, 280 milliseconds). Nothing shows where it came from or where it went. A card set aside leaves to the side (`.card.front.leaving`, and the swipe in `lib/swipe.ts`); that stays as it is.

## What to build

One layer that draws a card travelling from one place to another. Call it by a plain name and say what it is in a comment.

### The rules

| When                                                   | The card travels from           | to                                                                                                                                                                                              |
| ------------------------------------------------------ | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A card opens from the card in front                    | the card in front, in the stack | the open card                                                                                                                                                                                   |
| A card opens from a tile                               | that tile                       | the open card                                                                                                                                                                                   |
| A new blank card opens                                 | nothing travels: it fades in    |                                                                                                                                                                                                 |
| A card closes without saving (×, Esc, the dimmed page) | the open card                   | where it came from: the card in front, or its tile; on a phone a tile's card goes to the pill "Your world so far" (`WORLD_PILL`), since the tile is behind it                                   |
| A new blank card closes without saving                 | nothing travels: it fades out   |                                                                                                                                                                                                 |
| A card is saved                                        | the open card                   | its place in "Your world so far": from 600 pixels wide its tile (`[data-tile]`), which exists as soon as the answer is recorded and is lifted until the open card has gone; on a phone the pill |
| A card is set aside                                    | unchanged                       |                                                                                                                                                                                                 |

- **The open card itself never travels.** It is in its place from its first frame and fades in and out exactly as it does today. Do not put a transform, a transition of position or size, or a keyframe that moves on `.open-card`, the scrim, or anything that holds the field. A field that takes the focus inside a moving box makes Safari scroll the page (ADR 0025), and an iPhone raises the keyboard only for a focus made in the tap, so the field's focus must stay exactly where it is today: after `tick()`, at once.
- **The travelling layer** is a box of its own, fixed to the screen, above the page and the scrim. It has the card's look and nothing inside it: the card's tint (`app.writingTint`; white with the blank card's line for a blank card), a radius and a shadow. It takes no touch (`pointer-events: none`), no focus, and is hidden from a screen reader (`aria-hidden="true"`). It is in the page only while it travels.
- **It goes from one rectangle to the other**: position and size, in `CLOSE_MS` (280 milliseconds) with the easing the fades use (`--ease-sheet`), so it arrives as the fade ends. It fades as it goes where that reads better (for example out, as it lands on the open card, which is fading in under it). Your eye decides; say what you chose.
- **One card, one place.** While the layer travels, the thing it left and the thing it is going to must not both show the card. What was tapped is already lifted while the card is open. On a save from 600 pixels wide, the tile it goes to is lifted until the open card has gone, then shows; the layer should land on it as it shows.
- **Rectangles are measured, never assumed.** Where the card came from is measured at the tap, before anything changes: on a phone a tile's sheet closes as the card opens, and the tile is gone from the page a moment later. Where it goes is measured when the travel starts. If either rectangle cannot be had (the element is not in the page, or has no size), nothing travels and the fade stands alone. That is not an error.
- **Reduced motion** (`reducedMotion()` in `lib/swipe.ts`, and the stylesheet's `prefers-reduced-motion` block): nothing travels. The fades stay.
- **Nothing waits longer than today.** `closeCard` and `save` already wait `CLOSE_MS` for the fade; the travel runs in that same wait. Do not add a second wait, and do not delay the sync, the next card, the focus, or the answer being recorded.
- **Where a browser cannot animate** (no `element.animate`, as in the test DOM): nothing travels, nothing throws.

### Where the code goes

- Yours to decide, within these lines: the open card (`OpenCard.svelte`) must not hold the layer inside itself, since the layer must outlive nothing and must not be inside the dialog a screen reader is in; `App.svelte` is the natural home. Keep the arithmetic (which rectangle to which, for which case) in a pure function that takes plain values, so a test needs no layout.
- The state (`lib/state.svelte.ts`) must not learn about rectangles or elements. If the layer needs to know that a card has just been saved, closed or opened, the state already says so (`writing`, `openedFrom`, `closing`, `saving`); if one more plain fact is needed (for example whether the close under way is a save), add that fact and say why.
- No new dependency.

## What must not change

- Everything of pull request 77: the one open card, its parts, the one save, what is lifted and when, where the focus goes, the keys, the field never switched off.
- Everything of ADR 0025 on a phone: the frame, the page held, the low frame, what scrolls.
- Set aside, by the button and by a swipe.
- `tile-in`, the sheet "Your world so far" and its own slide.
- Nothing in `packages/`, `apps/api`, `tools/`, and no word of `workshops/rural-manufacturing/copy.md`.

## Tests

- `npm run check` must pass before every commit. A client test that syncs without `stubRoutes` hangs the whole run.
- The pure function: for each row of the table above, from 600 pixels wide and on a phone, which thing the card travels from and to; and "nothing travels" for a new blank card, for reduced motion, and when a rectangle is missing.
- In the page (the test DOM has no layout and no `element.animate`; stub what you need and say so): the layer is in the page only while a card travels; it is `aria-hidden`, takes no pointer events, and is never inside the dialog; the open card and the scrim carry no rule that moves them (a stylesheet test: no `transform`, no `translate`, no `scale` on `.open-card`, `.open-desk`, `.open-card.sheet`, `.scrim` or their `closing` forms, and their animations are the fades); the field takes the focus as it does today while the layer travels; a save and a close take no longer than they do today (the held wait of `card.test.ts` shows how to hold a fade open).
- Do not weaken a test of pull request 77.

## Docs you own

- `docs/screen-map.md`: the row "Open card", and any sentence that says a card "fades" where it now also travels.
- `docs/device-tests.md`: the steps that open, close and save a card, on the iPhone, the Android and the laptop: what to see move, and from where to where. Add a step with "Reduce Motion" on.
- A build-log entry, after you open the pull request, with its number.
- Do not edit the decision records or earlier build-log entries.

## The pull request

- Open it against `main` when `npm run check` passes: what changed and why; how to verify by hand; tests; error codes added (none expected); the decision record (ADR 0027). End the description with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Commit messages: imperative first line under 72 characters, a blank line, the why and the how-to-verify, and the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Add files by name. Do not merge. Do not push to `main` or `staging`.

## Your report

The pull request's number; what you built and where it lives; for each row of the table, what you saw in a browser, at which size, or that you could not look; every choice your eye made (what fades, what the layer looks like, any timing); the plain facts you added to the state, if any; anything in this brief you think is wrong, with what you did instead; every open question.

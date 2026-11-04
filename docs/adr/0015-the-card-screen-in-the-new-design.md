# 0015. The card screen in the new design: the stack, "Your world so far", the laptop page

Date: 2026-11-04. Status: accepted. Follows ADR 0014 (the readable copies) and the design handoff of 3 November (`design/DESIGN.md`).

## Context

The design canvas Marco handed over on 3 November replaces the first visual pass with "index cards on a dotted desk": a stack of tinted cards, one question per card, tap to answer and swipe to set aside, and a growing "Your world so far" made of the answers, as a bottom sheet on a phone and as a column beside the stack on a laptop. The architecture plan and the screen map describe the card's states and the deck's rules but not these two additions, nor how the design's numbering of cards meets the deck engine's sessions. This record settles what the first session building the screen decided; the welcome, the onboarding, the code screen and the session end are restyled in a second session.

## Decision

**The front card is one button, and the states of the screen map are a mode, a toast and an exit.** `app.cardState` is what the front card is doing: `fresh` (the stack), `answering` (the card opened with the field, the question as its `<label>`), `saving` (Save reads "Saving…"). The screen map's `saved`, `synced`, `dismissed` and `deferred` are the toast under the top bar (`app.toast`, from the "Card states" block, held 1.6 seconds), shown while the card that was answered or set aside leaves and the next card is already the front. The answered card's exit is `app.exiting`, drawn for 320 ms with its words, as decoration. "Synced" is said only when the server takes the answer while "Saved on this device" is still up; later, nothing is said, since the about page shows the diagnostics. Offline or on a failure the toast's wording changes and nothing blocks the loop. Save seals the answer and writes the outbox before anything is shown; the next card comes at once and the sync runs behind it.

**A card's number is its place in the session as planned, and the tint follows it.** The design numbers cards 1 to 12 in a fixed deck; the app has sessions, each a queue the engine plans from a seed. The label "03 of 4 · Area" takes NN from the card's place in the queue as the engine planned it when the session started (`LiveSession.queueAsPlanned`), from 1, and M from that queue's length. A dismissal moves a card to the end of the queue as it stands, never in the planned order, so the card keeps its number and its tint (`tints[(n - 1) % 4]`) when it comes round, as the design's prototype does. A deferral takes a card out of the session; M stays the planned length, so the label never reads "04 of 3". The area is the card's `area` from the deck; a card without one is "03 of 4".

**"Your world so far" is read from the history, the words from the copies.** One tile per `answered` event in the participant's history, on this device and on the server, session by session and in card order within a session; the tile's number and tint are the card's number in its own session, computed by replaying that session's plan as it started (`planAsStarted`, which counts only the sessions before it). The words come from the readable copies ADR 0014 allows, kept in a table of their own (`copies`, keyed by session and card) that no sync reads. A tile whose words this device did not write shows the question and the quiet line "Written on another phone. The words stayed there." The chips under "Set aside" are this session's dismissed and deferred cards not answered since, with their questions and no button. The summary line counts the tiles, this session's chips and this session's cards still to come; the laptop's top bar counts this session's answers.

**The sheet is a modal dialog; the column is a region.** On a phone the pill at the foot of the card screen and of the session end opens the sheet from 112 pixels down over a scrim: `role="dialog"`, `aria-modal`, labelled by its title, focus on × on open and kept inside, closed by ×, Esc, the scrim or a swipe down on its head, focus back on the pill. From 600 pixels the world is the right column of the page, a region labelled by the same title. The switch is one media query read in `App.svelte` (`app.wide`), since a sheet and a column are different documents, not different styles; the two columns themselves are flex-basis driven as the spec says (420 and 560 pixels), so they wrap into one column under about 1030 pixels of content width without a second query, and nothing is sticky or a viewport tall: the page scrolls as one. The session end shows in the left column in place of the stack.

**The swipe is the design's.** On the front card: a drag of more than 6 pixels is a drag and swallows the tap that would open the card; the card follows the pointer and turns a degree every 18 pixels; more than 100 pixels at release sets it aside, 520 pixels out in 250 ms; less brings it back in 250 ms; vertical movement is the page's. The Set aside button makes the card leave the same way and is the keyboard's equivalent. A half-written answer is kept in memory when the card is closed with × or set aside, so the card shows it when opened again or when it comes round, and nowhere else.

**The type is served from this origin.** Bricolage Grotesque and DM Sans, the Latin and Latin Extended subsets as Google Fonts serves them, as four variable woff2 files under `apps/web/public/fonts/` with their license texts, declared in `app.css` with `font-display: swap` and precached by the service worker. The client never asks Google Fonts; the policy's `font-src 'self'` stays.

**The top bar is the app's name and the organizer**, two centered lines on a phone and a block on the left on a laptop, from "App labels" and `workshop.json`; the workshop's name stays on the welcome screen. Nothing else is in it but, on a laptop while a session runs, the progress strip (one segment per card as planned, `aria-hidden`) and "n of M answered".

**The dictation hint sits inside the open card**, where the field is: by itself on the first card of the first session, when that card is opened, and from "Prefer to talk?" on every card. The design does not draw it; the stack has no room under it.

## Consequences

- Every word of the screen is a block or an entry in `copy.md`: "Card labels", "Card states", "Card nudge", "Your world". The nudge now reads "Please don't name real people.", the design's line.
- The device store has a second version with the `copies` table. A database from the first version gains the table on open. `history()` and `pending()` do not touch it, and a test proves the outbox rows and the sync body never carry the words.
- `replaySession` plans a session from the sessions numbered before it, not from every other session. For the latest session the plan is the same as before; for a past session, replayed to number its tiles, it is the plan the participant saw.
- `position()` still counts cards done; the label no longer uses it. `cardNo` is the planned number.
- A card's number changes from session to session, and so does its tint; within a session it never does. Two tiles from two sessions can both read "01".
- The phone's card screen is exactly one viewport tall (`100dvh`), so the open card can fill it to the keyboard where the browser shrinks the viewport (`interactive-widget=resizes-content`, Chrome on Android). Safari on iOS does not shrink it; there the card stays full height and Safari scrolls the field into view. Not tried on a device in this session.
- The two columns wrap at about 1100 pixels of viewport with the page's 36-pixel paddings, "about 1030" in the spec's words.
- The old `SETTLE_MS` is gone: nothing waits for the sync any more.

## Open

- **Bring back.** The design returns a set-aside card to the front of the queue and resets its dismissals. The engine replays a session from its events and has no event for it; adding one (`revisited` exists in the contract, with no rule in the engine) or treating it as a local reordering is a change to `packages/deck` and `packages/contracts`, the deck builder's and the integrator's. The chips carry no button until then.
- **The organizer line.** "Under Over Through x Mechanism" from `workshop.json` is the second line of the top bar; the design wrote "+". Marco's call, in the file.
- **The keyboard on iOS**, and the exit and promotion motion on a real phone: owed to a device.
- **The tiles' order across sessions**: earlier sessions first, in card order, as the design lists answers; newest-first is one line if the reading feels wrong.

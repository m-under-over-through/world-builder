# 0025. While a card is open on a phone, only the card scrolls

Date: 2026-11-18. Status: accepted, Marco's decision of 18 November after trying staging on his iPhone. Replaces one point of ADR 0023, "The field grows with the text", for the open card and for the blank card's place to write. The rest of ADR 0023 stands.

## Context

Marco tried the open card of ADR 0023 on his phone. It fits above the keyboard. Three things are still wrong.

1. **The page behind can be dragged.** With a card open and the keyboard up, a finger can still move the page under the card. The card follows where the visible part of the screen went, a moment late, so the picture flickers.
2. **Opening the blank card pushes the other cards around.**
3. **A text longer than the field will be trouble.** ADR 0023 lets the field grow and the card scroll. With the page also moving, three things can scroll at once.

His rule: "when a card is in focus, only the content inside that card scrolls."

Why the page can be dragged at all: on an iPhone the keyboard does not make the page shorter, it covers the lower half (learning note 13). The page is then taller than what is visible, so Safari lets a finger drag it, even when the page itself has nothing to scroll. Hiding the page's overflow does not stop this.

Why the blank card pushes the cards: its sheet slides up from the bottom of the screen, and its field takes the focus at once. At that moment the field is still at the bottom, where the keyboard will be. Safari scrolls the page up to keep the field in sight, and the cards behind go with it. This is read from the code. No iPhone was at hand to watch it, and Marco's phone is the proof.

## Decision

- **While a card is open on a phone, the page behind does not move.** This holds for the open card and for the place to write (a blank card, or a card opened from its tile). A finger dragged anywhere on the screen does nothing, unless it is on text that has more to show in that direction. Two fingers are left to the browser, as before.
- **The open card is a fixed box**: the part of the screen above the keyboard, as in ADR 0023. The close button at its top and the row with "Save" at its bottom never move.
- **The text scrolls inside the field.** The field takes the space between the question and the last row. It is never lower than three lines. It no longer grows with the text.
- **When the question and three lines do not fit**, the question and the field scroll together, inside the card, between the close button and the row with "Save". This is for a long question on a small phone.
- **When the box is too low even for that**, under 260 pixels, the whole card scrolls, as it did under ADR 0023. This is for a phone on its side with the keyboard up, where the close button and the row with "Save" alone would fill the box.
- **The place to write follows the same rule.** Its title and hint, or the card's area and question, sit above the field. "Not now" and "Save" never move.
- **The place to write appears where it will stand.** On a phone it fades in and out. It does not slide up from the bottom.
- **A field takes the focus only once its box is in place**, so the browser has no reason to scroll the page for it.
- **The box still follows the visible part of the screen** (ADR 0023), for the times the browser moves the page by itself.

## Consequences

- The code that measured the text and grew the field goes (`growField`, `keepEndInView`, `--field-text`).
- A small guard listens to touches while a card is open and stops the ones that would drag the page. It is the one place in the client that cancels a touch.
- A desktop browser has no keyboard that covers the page. Tests pin the guard's arithmetic with made-up touches. The proof is Marco's iPhone on staging, and the device script gains the steps.
- The dictation hint, when shown, sits under the field in the part that scrolls, its words beside its button. While it is open the field may be two lines, so that the question, the field and the hint fit on the first card. "Save" stays in sight.
- The page is held only where the card has its box. A browser that reports no visible part lays the card out as before ADR 0023, and there the page is the one thing that can scroll.
- A pinch works where it did before: on the ground around the card. The card itself never took a pinch, since its swipe allows a finger only up and down.
- On a laptop nothing changes.
- "Your world so far" on a phone is not touched: it has no field, so no keyboard, and the page under it cannot be dragged.

## Alternatives

- **Hold the page and keep the growing field.** It would stop the flicker. The question would still leave the screen while someone writes, and "the card scrolls, the field never does" is harder to say than Marco's rule.
- **Hide the page's overflow, or fix the body in place.** Neither stops an iPhone's page from being dragged under the keyboard.
- **Scroll the page back each time it moves.** That is the flicker Marco saw.
- **`touch-action: none` on the whole card, in the stylesheet alone.** By the standard it would do. Browsers differ in how they read it for a field inside such a box, and a field that cannot be scrolled with a finger would be worse than the fault. It is used only on the parts that never scroll.

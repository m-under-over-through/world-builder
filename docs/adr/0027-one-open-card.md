# 0027. One open card: every card opens, closes and leaves the same way

Date: 2026-11-18. Status: accepted, Marco's decision of 18 November after trying staging on a laptop: "the way cards are treated and animations are inconsistent. Why on the web the white card opens in the center while the normal cards open on the left and when saved have an animation as if they are being dismissed? The pattern where the card opens in the center is better. We should use the same pattern for all cards and the animation should either move the card to the saved list, back to the card stack, or away if dismissed." Replaces the stack's own open card (ADR 0015, ADR 0019) and "Not now" (ADR 0022). The place to write of ADR 0022 and ADR 0024 becomes the open card. ADR 0023 and ADR 0025 stand, for every card now.

## Context

The app had two ways to open a card.

The card in front of the stack opened where it lay. The stack made room, the card showed its field, and a × closed it. Saved, it flew off down and to the right, much as a card set aside flies off to the side.

A tile, and "Write your own story", opened in another piece of the app, built later for the blank card: a box in the centre of a laptop's page, a sheet on a phone, with "Not now" and "Save" and no ×. Saved, it faded.

So the same act, writing on a card, looked and moved differently by where the card happened to be. Nobody decided that. The second way was built next to the first, and each change since was checked against the piece it touched and never against the other.

## Decision

- **There is one open card.** The card in front of the stack, a card set aside, an answer and a blank card all open in it. The stack shows closed cards only and never opens one in place.
- **Where it opens.** From 600 pixels wide: in the centre, over the page, which is dimmed and cannot be reached meanwhile. On a phone: in the frame the keyboard leaves (ADR 0023, ADR 0025), as a fixed box.
- **What was tapped is lifted.** While a card is open, the card in the stack or the tile it was opened from is not drawn where it lay. One card, one place.
- **The same parts on every open card**, in this order: the card's area and, at the top right, × ; the question as the title; a rule; the field; the dictation hint where a phone or a laptop has dictation, by itself on the first card of the first round and from "Prefer to talk?" after that; the counter near the limit; a failed save, said at once; and the row with "Prefer to talk?" and "Save". A blank card has its own title and its line in place of the area and the question, and nothing else is different.
- **Closing.** ×, Esc, and a tap or click on the dimmed page. The words written are kept for that card and are there the next time it opens. "Not now" goes: it did what × does.
- **Saving.** One save for every card. A card of the stack is answered and the next comes forward; a card set aside is answered for good; an answer or a blank card gains a version (ADR 0024).
- **Set aside stays under the stack.** It acts on the card in front while it is closed, by the button or a swipe. An open card is closed first.
- **Colour.** A card of the deck is open on its tint; a blank card is white (ADR 0024).
- **A motion says where the card went.**
  - Opening: the card grows from what was tapped to the open card. A new blank card has nothing to grow from and fades in.
  - Closing without saving: the card goes back to where it came from.
  - Saving: the card goes to its place in "Your world so far". On a laptop that is its tile. On a phone it is the pill at the foot of the screen.
  - Set aside: the card leaves to the side, as it does today, and its white tile shows under "Set aside".
  - With reduced motion nothing travels: things fade.
- **The open card itself never travels.** It is in its place from its first frame and only fades. The travelling is drawn by a layer of its own, which takes no touch and no focus. A field that takes the focus inside a moving box makes Safari scroll the page (ADR 0025), and an iPhone raises the keyboard only for a focus made in the tap.
- **One name.** "Open card" is the word. "Place to write" is no longer used for what the app does today.

## Consequences

- **The stack no longer changes shape.** The room it made for an open card, the open card's own markup in it, and the answered card drawn on its way out all go.
- **On a phone the card in front no longer grows where it lies.** It is the same fixed box as every other card. Everything of ADR 0025 holds for it: the frame, the page held behind, the low frame, what scrolls.
- **"Prefer to talk?" and the dictation hint are on every open card**, a tile's and a blank card's too. They were on the stack's card only.
- **The copy file loses the block "Own card: buttons".** Its "Save" is the one in "Buttons", and "Not now" has no screen. The file is Marco's; these are two lines no screen reads any more.
- **Focus.** It goes into the field as the card opens. When the card closes it goes back to what was lifted: the card in front, the tile on a laptop, the pill on a phone, or "Write your own story" for a new blank card. After a save from the stack it goes to the new card in front.
- **For a screen reader** every open card is a dialog named by its question, or by "Your own card". "Saved" is said as before.
- **On a laptop a tile can no longer be clicked while a card is open.** The page behind an open card cannot be reached. The stack's card used to leave it reachable.
- **In two pull requests.** First the one open card, with fades. Then the motions. The first can be tried by itself.
- **Glossary.** "Open card" is added.

## Alternatives

- **Moving the stack's card to the centre with the stylesheet, and keeping the two pieces.** It would look right today. The two pieces would drift apart again, which is how this happened.
- **Opening every card where it lies**, tiles too. A tile is too small a place to write in, and Marco prefers the centre.
- **Keeping "Not now" and adding it to every card.** Two ways to close on a small card. The × was already on the cards people answer most.
- **Letting the open card itself travel** from the stack to the centre. See the decision: the field must not be in a box that moves when it takes the focus.
- **Putting "Set aside" on the open card.** It would be a third thing an open card can do, for a card the person has just chosen to write on.

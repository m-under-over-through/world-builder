# 15. A motion drawn on top

ADR 0027 asks two things that pull against each other. A card should be seen to go somewhere: from the stack to the open card, back again, to "Your world so far". And the open card must never move, because its field takes the focus the moment it opens (ADR 0025, learning note 13). This note says how the app does both, with a box drawn on top.

## Why the open card cannot be the thing that moves

When a field takes the focus, the browser makes sure it can be seen. If the field is in a box that is still on its way, an iPhone scrolls the page to follow it, and the whole page jumps. And an iPhone raises the keyboard only for a focus made in the same tap, so the focus cannot wait for the motion to end either. So the open card stands in its place from its first frame and only fades.

## The trick: a second box with nothing inside

The motion is drawn by another box, the travelling card (`apps/web/src/components/TravellingCard.svelte`). It has the card's colour, corners and shadow, and no words, no field, no buttons. It is fixed to the screen, takes no touch, and a screen reader is told to skip it (`aria-hidden`). It sits over the dimmed page and under the open card. The open card comes in late and goes early, so for most of its way the plain card is what the eye sees.

What the eye sees: a plain card grows from the stack to the centre while the real one appears there; or the real one fades while a plain card shrinks back to the stack. Nothing that holds the field ever moves.

## The procedure, step by step

1. **Measure where it starts.** Every element on the page can report its rectangle (`getBoundingClientRect`): its left, top, width and height on the screen. When a card opens, the rectangle of what was tapped is taken at the tap itself, before the app reacts. On a phone that matters: tapping a tile closes the sheet it is in, and a moment later there is no tile to measure.
2. **Measure where it ends.** The open card, the card in front, the tile or the pill, measured from the element itself when the motion starts.
3. **Decide which to which.** A small function (`apps/web/src/lib/travel.ts`) takes plain values (what happens, what was tapped, laptop or phone, the rectangles) and gives the two rectangles, or nothing. Nothing when motion is to be reduced, when a rectangle is missing or has no size, or when either place is wholly off the screen (a tile far down a long list). Because it only takes plain values, a test can check every case without a browser.
4. **Move the box.** The browser's Web Animations API (`element.animate`) is given the first and last rectangle and a length, and draws every frame in between. Here the length is the fade's, 280 milliseconds, so the box arrives as the fade ends. Its curve is its own: it starts gently, is fastest a third of the way in, and settles. The fade's own curve does nine tenths of its way in the first third of its time, and a card that moves like that is not seen travelling, only arriving.
5. **Let it be seen.** Two boxes of the same colour in the same place look like one. So the open card stays clear for the first 45 hundredths of an opening, while the plain card comes over from the stack, and its words fade in on the card that has arrived. On the way out its words are gone after the first 40 hundredths, and the plain card is seen going back. The open card only ever changes how see-through it is. It never moves.
6. **Take the box away** when its way is done.

## Why nothing waits longer

The app already waits 280 milliseconds for the open card to fade before it lets the card go. The travelling card runs inside that wait and the app never waits for it. If the box is late, the card still goes on time; the box finishes over a page that is already right.

## One card, one place

While the box travels, the thing it left and the thing it goes to must not both show the card. The card in front or the tile that was tapped is hidden while the card is open (`lifted`, `visibility: hidden`), and so is the tile a saved card goes to, until the open card has gone. The box lands on it as it shows.

## How to check it yourself

- `npx vitest run apps/web/test/travel.test.ts`: every case of the table, and the box in the page with the browser's missing parts given by hand.
- In a browser, slow it down: the developer tools have an Animations panel that plays animations at a tenth of their speed.
- On a phone: `docs/device-tests.md`, parts 1, 1b, 3, 4 and 4b, and the steps with Reduce Motion on.

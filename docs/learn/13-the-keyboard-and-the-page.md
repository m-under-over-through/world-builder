# 13. The keyboard and the page

On a phone, an open card has to share the screen with the keyboard. ADR 0023 fitted the card above the keyboard; ADR 0025 made it the only thing that moves. This note says how a phone's browser sees the screen, and what the app does with it.

## Two boxes

A phone's browser keeps two boxes.

- **The layout viewport** is the page's own box. The stylesheet's `100dvh` is its height, and an element with `position: fixed` is fixed to it.
- **The visual viewport** is the part of the page you can actually see. Pinching to zoom makes it smaller than the layout viewport. So can the keyboard.

Most of the time the two are the same box, and nobody needs to know there are two.

## What the keyboard does

- **On an iPhone** the keyboard covers the page. The layout viewport keeps its height; only the visual viewport gets shorter. Safari then scrolls the page so the field with the cursor is in sight.
- **On Android Chrome** the keyboard shortens the page, because the page's viewport line in `index.html` says `interactive-widget=resizes-content`. Both boxes get shorter together.

## Why a covered page can be dragged

On an iPhone with the keyboard up, the page is taller than what you can see: the lower half is under the keyboard. A taller page can be scrolled, so Safari lets a finger drag it, even when nothing on it scrolls by itself. Hiding the page's overflow in the stylesheet does not stop this; neither does fixing the body in place. The open card followed the visible part a moment late, and Marco saw it flicker (ADR 0025).

## How the app finds the visible part

The browser describes the visual viewport in `window.visualViewport`: its `height`, and its `offsetTop`, how far the page is scrolled under it. It sends `resize` and `scroll` events when they change.

While a card is open on a phone, `apps/web/src/lib/viewport.ts` copies the two numbers onto the app's root as `--vv-height` and `--vv-top`, and the stylesheet makes the open card a fixed box of that height, moved down by that top. Where the keyboard is still rising and has not said where it stops, the box starts at a guess and then takes the real height (build log, pull request 68).

## How the guard decides which touches to stop

`apps/web/src/lib/page-lock.ts` listens to every finger on the page while a card is open on a phone.

1. When a finger goes down, it notes where.
2. When it moves, the guard looks at which way it went from there. Mostly sideways: stop it, since nothing in an open card scrolls sideways.
3. Up or down: it walks from the element under the finger up through the elements around it, and asks each one that scrolls up and down whether it has more to show that way. A finger moving up shows what is below: is the element short of its end? A finger moving down shows what is above: is it past its top?
4. If one of them has more to show, the move goes through and the browser scrolls it. If none has, the guard cancels the move (`preventDefault`), and nothing moves at all.
5. Two fingers are never stopped: a pinch still zooms. A page already pinched in keeps one finger for moving around it.

Two details make this work on an iPhone. The guard listens with `passive: false`: Safari treats a page's touch listeners as passive otherwise, and ignores a cancel from them. And the parts of the card that never scroll (the head, the counter, the buttons, the grey around the place to write) carry `touch-action: pinch-zoom` in the stylesheet, so the browser knows ahead of time that a drag there moves nothing. That is not put on the card itself: a browser takes `touch-action` from every box around an element, and the field inside could then not be scrolled with a finger.

## Why the field takes the focus only once its box is in place

When a field takes the focus, the browser makes sure it can be seen. If at that moment the field is at the bottom of the screen, where the keyboard is about to be, an iPhone scrolls the page up for it, and everything on the page goes with it. That is what pushed the cards around when the place to write slid up from the bottom.

So two things changed. The place to write fades in where it will stand instead of sliding up. And a field is focused only after Svelte's `tick()`: by then the app's root carries the frame's class and both custom properties, so the field is already in its box above the keyboard, and the browser has no reason to scroll.

## How to check it yourself

- `npx vitest run apps/web/test/page-lock.test.ts`: made-up touches, with the scroll numbers given by hand, decide which moves are stopped.
- `npx vitest run apps/web/test/viewport.test.ts`: the root carries the frame before a field takes the focus.
- On a phone: `docs/device-tests.md`, part 1 step 4 on an iPhone and part 3 step 3 on an Android.

## What cannot be tested without a phone

A test browser has no keyboard, no finger and no layout. It cannot show whether Safari really keeps the page still, whether a drag inside the field hands on to the part around it at the end of the text, whether the caret stays in sight while typing, or whether the place to write appears without moving the cards. Marco's iPhone on staging is the proof.

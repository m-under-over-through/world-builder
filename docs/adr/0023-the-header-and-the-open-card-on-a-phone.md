# 0023. The header, and the open card on a phone

Date: 2026-11-18. Status: accepted, Marco's decision of 18 November after trying staging on his iPhone. Changes where the about page is reached from (ADR 0013), and how the card screen of ADR 0015 uses a phone's height.

## Context

Marco tried the app on his phone the evening the blank card was merged, and sent three pictures.

1. **The cards nearly touch the title.** On the card screen the stack's height is the screen's height minus a fixed budget for everything else. The blank card's button (ADR 0022) took the last of that budget, so on every phone the back cards of the stack now reach the organizer's line under "World Builder".
2. **The question leaves the screen when a card is opened.** On an iPhone the keyboard does not make the page shorter: it covers the lower half, and Safari scrolls the page up to keep the field in sight. The open card is as tall as the whole screen, so its question slides out at the top and "Save" ends up under the browser's own bar. The blank card's place to write behaves the same: its title and its hint are gone as soon as the keyboard is up.

His proposals: "About" as a question mark next to the title, the title on the left, on a phone and on a laptop alike; and the field sized so that the question and the keyboard both fit, growing with the text, when it is fine for the question to slide away.

## Decision

- **The header is the same on every screen and every width: the name and the organizer on the left, a round "?" on the right.** The "?" opens the about page. Its name for a screen reader stays "About this app". On the laptop's card screen the count of answers sits to its left. The about page, the terms and the policy show their "Back" and no "?".
- **The foot no longer carries a link.** On a phone's card screen the foot is the world pill alone. Every other screen has no foot. The about page is still one tap from every screen, and "Delete everything" still two (ADR 0013).
- **The card screen keeps air.** The stack never comes closer than 16 pixels to the header, and the rows under it never closer than 12 to the foot, at any height from 553 pixels up. The row freed in the foot pays for it. The short-screen rule of 18 November stays: under 620 pixels of height "Set aside" and "Write your own story" share a row.
- **The open card fits what is visible above the keyboard.** While a card is open on a phone, its frame is the visual viewport: the part of the screen the keyboard and the browser's bars leave free, read from `window.visualViewport`. In that frame, from the top: the close button, the question, the field, and the row with "Prefer to talk?" and "Save". The field takes the space that is left and is never lower than three lines.
- **The field grows with the text.** Once the text is taller than the field, the field grows and the frame scrolls. The question may then leave the screen; "Save" stays reachable at the end of the text.
- **The blank card's place to write follows the same rule**: its title, its hint, the field and its two buttons fit above the keyboard, and the field grows with the text.
- **A strip stays free under the last row while the keyboard is up.** Safari floats its address bar over the bottom of the page there, and it covered "Save" in Marco's picture.
- **Where the browser does not report a visual viewport**, the card is laid out as before.

## Consequences

- The glossary's "about page" says "from the header of every screen". ADR 0013's sentences about the foot are read with this record.
- Tests that reached the about page through the foot reach it through the header. The name of the control does not change, so most of them need no change.
- The keyboard behaviour cannot be seen in a desktop browser. Tests pin the arithmetic with a stand-in for `visualViewport`; the proof is Marco's iPhone on staging, and the device script gains the steps.
- `interactive-widget=resizes-content`, already in the page's viewport line, makes Android Chrome shrink the page for the keyboard. The visual viewport gives the same box there, so one rule serves both.

## Alternatives

- **A smaller stack to make room for the title.** It gives the title air and takes it from the question, which is the thing to read.
- **"About" as a word in the header.** It is longer than the title's own line on a narrow phone. A "?" is the usual sign and costs 44 pixels.
- **Leaving the keyboard to the browser.** That is what the pictures show.
- **"Save" at the top of the open card.** It would be out of the browser bar's way, but it moves the one button a person looks for from where the design puts it.

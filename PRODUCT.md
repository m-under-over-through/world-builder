# Product

<!-- impeccable:product-schema 1 -->

Written on 2 November 2026 by the UI builder from `docs/briefs/week-2-ui.md`, `docs/architecture-and-risk-plan.md` and `docs/design-and-development-plan.md`, as the brief asked, without an interview. Every fact below comes from those documents; nothing here is invented. Marco and the partner correct it where it is wrong.

## Platform

web

## Users

Participants in a workshop run by Under Over Through and a partner. For the first workshop, readers of a newsletter about the future of local manufacturing in rural America. They open a link from the newsletter on whatever device it lands on: a phone most often, sometimes a tablet or a laptop, sometimes more than one. They are not users of a product; they are people taking part in a slow, personal exercise in imagining a different world. They come back three or four times over several weeks, a few minutes each time.

A second audience is the operator, Marco, who runs the system alone and must be able to read every screen and explain every part of it. A third is anyone who wants to check the privacy claims: a technical participant, a journalist, the partner's legal reviewer.

## Product Purpose

World Builder shows one simple question at a time about an alternative future and lets the participant answer in their own words. The answers are research material for the partner: a spreadsheet of anonymous answers at the end, nothing in between. Success is that people come back, answer honestly, and never worry about being identified; and that the operator can prove that worry unfounded.

## Positioning

Anonymous by construction, not by promise. There are no accounts, no emails, no cookies, no analytics. The only identifier is a random 16-digit code generated on the device. Answers are encrypted on the device to the workshop's public key before they leave it, so the server stores text it cannot read, and the private key lives in the operator's vault and on paper. A privacy panel one tap from every screen shows live values read from the running app; a trust page says what can be checked by an outsider, what holds by construction, and what is only promised. A survey tool cannot truthfully say any of this.

## Operating Context

- A workshop is a folder: `workshop.json` (dates, counts, key), `deck.json` (the cards) and `copy.md` (every participant-facing word). The same deployment hosts several workshops under `/<slug>/`.
- The newsletter carries one generic wave link, `/<slug>/join/<wave>`, open between the workshop's days up to a cap. Participants can also create single-use invite links.
- A session is a few cards: warm-ups then checkpoints, chosen by a seeded shuffle. Dismissing a card sends it to the end of the queue; a second dismissal defers it to a later session. There are no right answers, no timers, no streaks, and no revising earlier answers.
- Dictation comes from the operating system's keyboard, never from the app. The app receives text.
- Everything works offline: answers wait in an outbox on the device and sync when online. The server is the record; the device is the buffer.
- The first workshop opens on 16 November 2026 and closes on 6 December 2026. A demo of the complete working version is due on Friday 6 November 2026; the week after is for refining the experience with Marco and the partner.

## Capabilities and Constraints

- The client talks to one origin only. The Content Security Policy is `self`: no third-party scripts, fonts, images, analytics or error reporting. Fonts are the system stack or one open-licensed file bundled with the app.
- No personal data, ever: no name, email, IP address, user agent or precise timestamp anywhere. Days only.
- The code never appears in a URL. It travels in a header and is stored as a keyed hash.
- Answers are sealed on the device before they are stored; no readable answer stays on the device after sync. The participant cannot reread or revise.
- Every participant-facing string, including the wording of every error code, comes from `copy.md`, never from a component. The words are Marco's and the partner's.
- The screen map (`docs/screen-map.md`) is the specification. A screen that is not in it is not built.
- Terminology is fixed by `docs/glossary.md`: workshop, deck, card, session, participant, code, event, outbox, sync, wave, invite, trust page, privacy panel.
- Undecided on 2 November 2026: the partner's colours, the final cards, the final wording, and the legal review of consent, terms and the privacy policy. The design takes placeholders until they land.

## Brand Commitments

The organizer for the first workshop is "Under Over Through x Mechanism". The voice is the copy file's: short sentences, second person, no exclamation marks, plain words. Decided by Marco on 2 November 2026: warm, creative and informal; a conversation on paper, not a form; a workshop, not a product. Explicitly not the look of an AI product: no purple, no gradients, no glassy panels, no robot cheer. The partner's colours will replace the accent when they arrive. No logo or illustration assets exist yet.

## Evidence on Hand

- Thirteen placeholder cards in `workshops/rural-manufacturing/deck.json` (final cards due 5 November 2026).
- Placeholder copy in `workshops/rural-manufacturing/copy.md`.
- A running staging deployment at `https://staging--worldbuilder-uot.netlify.app` and a production address at `https://worldbuilder.under-over-through.co` that shows "Not open yet".
- Marco's phone-test observations of 29 October 2026 in `docs/build-log.md`.
- No testimonials, no press, no usage numbers. Nothing of that kind may be invented.

## Product Principles

1. Store nothing you would be embarrassed to show a participant, then show it to them.
2. One thing per screen: one action, everything else quiet.
3. Never block on the network. Writes land on the device first.
4. Every failure has a name and a page in the runbook; a participant sees plain words, never a raw code.
5. Fewer moving parts beats more features. If it cannot be explained, it is not ready.

## Accessibility & Inclusion

English only. Large reading sizes (18 pixels or more for card text), contrast of 4.5 to 1 or better everywhere, a 44-pixel minimum tap target, the whole flow usable at 320 pixels wide and with the system font size at its largest. Clean semantic structure, labels and focus order, checked with VoiceOver and TalkBack on real devices. Motion is small and meaningful, and none when the system asks for reduced motion.

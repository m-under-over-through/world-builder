# 0019. One page before the cards: the consent on the welcome

Date: 2026-11-04. Status: proposed, from Marco's morning pass over every screen of the deploy preview (his notes are dated 5 November); the legal reviewers read the new consent page before it is accepted. Changes the first-session flow of the architecture plan (section 8.1) and of ADR 0013; follows ADR 0017 (rounds) and ADR 0018 (identity by the link).

## Context

In his morning pass Marco went through every screen of the preview on his phone and on a laptop. Before the first card a new participant met four screens: the welcome with "New here", "What this is", "How it works", and "Before you start" with the consent and "I understand"; then a demo screen, a white card under a heading, before the real stack. Five taps before a first question, with the same few facts spread over three screens, in an app whose point is to be quick to pick up and put down. The design's Welcome artboard already drew one page: the fanned cards, a title, one paragraph, one full-width button. Its onboarding artboard drew the explanation as cards in the stack, not as pages.

The consent is a legal moment, not only a button. It must keep its words ("I understand"), its facts (who runs this, no name and no email, the answers locked on the phone, read and delete until the close day) and its place before any data leaves the device.

## Decision

- **The welcome is the only page before the cards.** In the layout of the Welcome artboard: the fanned tinted cards (decoration), the title and the purpose line, both copy blocks ("Welcome: title", "Welcome: purpose"), one paragraph ("Welcome") that says what this is, how it works and the consent facts, the line for the person's case ("This link is yours", "open the link you were sent", "the link this phone remembered is not in use any more"), and one full-width button.
- **The button is the consent and keeps its words: "I understand".** It does what the consent screen's button did: the link's code or a fresh one, `POST /join`, the day of consent stored, the first round started. The refusals are shown under the paragraph in their wording, as they were on the consent screen.
- **The consent facts move onto the welcome, unchanged.** The "Welcome" block carries the sentences of the consent draft of 2 November, with a note in `copy.md` for the legal reviewers saying that tapping "I understand" is the consent. "Please don't name real people" is said there, once, and in the terms; the open card no longer repeats it.
- **The intro screens go**: "Intro 1", "Intro 2", "Intro 3, consent", "Welcome: new here", the titles of those screens, Back and Next, "New here".
- **The demo screen goes; the onboarding card is the front of the real stack.** On the first open of a first round, once per device (`demoSeen`, as before), the card screen shows the stack with a tinted card in front labelled "Try a card", its words large, "Got it" at its foot, and the first real cards behind it in their tints. "Got it", a swipe or Set aside sends it away and the first card comes forward; the first card is recorded `shown` only then. Nothing is recorded for the onboarding card itself.
- **Recorded with it, the rest of the same pass**, each a small change to the screens the architecture plan already describes: no numbers of a round on any card, tile or bar (the area is the label; the laptop's top bar shows the count of answers so far); no toast after a save or a set aside; the set-aside cards as white tiles; "Prefer to talk?" as a text link; the about page's technical details folded under one closed `<details>`, with Back at the top of the about, terms and policy pages.

## Consequences

- The legal reviewers read one page instead of three: the welcome's paragraph and its one button. `docs/participant-texts.md` should carry the "Welcome" block next to the consent draft it replaces; the sentence "we cannot find out" predates ADR 0018 and is theirs to reword.
- The screen map's First session table shrinks to two rows: the welcome's "I understand" and the onboarding card. The Core loop loses its `synced` state and every toast. A line drawn nowhere and read by a screen reader (`aria-live`, the "Announcements" block) says "Saved" or "Set aside" each time, since the card leaving the stack is drawn as decoration.
- One tap from the welcome to a question, after "Got it". A person who reads nothing still taps "I understand" under the facts, as before they tapped it under the same facts on the third screen.
- The client loses three screens (`intro-1`, `intro-2`, `consent`), the `demo` screen and `DemoCard.svelte`, the toast and its timer, the progress strip, and nine copy blocks and keys; it gains `demoFront` on the state, a demo-front mode in the stack, and four copy blocks and keys, all placeholders until Marco words them.
- The events, the sync, the API and the contracts do not change. `demoSeen` and the consent day are stored as before.

## Alternatives not taken

- **"Let's start" as the welcome's button**, as the Welcome artboard writes it (fix 2 of the pass). Withdrawn by Marco the same morning: the consent must keep its words, and a button that consents without saying so is the kind of thing the reviewers would send back.
- **Keeping the intro as cards in the stack**, as the onboarding artboard draws four of them. One page and one card say the same in fewer taps, and the consent stays on a page, where it can be read in full before anything is sent.
- **Keeping a short toast for the set-aside cards only**: Marco confirmed that every toast goes; the set-aside list in "Your world so far" is the record.

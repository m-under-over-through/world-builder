# 0017. Rounds instead of sessions: no end screen, no install offer

Date: 2026-11-04. Status: accepted. Reverses the install offer of ADR 0013 and its session end; keeps its reminder.

## Context

On 4 November 2026 Marco tried the card screen of the new design (ADR 0015) on his iPhone and wrote down four points (`docs/briefs/rethink-2026-11-04.md`). Two of them are this record: no limit of four cards at a time, so a participant goes on as long as they want and stops when they want; and no "add to your home screen" offer, since people stay in the browser, keep the tab, or open the link again. He decided both the same night.

Until now a session was four cards (three warm-ups and one checkpoint, from `workshop.json`). The fourth card ended it with a screen: "Thank you", the code, the install offer on the first session, and "the next cards wait for you another day" with "Remind me" (ADR 0013). The participant had to come back another day for more.

The deck engine (`packages/deck`) already plans everything this needs. A session's queue is W warm-ups then C checkpoints from a seed; the cards deferred in the previous session come first; within a set, cards never answered come before answered ones, so an answered card returns only once the set's unanswered cards have run out. Nothing in the engine, the events, the sync or the export assumes a participant stops between sessions.

## Decision

**Rounds follow one another at once.** When the engine says a session is over, the client starts the next one in the same open (`apps/web/src/lib/state.svelte.ts`, `showCard` and `startRound`): a new session row numbered one higher, with a fresh seed, stored for the sync as `enterSession` always stored one, replayed, and its first card is the front. The engine puts the previous round's deferred cards first on its own. There is no screen between rounds and no toast for one; the stack simply goes on. Stopping is closing the tab. The next open resumes the current round on the same card, by the replay that already exists.

**No end of the deck.** Since answered cards come round again when a set's unanswered ones have run out, the queue never runs dry, and there is no end screen. ADR 0014 keeps revising off and allows a better answer the next time a card comes round; that is what happens. The brief's "That is every card" screen is not built: with answered cards coming round again, the deck never ends, so the screen would never show. A round that plans no cards at all (a `workshop.json` asking for none) shows an empty stack and starts no further round, so the client never loops.

**The word.** In the database and the events a round is a session, numbered per participant from 1, as before. The participant gets no word for it, since nothing is shown. In code and docs "round" names a session as it follows the last one without a pause; the glossary's "session" entry needs one sentence for it, proposed in the build log.

**The demo card and the dictation hint** still come on the first round of the first open only: session 1, nothing done in it yet.

**The session end goes**, with the install offer, its steps and its "Install" button, the `beforeinstallprompt` listener, and the copy blocks nothing reads any more. The manifest and the service worker stay (`apps/web/pwa.ts`, `apps/web/src/lib/install.ts` keeps `manifestHref` and `pointManifest`): they cost nothing, keep a reopened tab working offline, and an app someone installs on their own still starts in its workshop.

**"Remind me" moves** to two places, read from one block of `copy.md` ("Remind me"): the foot of "Your world so far", in the sheet on a phone and in the column on a laptop, under the tiles and the set-aside cards, as a quiet line; and the page about the app, under "what this is". The calendar file is unchanged (ADR 0013, `apps/web/src/lib/reminder.ts`).

**The toast for a second set-aside** reads "Set aside for later", since "another day" no longer describes it: the card comes first in the next round, which may be a minute away.

## Consequences

- A participant can go through the whole deck in one sitting; that is the point. A card answered once comes round again once the unanswered cards of its set are done, and a second answer is a second `answered` event in a later session, as the export already reads it.
- The code is no longer shown after the first four cards: it is on the page about the app only, until the second phase replaces it. The words that sent people to the session end for it ("Enter code", the `CLIENT_STORAGE_UNAVAILABLE` line) now point to the page about the app.
- The install offer of ADR 0013 is reversed. On an iPhone, Safari deletes a site's storage after seven days of Safari use without a visit; the home-screen app was the one exemption. Without the offer, a participant who stays away a week on an iPhone loses the device's code. The second phase (identity by the link, ADR 0018) is what answers that; until then the code on the page about the app is the way back.
- The card's label "NN of M" and the laptop's strip "n of M answered" still count within a round, so a participant sees "04 of 4" followed by "01 of 4". That is the design as built (ADR 0015); whether to keep the quiet rhythm or drop "of M" is open below.
- The world's summary "n to go" counts the cards left in this round, for the same reason.
- `docs/screen-map.md` has one row "Remind me" where the rows "Session end", "Install offer" and "Remind me" were, and the Card row ends in the next round. The engine, the contracts, the API, the export and the manifest do not change.

## Alternatives not taken

- **A short "That is every card" screen when every card is answered**, as the brief first proposed. The engine brings answered cards round again, so that moment never comes; building a screen for it would mean changing the engine's rule, which the brief keeps.
- **A small pause between rounds** (a toast, a line saying "four more"). Marco asked for the stack to go on; a pause is a session end in miniature.
- **Keeping the install offer on Android only**, where the installed app shares the browser's storage. The offer was there for the iPhone's seven-day rule; on Android it adds nothing the open tab does not do, and Marco asked for none.
- **A longer session in `workshop.json`** (say twenty cards). It moves the end screen further away without removing it, and changes the engine's plan of warm-ups then checkpoints.

## Open

- The second phase, identity by a value in the newsletter link, with no code typed or shown: ADR 0018, written when the newsletter tool's test send has answered (the brief's sections 2 and 4).
- The label "NN of M" and the strip "n of M answered" within a round: keep them, or show the card's number alone. Marco's call, with the design.
- The glossary sentence for "session" (proposed in the build log), and the decision records index in `docs/adr/README.md`, are the integrator's.

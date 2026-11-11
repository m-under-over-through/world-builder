# Copy: rural-manufacturing

Draft wording. Marco and Mechanism write the final words here; the card questions live in the cards sheet and in deck.json, not in this file.

This file holds every word the app shows, screen by screen, in the order a participant meets
them. You can edit the words and nothing else.

How this file is built:

- A line that starts with one hash, such as "# Welcome", is a screen heading. It is for you:
  it tells you which screen the blocks under it belong to. The app does not read it, and any
  line between it and the next block heading is ignored. You may add notes there.
- A line that starts with two hashes, such as "## Welcome (under 120 words)", is a block: one
  piece of text, or one list of short entries, that the app looks up by name. The words in
  brackets after the name say how long it should be; keep to that.
- The headings and the names at the start of list lines are the app's, not yours. Do not rename
  them, or the app cannot find its words. Only the words after them are yours to change.
- A line that starts with "- name: " is one entry of a list. The app reads the entry by its name.
- A block may appear more than once, under different screens, when the screens share it. For
  example "Titles" and "Buttons" appear on each screen with the titles and buttons that screen
  shows. The app joins the parts into one block. Words used on several screens are under
  "Everywhere", at the end.
- A line that says only [placeholder] under a block marks words that are still a draft. Delete
  the line when the words are final. In a block that appears in several places, each part has
  its own line. To count what is left, run: grep -c '^\[placeholder\]' copy.md
- A word in square brackets inside the text, such as [code] or [day], is a slot: the app fills
  it in. Keep the slot where it makes sense in your sentence; do not translate or change it.
- A note between <!-- and --> is for the person editing this file. The app never shows it.
- A blank line starts a new paragraph.
- Two stars around words, such as **this**, make them bold where a block allows it.

If something goes missing, the check tells you: `npm run check` fails and names the block or the
entry the app could not find, and so does a block that has the same entry twice. The app also
shows "[missing: ...]" in place of words it cannot find.

# Welcome

## Welcome: title (one line)

<!-- The title of the welcome, the one page before the cards (ADR 0019). workshop.json's "name" carries the same words, for the server and the about page. -->

The future of local production in America

## Welcome: purpose (one line)

<!-- The line under the title on the welcome. -->

Imagine, detail by detail, an alternative future for local production in America.

## Welcome (under 120 words)

<!-- The one paragraph of the welcome, above its one button, "I understand" (Buttons, i understand). It replaces the three intro screens and the consent screen (ADR 0019): what this is, how it works, and the consent. For the legal reviewers: tapping "I understand" is the consent, so the consent facts of the draft of 2 November (docs/participant-texts.md) are all here, in the same words: who runs it, no name, no email, no account, the answers locked on the phone, read and delete until 6 December 2026. "We cannot find out" predates the link of one's own (ADR 0018) and is the reviewers' to reword. "Please don't name real people" is said here once, and in the terms; the open card no longer repeats it. -->

This is a research project by Mechanism and Under Over Through about imagining alternative futures for local production in America. Dystopia and utopia are easy, but we want to explore the messy, unresolved middle, and imagine ways to thrive through systemic changes.

You see one card at a time with a question: answer in your own words, or set it aside. Add details, think about the underlying systems. There are no wrong answers.

You can use the same link you received to go back to the cards until December 6th 2026.

We do not ask who you are: no name, no email, no account. Your answers are locked and only the research team can unlock them.

## Welcome: link not accepted (under 40 words)

<!-- One quiet line on the welcome screen after the server refused what this phone remembered from a link, for instance after "delete everything I sent" on another phone. -->

The link this phone remembered is not in use any more. Open the link from your email again.

## Welcome: your link (under 40 words)

<!-- One line under the welcome's paragraph, above "I understand", when the link this device opened carries a value of its own for the recipient (ADR 0018). -->

This link is yours. It opens your cards on any phone. To bring someone in, use the links at the foot of the email, not this one.

## Welcome: no link (under 40 words)

<!-- Shown under the welcome's paragraph in place of the "I understand" button when this device has no newsletter link or invite to join through. -->

[placeholder]
To start, open the link you were sent. This page cannot start you on its own.

## App labels

[placeholder]

- retrying: Busy at the moment. Trying again in a moment.

## Buttons (one or two words each)

[placeholder]

- i understand: I understand

# Try a card

## Demo card (under 15 words)

<!-- The words on the onboarding card, the front of the stack on the first open, shown large (ADR 0019). Its small label is "demo label" in Card labels; its button is "Got it". -->

[placeholder]
Open a card to answer. Swipe it away to set it aside.

## Card labels

[placeholder]

- demo label: Try a card

# The card

## Card labels

<!-- The words on a card. The label at the top of a card is its area from the deck, and nothing for a card without one: no numbers (ADR 0019). "demo label" is the label of the onboarding card. "write an answer" is the line with the pen at the foot of the front card, on every device. "counter" shows near the limit: [n] is how many characters were written, [max] the limit. "close without saving" is the spoken name of the × on an open card. -->

[placeholder]

- write an answer: Write an answer
- close without saving: Close without saving
- counter: [n] / [max]
- placeholder: Say it the way you would say it out loud.
- could not save: Could not save.

## Titles (one line each)

[placeholder]

- dictation hint: Prefer to talk?

## Dictation hint (under 25 words, per platform)

[placeholder]

<!-- Shown under the title "Prefer to talk?" (Titles, dictation hint), so the lines do not repeat it. -->

- iPhone and iPad: Tap the microphone on your keyboard.
- Android: Tap the microphone on your keyboard.
- Mac: Press the microphone key twice, or Edit > Start Dictation.
- Windows: Press Windows + H.
- ChromeOS: Press Search + D.

## Buttons (one or two words each)

[placeholder]

- prefer to talk: Prefer to talk?
- save: Save

## Card states (under 10 words each)

<!-- "saving" is the Save button's label while the answer is sealed. Nothing else is said after Save or Set aside: the card leaving and the next one coming to the front is the feedback (ADR 0019). -->

[placeholder]

- saving: Saving…

## Announcements (under 6 words each)

<!-- Said to a screen reader only, each time a card is saved or set aside: the card leaving the stack is drawn as decoration, so these words are the feedback a screen reader gets (ADR 0019). -->

[placeholder]

- saved: Saved
- set aside: Set aside
- set aside for later: Set aside for later

## Thank you card (under 30 words)

<!-- Shown as the last card in the stack, not a screen, once every card of the deck is answered or set aside twice (ADR 0020). Nothing comes after it. -->

[placeholder]
Thank you for your answers! You can always revisit previous answers.

# Your world so far

## Your world (under 40 words each)

<!-- "Your world so far": the answers given on this phone, one tile per answer (ADR 0014), and the cards set aside, as white tiles. On a phone, the pill at the foot of the card screen opens it as a sheet; on a laptop it is the right column. "pill label" is the spoken name of the pill, [n] the number of answers. "summary" is the line under the title: [answered] answers so far, [aside] cards set aside now. "answered so far" is the count in the top bar on a laptop, [n] shown large and the words after it small. A tile's label is its card's area, with no number (ADR 0019). "written elsewhere" stands in for the words on a tile when the answer was written on another phone, which keeps them. "close" is the spoken name of the × on the sheet. -->

[placeholder]

- title: Your world so far
- pill label: Your world so far, [n] answered
- summary: [answered] answered · [aside] set aside
- answered so far: [n] answered
- answered: Answered
- set aside: Set aside
- empty: Nothing here yet. Answer a card and it lands here.
- empty laptop: Nothing here yet. Answer a card on the left and it lands here, one tile per question. The cards you set aside gather at the bottom.
- written elsewhere: Written on another phone.
- close: Close

# About this app

## Titles (one line each)

<!-- The heading of each screen. Each title sits under the screen that shows it; the app reads all the parts as one block. -->

[placeholder]

- about: About this app

## About: what this is (under 50 words)

<!-- The two sentences at the top of the "About this app" page, with the "Remind me" line under them. -->

[placeholder]
Mechanism and Under Over Through are asking a few questions about the future of local production in America, one card at a time. You answer in your own words, and nobody asks who you are. The link in your email is yours.

## About: in short (under 60 words)

<!-- A few plain sentences on the "About this app" page, under "Remind me" and above "The technical details", which fold the trust page, the facts and the diagnostics away (ADR 0019). -->

[placeholder]
Your answers are locked on this phone before they are sent, and only the research team can unlock them. We never ask for your name or your email. This phone keeps your own answers readable for you. You can delete everything you sent, below, until 6 December 2026.

# The technical details

## Titles (one line each)

[placeholder]

- technical details: The technical details
- trust page: How your answers are protected

## Trust page: what we store (under 80 words)

<!-- The six "Trust page" blocks are the paragraphs under "How your answers are protected" on the "About this app" page, in this order, without headings of their own. Shortened on 3 November 2026 from the drafts of 2 November in docs/participant-texts.md, which the legal review reads; the words in square brackets are the reviewers' decisions. -->

[placeholder]
For each participant we keep a random code in scrambled form, the day they joined, which link they came through, and how many invites they have left. For each card, whether it was shown, answered or set aside, in what order, on which day. Each answer is a locked block of text our server cannot read.

## Trust page: what we never collect (under 60 words)

[placeholder]
We never collect your name, email, phone, address, location, IP address, the make of your phone or browser, the exact time of anything, cookies, analytics identifiers, the page you came from, or audio. The link in your email is yours: anyone who opens it continues your cards.

## Trust page: how it is protected (under 80 words)

[placeholder]
Before an answer leaves your phone it is locked with the research team's key. Our server stores the locked text and cannot open it. The phone you write on keeps your answers readable locally, for you alone. The key's fingerprint is [key fingerprint]. You can compare it with the one in the source code.

## Trust page: check it yourself (under 100 words)

[placeholder]
You can verify our claims in three ways. The security headers of this site, readable with any header scanner, forbid every outside script, image, font and connection. The network tab of your browser shows every request going to one address, this one. The source code is public at [source], where the database has no column for a name or an email.

## Trust page: who, where, until when (under 100 words)

[placeholder]
Mechanism and Under Over Through own the answers jointly; Under Over Through runs the system. Everything is stored in the United States. Collection closes 6 December 2026. The week after, the team unlocks the answers on one computer and produces the research spreadsheet. On 5 February 2027 everything on the server is deleted, backups included.

## Trust page: the honest limit (under 60 words)

[placeholder]
Nobody can prove that a server keeps no record of a connection. That is why this one is built to hold nothing worth taking: no names, no readable answers, no way back from a code to a person.

## Trust page links

<!-- The names of the links under "How your answers are protected" and at the end of "About this app"; the addresses are in "Trust page variables". -->

[placeholder]

- source: The source code
- webbkoll: Webbkoll's report on this site
- blacklight: Blacklight's report on this site
- terms: Terms
- privacy policy: Privacy policy

## Trust page variables

- organizer: Under Over Through x Mechanism
- data owners: Under Over Through and Mechanism, jointly
- storage region: United States
- collection closes: 6 December 2026
- deletion: 5 February 2027
- hostname: worldbuilder.under-over-through.co
- contact: privacy@under-over-through.co
- key fingerprint: from workshop.json
- source: https://github.com/m-under-over-through/world-builder
- webbkoll: https://webbkoll.dataskydd.net/en/results?url=https%3A%2F%2Fworldbuilder.under-over-through.co%2F
- blacklight: https://themarkup.org/blacklight?url=worldbuilder.under-over-through.co

## Titles (one line each)

[placeholder]

- privacy panel: Right now, from this phone

## Privacy panel

<!-- The labels of the rows under "Right now, from this phone" on the "About this app" page. A row shows a live value read from the running app. "What we hold" lists the server's rows as they are: [day], [n], [kind], [card], [seq], [version] and [chars] are filled by the app. -->

[placeholder]

- cookies: Cookies set by this app
- hosts: Hosts this app has talked to since it opened
- permissions: Microphone, camera, location
- permissions value: blocked by policy
- permissions note: This page cannot use them. Dictation is your keyboard's own, handled by your phone, not by this page.
- key: Your answers are locked to the key
- stored: What we hold about you
- nothing stored: nothing yet
- not reachable: could not be read from the server just now
- stored summary: [sessions] sessions, [events] events, every answer sealed
- show rows: Show every row
- joined: Joined on
- came through: Came through
- an invite: an invite
- invites left: Invites left
- sessions: Sessions
- session row: Session [n], started [day]
- events: Events
- event row: [kind], card "[card]", number [seq], on [day], deck [version]
- sealed body: sealed answer, [chars] characters; the server cannot read it. The phone that wrote it keeps it readable for you, until you delete it.
- waiting: Waiting to sync
- outbox summary: [events] events in [sessions] sessions
- last sync: Last sync
- last sync day: on [day]
- last error: Last error
- no error: none
- version: Version
- source: The source code at this version

## Event kinds

<!-- What the server records for a card, in plain words. -->

[placeholder]

- shown: shown
- answered: answered
- dismissed: set aside
- deferred: put off to another session
- revisited: revisited

## Diagnostics

<!-- Inside the privacy panel: the last sync result, the outbox size and the last error code with its meaning. -->

[placeholder]

- last sync: Last sync
- outbox: Waiting to sync
- last error: Last error code
- never: never
- ok: ok
- offline: offline
- error: failed

# Delete everything

## About: delete (under 40 words)

<!-- The line above the "Delete everything and start over" button, at the end of "About this app", only once the phone has started. The last sentence is there because a link makes the same participant again (ADR 0018). -->

[placeholder]
Changed your mind? Everything you sent can be deleted, from this phone and from our server, any time until 6 December 2026. Opening your link again starts you over from nothing.

## Buttons (one or two words each)

[placeholder]

- delete: Delete everything and start over

## Privacy panel: delete confirm (under 40 words)

<!-- The second step, with "Yes, delete everything" and "Keep my answers". -->

[placeholder]
Delete everything you sent, from this phone and from our server? It cannot be brought back.

## Buttons (one or two words each)

[placeholder]

- yes delete: Yes, delete everything
- keep: Keep my answers

# Terms

## Titles (one line each)

[placeholder]

- terms: Terms

## Terms (under 300 words)

<!-- Draft of 2 November 2026 from docs/participant-texts.md, awaiting the legal review; the words in square brackets are the reviewers' decisions. -->

[placeholder]
**What this is.** A set of questions about an imagined future, run by Under Over Through and Mechanism for research.

**Who can take part.** Anyone who received the link [and is 18 or older]. One person may use more than one phone; to us, each phone that did not open the same newsletter link is a separate participant.

**What you agree to.** Your answers belong to the research. Under Over Through and Mechanism own them jointly and may quote them, without any way to tell who wrote them, in reports, presentations and publications. Please do not name real people, including yourself, in an answer; if you do, we remove the name before anyone reads the answer.

**What we ask of you.** Answer honestly, or set a question aside. Do not forward your own link: it is the key to what you wrote. The spare links at the foot of the email are for forwarding.

**Ending.** You can stop at any time by closing the app. You can delete everything you wrote at any time until 6 December 2026, from "About this app". After that date the answers are part of the research set and can no longer be removed one by one; everything is deleted on 5 February 2027. We may close the project earlier, in which case the app says so.

**No promises beyond these.** The app is provided as it is. If it fails, nothing you wrote is sent anywhere else, and your phone keeps unsent answers for fourteen days and sends them when it can.

**Questions.** [contact address]. [Governing law, if the reviewers want one.]

# Privacy policy

## Titles (one line each)

[placeholder]

- privacy policy: Privacy policy

## Privacy policy (under 400 words)

<!-- Draft of 2 November 2026 from docs/participant-texts.md, awaiting the legal review; the words in square brackets are the reviewers' decisions. -->

[placeholder]
Under Over Through runs this app; Mechanism is the research partner. This policy says what the app does with information, and it is as short as the list is.

**What we store.** For each participant: a 16-digit code that your phone makes from your newsletter link (or at random when the link has none), kept as a scrambled version that cannot be turned back into the code; Mechanism's newsletter tool knows which link went to which address and we never see that list, so neither of us alone can connect an answer to a person; the day the participant joined; which newsletter link they came through; how many invitations they have left. For each session: its number and the day. For each card: whether it was shown, answered, set aside or put off, in what order, and the version of the question. Each answer is stored as a locked block of text that our servers cannot read.

**What we never collect.** Your name, email, phone number, address, location, IP address, the make of your phone or browser, the exact time of anything, cookies, advertising or analytics identifiers, the page you came from, or audio. The app sets no cookies and contacts no other website. These are not settings we could change by mistake: the database has no column for them.

**How answers are protected.** Before an answer leaves your phone it is locked with a key that only the research team holds. The server stores the locked text and can neither read it nor unlock it. The key's fingerprint is printed on the trust page, so anyone can check that the key in the app is the one the team published.

**Who sees what.** Under Over Through and Mechanism, jointly, see the unlocked answers once, at the end, on one computer, after a reading pass that removes any name that slipped in. The companies that host the app (Netlify, Neon and Backblaze, in the United States) store and move the locked data for us; they may keep technical connection records for a short time under their own policies, and we do not receive or use them. Nobody else sees anything.

**Where.** The servers and the backup copies are in the United States.

**Your controls.** "About this app" shows everything we hold about you, as it is stored, and has a button that deletes all of it. The link in your email is the only way back to your answers, including from another phone; without it, neither you nor we can find them again. That is a limit of the design, and it is on purpose.

**Until when.** Collection closes on 6 December 2026. In the week after, the research team unlocks the answers, removes any names, and produces the research spreadsheet. Everything on the server is deleted on 5 February 2027, backup copies included; the last copies expire within two weeks after that. The spreadsheet, which holds no code and no name, is kept by Under Over Through and Mechanism.

**Changes.** If this policy changes while the project runs, the app shows the new text and the date it changed. [Dated commitment: this version, 2 November 2026.]

**Contact.** [contact address].

# Closed and not yet open

## Titles (one line each)

[placeholder]

- not open yet: Not open yet.
- closed: This workshop has closed.

## Not open yet (under 40 words)

[placeholder]
This opens on [day]. Keep the link and come back then.

## Closed (under 40 words)

[placeholder]
Thank you. The answers are being read now.

# An address that is not a workshop

## Titles (one line each)

[placeholder]

- not a workshop: World Builder

## Not a workshop (under 30 words)

[placeholder]
This address is not a workshop. Use the link you were sent.

# Error lines

## Error: REQUEST_INVALID (one line)

[placeholder]
Something in that request was not right. Try again; if it keeps happening, tell us.

## Error: REQUEST_TOO_LARGE (one line)

[placeholder]
That was too much to send at once. The app will send it in smaller pieces.

## Error: WORKSHOP_UNKNOWN (one line)

[placeholder]
This address is not a workshop we know. Use the link you were sent.

## Error: WORKSHOP_CLOSED (one line)

[placeholder]
This workshop has closed and no longer takes answers.

## Error: JOIN_WAVE_UNKNOWN (one line)

[placeholder]
This link is not one we sent. Check the address in the newsletter.

## Error: JOIN_WAVE_FULL (one line)

[placeholder]
This link has reached the number of people it can admit. Thank you for your interest.

## Error: JOIN_INVITE_INVALID (one line)

[placeholder]
This invite link is not one we know. Ask the person who sent it for a fresh one.

## Error: JOIN_INVITE_USED (one line)

[placeholder]
This invite link has already been used. Each one works once.

## Error: JOIN_CODE_TAKEN (one line)

[placeholder]
The code we made for you was already taken. Tap again to get a new one.

## Error: AUTH_CODE_MISSING (one line)

[placeholder]
Auth code missing. Open the link from your email again.

## Error: AUTH_CODE_UNKNOWN (one line)

[placeholder]
The link this phone remembered is not in use any more. Open the link from your email again.

## Error: SYNC_PAYLOAD_INVALID (one line)

[placeholder]
The server did not accept what this app sent. Your answers stay on this device; please tell us.

## Error: SYNC_BATCH_TOO_LARGE (one line)

[placeholder]
Too much to send at once. The app will try smaller pieces.

## Error: INVITES_EXHAUSTED (one line)

[placeholder]
You have used all your invites.

## Error: RATE_LIMITED (one line)

[placeholder]
Too many requests at once. Wait a moment and try again.

## Error: SERVER_ERROR (one line)

[placeholder]
Something went wrong on our side. Your answers stay on this device; try again in a moment.

## Error: SERVER_NOT_CONFIGURED (one line)

[placeholder]
The server is not ready. Your answers stay on this device; try again later.

## Error: CLIENT_STORAGE_UNAVAILABLE (one line)

[placeholder]
This browser will not keep anything between visits. You can still answer while this page is open; to continue later, open the link from your email again.

## Error: CLIENT_SEAL_FAILED (one line)

[placeholder]
Your answer could not be encrypted, so nothing was saved or sent. Try again.

## Error: CLIENT_SYNC_FAILED (one line)

[placeholder]
Could not reach the server. Your answers are saved on this device and will sync when you are online.

# Everywhere

## App labels

[placeholder]

- loading: Loading…
- app name: World Builder

## Buttons (one or two words each)

[placeholder]

- about: About this app
- back: Back
- got it: Got it
- set aside: Set aside

## Card labels

[placeholder]

- swipe hint: or swipe the card away

## Remind me (under 20 words)

<!-- One quiet line with the "Remind me" link (Buttons, remind me) after it, which adds the "Reminder" below to the phone's own calendar. Shown in two places: at the foot of "Your world so far", in the sheet on a phone and in the column on a laptop, under the tiles and the set-aside cards; and on the "About this app" page, under "what this is". -->

[placeholder]
Come back whenever you like. Your calendar can nudge you twice a week.

## Buttons (one or two words each)

[placeholder]

- remind me: Remind me

## Reminder

<!-- The calendar reminder behind "Remind me" (the block above): a repeating event the phone's own calendar shows twice a week until the close day. Nothing about the person is in it. [link] is the workshop's home address, filled in when the app is built. -->

[placeholder]

- summary: World Builder: a few more cards
- description: A few quiet minutes with the next cards, whenever it suits you. [link]

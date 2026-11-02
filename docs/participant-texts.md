# Texts shown to participants: consent, terms, privacy policy, trust page

Drafts of 2 November 2026 for review by Marco and Mechanism's legal team. Written to be read on a phone: short sentences, plain words, nothing a participant has to scroll past to understand. The client lays these out from `workshops/<slug>/copy.md`; the words here go there once the review lands. Square brackets mark the places where the reviewers decide.

The facts behind every sentence are in `docs/architecture-and-risk-plan.md`, sections 6.4 (what is never collected), 9 (what is stored), 13 (the trust page) and 14 (the end of the project). Dates for the rural-manufacturing workshop: collection closes 6 December 2026; everything is deleted on 5 February 2027.

## Consent (the third intro screen, under 80 words)

This is a research project by Under Over Through and Mechanism about the future of local manufacturing in rural America. You answer questions in your own words. We do not ask who you are, and we cannot find out: no name, no email, no account. Your answers are locked on your phone before they leave it, and only the research team can unlock them. You can read what we hold about you, and delete it, at any time until 6 December 2026.

[I understand]

## Terms (one page)

**What this is.** A set of questions about an imagined future, run by Under Over Through and Mechanism for research. There are no right answers, no score and no payment.

**Who can take part.** Anyone who received the link [and is 18 or older]. One person may use more than one phone; to us, each phone that has not been linked by a code is a separate participant.

**What you agree to.** Your answers belong to the research. Under Over Through and Mechanism own them jointly and may quote them, without any way to tell who wrote them, in reports, presentations and publications. Please do not name real people, including yourself, in an answer; if you do, we remove the name before anyone reads the answer.

**What we ask of you.** Answer honestly, or set a question aside. Do not share your 16-digit code with anyone: it is the only key to what you wrote.

**Ending.** You can stop at any time by closing the app. You can delete everything you wrote at any time until 6 December 2026, from "Your privacy" in the app. After that date the answers are part of the research set and can no longer be removed one by one; everything is deleted on 5 February 2027. We may close the project earlier, in which case the app says so.

**No promises beyond these.** The app is provided as it is. If it fails, nothing you wrote is sent anywhere else, and your phone keeps unsent answers for fourteen days and sends them when it can.

**Questions.** [contact address]. [Governing law, if the reviewers want one.]

## Privacy policy (one page)

Under Over Through runs this app; Mechanism is the research partner. This policy says what the app does with information, and it is as short as the list is.

**What we store.** For each participant: a random 16-digit code, kept as a scrambled version that cannot be turned back into the code; the day the participant joined; which newsletter link they came through; how many invitations they have left. For each session: its number and the day. For each card: whether it was shown, answered, set aside or put off, in what order, and the version of the question. Each answer is stored as a locked block of text that our servers cannot read.

**What we never collect.** Your name, email, phone number, address, location, IP address, the make of your phone or browser, the exact time of anything, cookies, advertising or analytics identifiers, the page you came from, or audio. The app sets no cookies and contacts no other website. These are not settings we could change by mistake: the database has no column for them.

**How answers are protected.** Before an answer leaves your phone it is locked with a key that only the research team holds. The server stores the locked text and can neither read it nor unlock it. The key's fingerprint is printed on the trust page, so anyone can check that the key in the app is the one the team published.

**Who sees what.** Under Over Through and Mechanism, jointly, see the unlocked answers once, at the end, on one computer, after a reading pass that removes any name that slipped in. The companies that host the app (Netlify, Neon and Backblaze, in the United States) store and move the locked data for us; they may keep technical connection records for a short time under their own policies, and we do not receive or use them. Nobody else sees anything.

**Where.** The servers and the backup copies are in the United States.

**Your controls.** "Your privacy" in the app shows everything we hold about you, as it is stored, and has a button that deletes all of it. Your code is the only way to act on your data, including from another phone; if you lose it, neither you nor we can find your answers again. That is a limit of the design, and it is on purpose.

**Until when.** Collection closes on 6 December 2026. In the week after, the research team unlocks the answers, removes any names, and produces the research spreadsheet. Everything on the server is deleted on 5 February 2027, backup copies included; the last copies expire within two weeks after that. The spreadsheet, which holds no code and no name, is kept by Under Over Through and Mechanism.

**Changes.** If this policy changes while the project runs, the app shows the new text and the date it changed. [Dated commitment: this version, 2 November 2026.]

**Contact.** [contact address].

## Trust page (seven sections)

**1. What we store.** The list from the privacy policy, with one real example row from the database: a code's scrambled form, a day, a card id, a kind, a sequence number, and a locked answer that reads like `v1.` followed by letters and digits. That is the whole of it.

**2. What we never collect.** Name, email, phone, address, location, IP address, device or browser, exact time, cookies, analytics identifiers, referrer, audio.

**3. How it is protected.** Your answers are locked on your phone with the research team's key. Our servers store scrambled text they cannot read. The key's fingerprint is `{fingerprint}`; compare it with the one in the source code.

**4. Check it yourself.** Three checks need no trust in us. The security headers of this site, readable with any header scanner, forbid every outside script, image, font and connection. The network tab of your browser shows every request going to one address, this one. The source code is public at `{source}`, where the database schema has no column for a name or an email.

**5. Your controls.** "Your privacy", one tap away on every screen, shows everything we hold about you as it is stored, and deletes all of it on request, any time until 6 December 2026.

**6. Who, where, until when.** Under Over Through and Mechanism own the answers jointly; Under Over Through runs the system, and the spreadsheet is shared with Mechanism at the end. Everything is stored in the United States. Collection closes 6 December 2026, the spreadsheet is produced the week after, and everything on the server is deleted on 5 February 2027, backups included.

**7. The honest limit.** Nobody can prove that a server keeps no record of a connection. That is why this one is built to hold nothing worth taking: no names, no readable answers, no way back from a code to a person.

## The data management plan (one paragraph, inside "Your privacy")

Answers are locked on each phone with the research team's key and sent to a database in the United States. Every night a copy is locked again with a second key and kept for fourteen days in two places. On 6 December 2026 collection closes; the team unlocks the answers on one computer, removes any names, and produces the research spreadsheet. On 5 February 2027 the database and its backups are deleted, and the key that locks the answers is destroyed.

## Notes for the reviewers

- The consent text replaces the placeholder in `copy.md` under "Intro 3, consent"; the three bracketed items (age, contact address, governing law) are decisions.
- "Locked" is used for "encrypted" and "scrambled" for "hashed" throughout, on purpose; the trust page's section 3 and the learning notes explain the real terms for readers who want them.
- The trust page's `{fingerprint}` and `{source}` are filled by the app from the workshop file and the running commit, so the page cannot drift from the key it describes.
- Nothing here promises that the hosting companies keep no logs; the honest limit says why.

# 0021. The invitation page

Date: 2026-11-12. Status: accepted, Marco's decision of 11 November (his evening; the machine's day is the 12th). Adds to ADR 0018, whose "newsletter tool" is now a person: Mechanism sends each invitation by hand.

## Context

ADR 0018 gave every recipient a link with a value of its own after `#p=`, and assumed the partner's newsletter tool would put the value there. In the week of 9 November Marco and Mechanism decided otherwise: Mechanism writes each invitation by hand in Gmail, with a personal note, the way Marco sent Mechanism its test links. So someone has to make about eighty links, plus spare links to forward, with no tool to do it.

Made by hand, a link value is the easy place for two mistakes. A value that can be guessed (a name, initials, a running number) would let the operator alone connect a person to their answers. A value used twice makes two people one participant: each sees the other's progress, and "Delete everything" by one deletes the other's answers. The first idea was a list of links made by the integrator; it removes both mistakes, but it is a file that exists, and the operator has seen every value in it.

Marco's idea is better: a page that makes the links for one invitation at a time, with the words around them, and a button to copy the text. The next press replaces what was there. No list ever exists.

## Decision

- **A page at `/<slug>/join/<wave>/invitations`.** It is the join address with one more word, so it knows the workshop and the wave without a setting. No screen links to it; Marco gives the address to Mechanism. It works before the opening day, because the invitations are written before the send.
- **The page talks to nobody and keeps nothing.** It makes no request to the API, opens no store, makes no code for the device, counts no wave open, and writes nothing to the address, the history or the device's storage. A set of links lives in the page's memory until it is copied or replaced. A reload is an empty page.
- **A link set is one own link and two spare links.** Each is `<origin>/<slug>/join/<wave>#p=<value>`, with the origin the page is served from, so the page on staging makes staging links and the page on production makes production links. Two spares, not three, is Marco's choice: the wave's cap is 150.
- **A value is 20 characters, each drawn evenly from 32** (lowercase letters and digits, without the look-alikes `i`, `l`, `o`, `u`), from `crypto.getRandomValues`: 100 random bits. Letters and digits only, so no mail program cuts a mark off the end of a link. It fits what `lib/identity.ts` accepts (4 to 80 letters, digits, `-`, `_`).
- **Unique without a list.** Nothing remembers the values made before. With 100 random bits two values never match in practice; and for the code they make (ADR 0018: sixteen digits), 450 links give about one chance in a hundred billion that two share a code. Learning note 12 has the sum.
- **The words come from the copy file.** The text of the invitation is the block "Invitation: text", with the slots `[your link]`, `[spare link 1]` and `[spare link 2]`. It is plain text: Mechanism pastes it into the email and writes the personal note around it. The page's own title, lines and buttons are blocks under the screen heading "Invitation page".
- **A set is copied once.** "New set" makes a set and shows the text. "Copy the text" puts it on the clipboard, and the text then leaves the screen for one line: copied, press "New set" for the next person. The costly mistake is the same set sent to two people; this takes away the easy way to make it.
- **One failure path.** If the browser refuses the clipboard, the page says so with the code `CLIENT_COPY_FAILED`, and the text stays on the screen to be selected and copied by hand. The next "New set" replaces it.
- **The page states three rules for Mechanism**: one set for one person; keep no list of who got which link; never send or copy an invitation to Under Over Through.

## Consequences

- **The promise of ADR 0018 does not change, and the page must not be sold as more.** Each sent email still shows who got which link, in Mechanism's sent mail and in the recipient's inbox. Mechanism knows which link went to whom; the operator holds the database and the pepper; no single party can connect an answer to a person. What the page removes is the list, and the operator's sight of any value.
- **The page is public, like the rest of the client.** Anyone who finds it can make links. That gives nothing new: a link value could always be made up by hand, and the wave address is in a public repository. The wave's cap bounds the joins (`JOIN_WAVE_FULL`). With eighty invitations the cap of 150 is reached only if more than seventy of the 160 spare links are used.
- **Glossary.** New: **invitation page**, **link set**. Changed: **link value** (made by the invitation page, not by a newsletter tool) and **wave** (one send of invitations).
- **Words still to change, in Marco's file.** The privacy policy's "What we store" says "Mechanism's newsletter tool knows which link went to which address"; the "link is not one we sent" line says "Check the address in the newsletter". They are his to reword; `docs/participant-texts.md` follows.
- **Services.** The "Newsletter" row of `docs/services.md` becomes "Invitations": Mechanism's Gmail, by hand.
- **The go or no-go page** (ops repository): decision D7 is this page, D8 is "two spare links".

## Alternatives

- **A list of links made by the integrator.** No guessable value and no repeat, but a file exists, the operator has seen every value, and Mechanism has to keep track of which rows are used.
- **Mechanism makes the values by hand.** The two mistakes above, eighty times.
- **Links made by the server, with a table of the ones given out.** It would make a repeat impossible by construction, but the server would see every value, which is the one thing ADR 0018 avoids, and it would need a sign-in for Mechanism.
- **A mail-merge from a sheet.** It brings back the list, with the names next to the links.

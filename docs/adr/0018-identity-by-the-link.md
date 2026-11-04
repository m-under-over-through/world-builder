# 0018. Identity by the link: no code typed or shown

Date: 2026-11-04. Status: accepted, Marco's decision of 4 November; two items stay open, the partner's test send and the wording of the promise, and either may send this record back. Supersedes the code's role in ADR 0005 and ADR 0013's "I have a code" and code display; the keyed hash and the sealing stay.

## Context

Marco tested the card screen on his iPhone on 4 November. Typing the 16-digit code to continue, iOS offered his credit card number as autofill: a numeric field of sixteen digits looks like a card field, and in a creative workshop that looks like phishing. The code was also the one thing participants had to understand and keep. He asked for no code at all, for a participant to land where they left off by opening the newsletter's link again, on any device, and accepted a weaker promise for it as long as the server never holds a name next to an answer (`docs/briefs/rethink-2026-11-04.md`).

## Decision

- **The newsletter link carries a value of its own per recipient, after the `#`**: `/<slug>/join/<wave>#p=<value>`. What follows `#` stays in the browser: it is not sent to Netlify, not to the API, not written in a log, not passed on as a referrer. The client turns the value into the 16-digit code with a one-way hash (SHA-256 of the value, the last sixteen digits of its decimal reading; the rule lives in `apps/web/src/lib/identity.ts` with a test) and joins as today, through `POST /join` with the code and the wave. The server sees exactly what it sees now: a keyed hash of a code, a wave, days. No contract or API change.
- **A second device with the same link is the same participant.** The join answers `JOIN_CODE_TAKEN`; for a code made from a link value the client reads that as "this is me", keeps the code and continues with `GET /me`, the intro and the consent already given once. For a code the device made itself (no value in the link) the retry with a fresh code stays as it is.
- **Spare links for forwards.** The newsletter puts a few more links at its foot, each with a value of its own, for the recipient to forward. A forwarded spare starts its own participant; nothing joins two participants on our side. The newsletter tool may derive a spare's value from the recipient's; the client never looks at the shape of a value. The in-app invites stay idle; the screen map no longer offers them.
- **Nothing to type or to show.** The "I have a code" link, the enter-code screen, the code section of the about page and the code sentence at the session end go. The code exists in the device's store and in the server's hash and nowhere a participant sees it.
- **The fallback.** A link without a value makes the device its own code, as before, silently. Such a participant continues in the same browser only.
- **Storage.** The device keeps the code as today, and a link's code it has not yet taken over under the setting `linkCode` until the server has met it or the old outbox has gone out. The link makes it recoverable; the device does not have to be durable for the participant to continue, only for the readable copies (ADR 0014), which stay where they were written.

## Consequences

- The promise changes from "nobody can attribute an answer to a person" to "no single party can": the newsletter tool holds which value went to which address, for the partner; our database holds the hashed value and the sealed answers, for the operator; attribution would take both and the pepper. The consent text, the privacy policy and the trust page say so in those words; `docs/participant-texts.md` carries the change for the legal review; the trust page's "what we never collect" keeps "no name, no email" and gains "the link in your email is yours: anyone who opens it continues your cards".
- A forwarded email forwards the recipient's own link too, not only the spares. The spares are the way offered; the texts say what the main link does.
- The newsletter's click tracking must keep the part after `#`; the architecture plan already asks for click tracking to be off for this link. A test send decides.
- The invites' routes and tables stay in the API, unused by the client.
- The 16-digit field, its autofill and the code's wording leave the app. The about page's "Your code" section goes with them; "delete everything I sent" stays and works on the code the device holds.

## Alternatives not taken

- A server-set cookie (Path B of the brief): keeps the promise whole and survives Safari's deletion of script storage, but continues one browser only and makes the trust page's "cookies: 0" a "1". Kept as the fallback design if the newsletter tool cannot carry a value.
- The value in the path or the query: logged by Netlify, visible in referrers. After `#` it is neither.
- The code shown as a link to send to oneself: not needed once the email carries the link.

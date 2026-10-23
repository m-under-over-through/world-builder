# 0002. Identity is a 16-digit anonymous code, stored as a keyed hash

Date: 2026-10-23. Status: accepted.

## Context

There are no accounts and no emails. A participant must be able to come back, on the same device or another, and the server must know as little as possible. The planning document said the code would be stored as a "salted hash, the way passwords are stored". That wording was wrong: a salted hash cannot be looked up by the secret alone, because you do not know which salt to use until you know which row you are looking at. The server has to find the participant from the code, so the hash must be deterministic.

## Decision

- The code is 16 random digits, generated on the device with rejection sampling so every digit is equally likely. That is about 53 bits of randomness. Displayed as four groups of four.
- The server stores `HMAC-SHA256(pepper, workshopSlug + ":" + code)`, where the pepper is a server secret kept in the Worker's secret store, never in the database. Lookup is by this value. The pepper makes a copied database useless for finding or forging codes.
- Requests with an unknown code are rate-limited hard so online guessing is not practical.
- The code is sent in the `Authorization: Code <digits>` header, never in a URL.

See `docs/learn/02-codes-hashes-and-peppers.md` for the reasoning in full, including the numbers.

## Consequences

- Typing a code on a new device continues the same participation with no server-side account.
- A database leak alone exposes no usable credential. A database plus pepper leak would allow a long brute force; even then, with answers sealed to another key, the attacker could only add or delete events under someone's code.
- Digits over words: nothing to spell, a numeric keypad on phones, language-neutral. Words would be more memorable; people will copy or write the code down either way.

## Alternatives not taken

- Words from a word list (more memorable, needs a list, spelling errors).
- A device secret plus a separate resume code (two secrets, more state, no real gain).
- Per-recipient links in the newsletter (the newsletter vendor would hold a link-to-email mapping).

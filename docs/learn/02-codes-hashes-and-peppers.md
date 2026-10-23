# Codes, hashes and peppers: how the server recognises a participant without being able to name one

## The idea

The server must answer one question on every request: which participant is this? The only thing the device sends is the 16-digit code. We do not want the database to contain the codes themselves, because a copied database would then let someone impersonate every participant.

The usual answer for passwords is a **salted hash**: pick a random salt per user, store `hash(salt + password)` next to the salt, and at login recompute it for that user's row. That works because at login you already know which user you are checking (they typed their username). Here there is no username. The code is the only thing we have, so the server has to compute something from the code and look that up directly. That means the computation must be the same every time: no per-row salt.

The planning document got this wrong ("salted hash, the way passwords are stored") and the decision record 0002 corrects it. Worth remembering as a pattern: salts protect _verification_; lookups need something else.

## The something else: a keyed hash with a pepper

The server computes `HMAC-SHA256(pepper, slug + ":" + code)` and stores that. HMAC is a hash that takes a key. The **pepper** is that key: a 32-byte secret that lives in the Worker's secret store, never in the database and never in the repository.

What this gives:

- Lookup works: the same code always produces the same value.
- A copied database is useless on its own. Without the pepper nobody can compute a value to look up, or check a guess.
- The workshop slug is mixed in, so the same code in two workshops gives two different values and a test can prove one workshop cannot see the other.

## The numbers

- 16 digits is 10^16 possibilities, about 2^53. "53 bits of randomness."
- Online guessing: the API rate-limits unknown codes. At, say, 10 attempts a minute, finding one real code among 150 would take millions of years. The rate limit is the real defence online, which is why `AUTH_CODE_UNKNOWN` is limited hard.
- Offline guessing with the database _and_ the pepper: HMAC-SHA256 is fast, a GPU does billions a second, so 2^53 is days of work for a serious attacker. That attacker would already have breached both the database and the Worker's secrets. Even then, with answers sealed to another key, the prize is the ability to add or delete events under someone's code. That is the honest risk and the plan accepts it.
- Why not make the code longer? 20 digits would be 66 bits but a chore to type. 16 is the trade-off, same as Mullvad.

## Rejection sampling, or why `byte % 10` is wrong

The device makes the code from random bytes. A byte is 0..255. If you took `byte % 10`, the digits 0..5 would come up 26 times in 256 and the digits 6..9 only 25 times: a small bias, but a bias, and biases are how guessing gets cheaper. The generator throws away any byte of 250 or more and uses the rest, so every digit has exactly 25 chances in 250. `packages/contracts/src/code.ts` has the loop; `packages/contracts/test/code.test.ts` feeds it scripted bytes and checks the exact output.

## The procedure in this repository

- Generation: `generateCode()` in `@wb/contracts`, on the device, from `crypto.getRandomValues`.
- Transport: `Authorization: Code 1234567890123456`. A header, never a URL, because URLs are logged, cached and screenshotted.
- Storage: the API (to be built) computes the HMAC with the pepper and stores it in `participants.code_hash`. The pepper is set once per deployment as a Worker secret and backed up in the vault like a key.
- Continuing on a new device: `GET /api/<slug>/me` with the typed code. Unknown code: `401 AUTH_CODE_UNKNOWN` and the welcome screen.

## Check it yourself

```
npm test -- packages/contracts
```

Read `code.test.ts`. One test shows the byte-to-digit mapping with hand-picked bytes, including the ones that must be rejected.

## What can go wrong

- **Pepper lost.** Every stored hash becomes unmatchable: every participant would appear new. Back the pepper up with the keys.
- **Pepper rotated carelessly.** Same effect. Rotation would need re-hashing, which needs the codes, which nobody has. So the pepper is set once per deployment and treated like the private key.
- **Code in a URL.** Would end up in CDN logs and browser history. The contracts put it in a header and the code review checks for it.

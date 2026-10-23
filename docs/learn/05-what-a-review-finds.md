# What an independent review finds: ten small lessons from the first one

On the day the contracts and the crypto package were written, a second agent reviewed them without seeing the author's reasoning, ran the tests, and tried inputs. It confirmed fourteen findings, none catastrophic, every one of them a lesson that shows up again and again in systems work. Here they are in the order they teach best.

## 1. Check-then-act is a gap; ask the kernel to do both at once

The key tool checked "does the file exist?" and then wrote. Between those two steps anything can happen, and `existsSync` also says "no" for a dangling symlink, so a planted link `.secrets/x.private-key -> somewhere/else` would pass the check and the key would be written _through_ the link to the other place. The fix is one flag: open the file with `wx`, which is the kernel's `O_CREAT | O_EXCL`: create it, and fail if anything is already there, symlink included. One operation, no gap. The pattern is called TOCTOU, time of check to time of use, and the cure is always the same: make the check and the act a single atomic operation.

## 2. "Relative to where I ran it" is not "relative to the project"

`.secrets/` was built from `process.cwd()`, the directory the command was run from. Run from anywhere else and the key lands outside the repository's `.gitignore`. Paths that matter are anchored to the file that knows where it is: `new URL('../../.secrets/', import.meta.url)`.

## 3. Unknown flags must be errors

`--Dev` was silently ignored, and a typo produced a production key. Any command that does something irreversible rejects what it does not understand.

## 4. Bound everything that rides on every record

The deck version was `\d+\.\d+` with no length limit. A million-digit version on each of 200 events in a sync batch is 200 megabytes of junk per request. Every string and array in a contract has a maximum. And a schema can only bound what has already been parsed: the API must cap the request body in bytes _before_ `JSON.parse`.

## 5. The contract should accept exactly what the code can produce and decode

The envelope schema accepted `v1.A`, which is not valid base64 and which the export tool would choke on months later. The fix makes the regex enforce whole base64 groups and sets a minimum length of 67, because the smallest sealed box is 48 bytes, which is 64 base64 characters plus the `v1.` prefix. A contract is not "looks roughly right"; it is "is decodable by the other side".

## 6. Text is bytes with rules, and the rules have defaults

Two findings about the same thing. `TextDecoder` drops a leading byte-order mark (U+FEFF) unless told `ignoreBOM: true`, so a pasted answer could lose its first character on the way back. And `TextEncoder` turns a lone surrogate (half of an emoji, left behind when text is cut at a character count) into U+FFFD, so the answer would silently change. The crypto package now keeps the mark and refuses broken text with `CRYPTO_BAD_TEXT`. The lesson for the UI: JavaScript string length counts UTF-16 units, not characters; truncate by code points.

## 7. Enforce limits at the boundary that cares

`sealAnswer` happily sealed 100,000 characters, producing an envelope the sync schema would then reject forever: an answer stuck in the outbox with no way out. Now `sealAnswer` enforces the 4,000-unit limit itself, so nothing unsendable can enter the outbox. Put the check where the consequence would be felt.

## 8. Know what your library does not check

On the X25519 curve a few public keys are degenerate: combine any private key with them and the shared secret is all zeros, the same for everyone. A forged envelope with the all-zero ephemeral key would therefore open under every private key. It cannot leak anything (anyone may seal anyway) but it breaks the promise "fails loudly if sealed to another key". libsodium refuses those keys; tweetnacl does not. One line checks for the all-zero shared secret before opening. A test forges exactly this envelope and expects refusal. When you compose a recipe from primitives, you inherit each primitive's gaps.

## 9. Strict beats lenient at a boundary you control both sides of

Zod objects drop unknown fields by default. That is friendly for public APIs, where old servers meet new clients. Here the client and the server deploy together from one repository. Strict schemas (`z.strictObject`) turn version skew into a visible `SYNC_PAYLOAD_INVALID` instead of silently dropped data, and they make "nothing undeclared reaches storage" a property of the contract rather than of the API author's discipline.

## 10. Canonical forms, or one thing becomes two

`z.uuid()` accepts uppercase and lowercase, and `3B24...` and `3b24...` would be stored as two events. Ids are now lowercase v4 only. In the same spirit, days now have to exist on the calendar (`2026-02-30` is out), and invite tokens are compared as strings, never decoded, because base64url's last character carries only two real bits and decoding would give each token sixteen spellings.

## What was fine, and how that was shown

The reviewer verified the sealed box against libsodium's recipe: nonce order, box argument order, the 16-byte tag in front of the ciphertext, the 48-byte minimum, deriving the public key from the private one. The BLAKE2b nonce was checked against Python's independent implementation on a fixed input, and that value is now a known-answer test in the suite. Rejection sampling was measured over 320,000 digits: every digit between 9.9 and 10.1 percent. Zod 4 integer bounds reject `2^53` and `1e300`. The key tool never prints the private key, and errors carry a path, not content.

What was not shown: the whole sealed box against real libsodium, because no libsodium exists on this machine. It is correct by construction and by the component checks above; a cross-check with PyNaCl is on the list for the decrypt drill.

## The habit

A review like this costs a few minutes of an agent's time and finds things the author cannot, because the author knows what the code is supposed to do. The development plan makes it a step for every change. Read the findings, not the summary: the findings are where the learning is.

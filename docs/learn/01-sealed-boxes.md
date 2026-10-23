# Sealed boxes: how an answer is encrypted on the device and opened only on your laptop

## The idea

Symmetric encryption uses one key: whoever can lock can unlock. That is useless here, because the phone would need the key and so would the server.

Public-key encryption uses a pair. The **public key** locks; it can be handed to everyone, printed in the repository, shown on the trust page. The **private key** unlocks; it exists only where you decide. Anyone can seal a message to the public key; only the private key opens it. The server holds sealed messages it cannot open, which is exactly the property we want.

If you have worked around Android's Private Compute Core, the shape is familiar: data is processed inside a boundary and only leaves it in a form the outside cannot read. Here the boundary is drawn differently. The trusted place is not a sandbox on the device; it is your laptop with the private key. Everything between the participant's thumb and your laptop (the browser's network stack, the CDN, the Worker, Postgres, the backup buckets) is "outside", and sees only sealed envelopes.

## What a sealed box actually is

A "sealed box" is libsodium's name for a well-studied recipe built on NaCl's `box`. `box` is authenticated public-key encryption between two known parties: it combines the sender's private key with the recipient's public key (X25519, Diffie-Hellman on an elliptic curve) into a shared secret, encrypts with XSalsa20, and attaches a 16-byte Poly1305 tag that makes any change detectable.

A sealed box removes the "known sender" part. For each message:

1. Make a fresh, throwaway key pair, the **ephemeral** pair, for this one message.
2. Derive the nonce from the two public keys: `BLAKE2b-24(ephemeral.publicKey || recipient.publicKey)`. A nonce must never repeat for the same key; since the ephemeral key is new every time, neither is the nonce, and nobody has to store it.
3. `box(message, nonce, recipient.publicKey, ephemeral.secretKey)`.
4. Output the ephemeral public key (32 bytes) followed by the box (16-byte tag plus the message). Wipe the ephemeral secret key.

The recipient reads the ephemeral public key off the front, recomputes the nonce, and runs `box.open` with their private key. The tag is checked before a single byte is trusted. Because the ephemeral key is fresh each time, sealing the same text twice gives two different envelopes; a test checks that.

"Sealed" means the sender is anonymous: nothing in the envelope says who sealed it. That is a feature here. The API does not need to know which device sealed what; the row's participant id carries that.

## The procedure in this repository

Code: `packages/crypto/src/index.ts`, about a hundred lines, most of them comments. The four steps above are four lines in `sealAnswer`, so you can read the recipe directly rather than trust a library's single function. The primitives come from two small audited libraries: `tweetnacl` for `box` and key pairs, `@noble/hashes` for BLAKE2b and SHA-256. The bytes produced are identical to libsodium's `crypto_box_seal`, so an envelope could be opened with libsodium in Python or Rust if that were ever needed.

- `generateKeyPair()` returns both keys as standard base64 strings (32 bytes each, 44 characters).
- `fingerprint(publicKey)` hashes the public key with SHA-256 and returns the first 8 bytes as `ab12-cd34-ef56-7890`. A reader can compare the fingerprint on the trust page with the one computed from the key in the repository.
- `sealAnswer(publicKey, text)` turns the text into UTF-8 bytes, runs the four steps, and returns `v1.` plus base64. The `v1.` prefix is there so that if the format ever changes, old and new envelopes are told apart by looking, not by guessing.
- `openAnswer(privateKey, envelope)` checks the prefix and the base64, derives the public key from the private key (so you never have to store both), recomputes the nonce, opens the box, and decodes UTF-8. On any failure it throws a `CryptoError` with a named code rather than returning garbage.

Where it runs: the client (`apps/web`, later) calls `sealAnswer` the moment the participant saves. The export tool (`tools/workshop`, later) calls `openAnswer` on your machine. The API never imports this package; look at its dependencies when it exists and you will not find `@wb/crypto`.

The key procedure, `tools/workshop/keygen.ts`:

1. `node tools/workshop/keygen.ts rural-manufacturing` generates the pair.
2. The private key is written to `.secrets/rural-manufacturing.private-key` with file mode 600 (only your user can read it). It is never printed, so it never lands in a terminal log or a chat transcript.
3. The public key and fingerprint are printed. You paste them into `workshops/rural-manufacturing/workshop.json`.
4. You put the private key in the vault under the workshop's name, print two paper copies into two sealed envelopes, then delete the file.
5. Once the first sealed answer exists, the decrypt drill: run the export against a backup and check the row count matches.

A development key already exists (`.secrets/dev-rural-manufacturing.private-key`, gitignored) so staging and tests work. The production key is yours to generate; that is deliberate.

## Check it yourself

```
npm test -- packages/crypto
```

Read `packages/crypto/test/seal.test.ts`. The tests are the claims above written down: round trip; the envelope is exactly 32 + 16 + message bytes; two seals of the same text differ; the wrong key fails; flipping one bit anywhere (ephemeral key, tag, message) fails; empty text, unicode and the 4,000-character maximum all work; fingerprints are stable.

To see it with your own eyes, in `node` at the repository root:

```
const c = await import('./packages/crypto/src/index.ts');
const kp = c.generateKeyPair();
const env = c.sealAnswer(kp.publicKey, 'hello');
env                                   // "v1.…" and nothing readable in it
c.openAnswer(kp.privateKey, env)      // "hello"
c.openAnswer(c.generateKeyPair().privateKey, env)  // throws CRYPTO_OPEN_FAILED
```

## What can go wrong

- **Lost private key.** Every answer for that workshop is unreadable forever. Hence vault plus two paper copies plus the drill.
- **Wrong public key in `workshop.json`.** Answers seal fine and open with nothing you hold. The fingerprint on the trust page and the contract test on the workshop folder exist to catch a mismatch; the decrypt drill before launch is the real check.
- **A changed envelope.** The tag check fails and `openAnswer` throws `CRYPTO_OPEN_FAILED`. Nothing half-decrypted ever comes out.
- **A malicious client deploy** that ships a different public key. Mitigations: deploy only from CI, public source, version in the footer. This is the honest limit of any web app.

## What it does not do

- It does not hide the plain text on the device before sealing. A compromised phone is a compromised phone.
- It does not hide metadata: which card, which day, how long the envelope is (the length of the message is visible as the length of the envelope). The trust page lists exactly these.
- It does not authenticate the sender. Anyone with the public key can seal something; the API's code check is what ties an event to a participant.

## A note on what happened while building this

The first version used `libsodium-wrappers`, the usual JavaScript binding to libsodium, whose `crypto_box_seal` does all four steps in one call. Its ES-module build in version 0.7.16 imports a file the package does not ship, so Node refused to load it. The fix was to compose the sealed box from NaCl's `box` as above. It is the same recipe; it is just written where you can read it. Decision record 0009 has the detail.

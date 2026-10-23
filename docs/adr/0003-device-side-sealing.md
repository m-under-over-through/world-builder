# 0003. Answers are sealed on the device to a per-workshop key

Date: 2026-10-23. Status: accepted (confirmed by the operator the same day).

## Context

The risk that would do the most reputational damage is "the research app leaked its answers". The partner expects a spreadsheet at the end and nothing in between. The operator runs the system alone.

## Decision

- Each workshop has an X25519 key pair. The public key is in `workshop.json` and its fingerprint on the trust page. The private key is in the operator's vault and on paper, never in the repository or on a server.
- The client seals every answer with libsodium's `crypto_box_seal` before it leaves the device. The envelope is the string `v1.` plus standard base64.
- The API stores envelopes as opaque bytes and never imports the crypto package.
- The export tool opens envelopes on the operator's machine with the private key, and only there.
- Custody: vault, two sealed paper copies in two places, an emergency contact set in the vault, a decrypt drill before launch and monthly. The partner never handles a key.

See `docs/learn/01-sealed-boxes.md` for how it works and the exact procedure.

## Consequences

- A stolen database, a stolen backup, a curious vendor: all see ciphertext.
- Losing the private key loses every answer on the server for that workshop. Custody is a launch gate.
- Reading answers mid-project means running the export. Counts are visible without the key.
- Removing this later is a one-line change; adding it later would leave early answers readable and later ones not. So it goes in from the first answer.
- What it does not protect: the plain text on the device before sealing; metadata (card id, day, length of the envelope); a malicious client deploy that swapped the public key. Mitigations for the last: deploy from CI only, public source, version shown in the app.

## Alternatives not taken

- Server-side encryption only (vendor disk encryption plus TLS). Simpler; anyone with database access can read.
- A second encryption to a participant-derived key so participants could reread on another device. Decided against: the experience is "what is written is written".

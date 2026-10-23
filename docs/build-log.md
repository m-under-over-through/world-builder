# Build log

What was done, when, why, how to verify it, what was decided on the way, and what is open. Newest entry at the bottom. Each entry links the learning notes that explain the ideas it introduces. Read this first when coming back to the project.

---

## 2026-10-23, Friday. Phase 0 set up while Marco was away

### Where things stood

Three planning documents existed and nothing else: the architecture and risk plan, the development plan with a schedule to the 16 November newsletter, and the services list. Eleven decisions had been taken that morning. Marco asked for the repository, the conventions, the glossary and the first contracts to be set up, with a detailed log and explainers so he can understand every component and know what is failing when something fails.

### What exists now

- A git repository on `main` with npm workspaces, TypeScript, Vitest, Prettier and a CI workflow. `npm run check` is the gate: typecheck, tests, formatting.
- `packages/contracts`: the shared vocabulary as Zod schemas. Days, UUIDs, slugs, the anonymous code, events, sessions, decks, workshop settings, API routes and request/response shapes, and every error code with its HTTP status and meaning. Tests for each rule.
- `packages/crypto`: sealing an answer to a workshop public key and opening it with the private key, composed from NaCl's box exactly as libsodium's sealed box. Nine tests, including bit-flip tampering.
- `tools/workshop/keygen.ts`: generates a workshop key pair, writes the private key to `.secrets/` with mode 600 and never prints it. A development key for `rural-manufacturing` was generated this way; its public key is in the workshop file.
- `workshops/rural-manufacturing/`: the first workshop folder. `workshop.json` with the decided settings (3 warm-ups, 1 checkpoint, 3 invites, cap 150, 16 Nov to 6 Dec, delete 5 Feb 2027), `deck.json` version 0.1 with the thirteen questions from the notebook sketch, `copy.md` with placeholder text for every screen. The contract tests read these two JSON files, so a bad edit fails `npm test`.
- Documents: `README.md` as the map, `CLAUDE.md` for agents, `docs/glossary.md`, `docs/screen-map.md`, nine decision records in `docs/adr/`, four learning notes in `docs/learn/`, `docs/runbook.md` with an entry for every error code, and this log.
- A test that fails if any error code lacks a runbook heading.

### Decisions made during implementation

Each of these has a decision record; the short version:

1. **npm workspaces, not pnpm** (ADR 0009). pnpm is not installed on this machine and npm is enough at this size. One less global tool.
2. **The code is 16 digits** (ADR 0002). The plan said "a short word code". Digits need no word list, no spelling, and get a numeric keypad. Mullvad's precedent.
3. **Keyed hash, not salted hash** (ADR 0002). A correction to the plan, which said the code would be stored "as a salted hash, the way passwords are stored". Passwords are verified after you know whose row to check; here the server has to find the row from the code alone, so the hash must be deterministic. The server will compute an HMAC with a secret pepper that lives outside the database. The learning note on codes explains why and gives the numbers.
4. **Client at `/<slug>/`, API at `/api/<slug>/`, one origin** (ADR 0008). Makes "this app talks to one host" true and checkable.
5. **Envelope format `v1.<base64>`** (ADR 0003). A visible version so the format can change later.
6. **No readable answer stays on the device** (ADR 0007). Follows from Marco's "what is written is written".
7. **tweetnacl plus noble-hashes instead of libsodium-wrappers** (ADR 0009). See the findings below.
8. **No TypeScript syntax with runtime meaning** (ADR 0009). No enums, no constructor parameter properties, so Node can run tools without a build step.

### Findings on the way (things that did not work the first time)

- **libsodium-wrappers 0.7.16 cannot be loaded as an ES module in Node.** Its `.mjs` entry imports `./libsodium.mjs`, a file the package does not contain. Rather than patch module loading differently in Node and in the browser, the sealed box is now composed in our own code from NaCl's `box` (tweetnacl) and BLAKE2b (noble-hashes), following libsodium's published recipe byte for byte. The four steps are four readable lines. Interoperability with libsodium is by construction and not yet tested against libsodium itself; add a cross-check with PyNaCl to the decrypt drill.
- **libsodium's type definitions do not include SHA-256** (it is in the larger "sumo" build). Moot after the switch; fingerprints use noble's SHA-256.
- **Node's type stripping refuses constructor parameter properties.** `constructor(public readonly code: ...)` is TypeScript syntax that implies an assignment; stripping cannot invent it. Node says `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. Fixed by declaring the field explicitly. Rule added to `CLAUDE.md` and ADR 0009.
- **TypeScript 5.9 and `crypto.subtle.digest`**: a `Uint8Array` from a library may be typed over a `SharedArrayBuffer` and is then not accepted as `BufferSource`. Moot after the switch to noble's synchronous `sha256`.

### How to verify by hand

```
npm install
npm run check
node tools/workshop/keygen.ts example --dev     # creates .secrets/dev-example.private-key; delete it after
```

Expected: typecheck silent, 37 tests passing across 6 files, formatting clean. Then, in `node` at the repository root, the snippet in `docs/learn/01-sealed-boxes.md` under "Check it yourself".

### Learning notes written today

- `docs/learn/01-sealed-boxes.md`: public-key encryption, what a sealed box is step by step, the key procedure, what it does not protect.
- `docs/learn/02-codes-hashes-and-peppers.md`: why the code is hashed, why salting cannot work for lookup, what a pepper is, the numbers, rejection sampling.
- `docs/learn/03-schemas-as-contracts.md`: Zod schemas as the vocabulary, validation at boundaries, the workshop folder test, reading a failure.
- `docs/learn/04-repo-anatomy-and-tooling.md`: workspaces, every config file, how tests and tools run, what to run when something fails.

### For Marco this afternoon

1. Read, in this order: `README.md`, `docs/learn/01` and `02`, ADR 0002 and 0003, then skim `packages/crypto/src/index.ts` with the learning note beside it. About forty minutes.
2. Run `npm run check` yourself and read one test file end to end.
3. Pick the neutral domain name and register it (five years, auto-renew, lock). Open the accounts in `docs/services.md`. Create the GitHub organization and the two repositories, then push this one.
4. Generate the production key for `rural-manufacturing` with `node tools/workshop/keygen.ts rural-manufacturing` (no `--dev`), paste the public key and fingerprint into `workshop.json`, store the private key in the vault, print two copies, delete the file. The development key stays for staging.
5. Set the pepper: 32 random bytes, stored as a Worker secret and in the vault, when the API exists next week.
6. Replace `[partner name]` in `workshop.json` and `copy.md`.

### Open questions

- Cross-check the sealed box against libsodium itself (PyNaCl or the Rust crate) before the decrypt drill. By construction it matches; it has not been proven here.
- Whether API request schemas should reject unknown fields (`strict()`) rather than strip them. An independent review of today's code is running; its findings go in the next entry.
- The `[partner name]` placeholder and the partner's confirmation of the cap.

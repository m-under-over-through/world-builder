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
- **Why that happened, investigated the same afternoon at Marco's request.** The library's git repository builds everything into one folder, `dist/modules-esm/`, where the core (`libsodium.mjs`) and the wrapper (`libsodium-wrappers.mjs`) sit side by side, so a relative import of `./libsodium.mjs` works there. On npm the same build is published as two separate packages, `libsodium` and `libsodium-wrappers`. The CommonJS entry had always imported the core by package name (`require("libsodium")`), which npm resolves across packages, so the split never mattered. The ES-module entry was new in 0.7.16, released on 29 December 2025 after sixteen months without a release, and it kept the relative sibling path, which breaks the moment the two files live in different packages. Users reported it the next day (upstream issues 355 and 357); the maintainer, who does not use the JavaScript build himself, asked for a pull request; a contributor fixed it within a day and the fix shipped in 0.8.0 on 6 January 2026. Version 0.8.4 imports `from "libsodium"` by name, ships its own types, and loads in Node. We hit the broken version because the dependency range `^0.7.15` can only ever resolve to the highest 0.7.x, which is 0.7.16. Lessons: a caret range on a 0.x version pins you to a minor line, so check what it actually resolves to; and "widely used" says nothing about a code path nobody used before, which is what the ESM entry was. The decision to stay on tweetnacl and noble-hashes stands (ADR 0009), and 0.8.4 makes a cross-check of our envelopes against real libsodium possible as a test.
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
3. Pick the subdomain name (no underscore) and add its CNAME at Netlify DNS. Open the accounts in `docs/services.md`. Create the two repositories under the UOT GitHub account, then push this one. (Revised later the same day: ADR 0010.)
4. Generate the production key for `rural-manufacturing` with `node tools/workshop/keygen.ts rural-manufacturing` (no `--dev`), paste the public key and fingerprint into `workshop.json`, store the private key in the vault, print two copies, delete the file. The development key stays for staging.
5. Set the pepper: 32 random bytes, stored as a Worker secret and in the vault, when the API exists next week.
6. Replace `[partner name]` in `workshop.json` and `copy.md`.

### Open questions

- Cross-check the sealed box against libsodium itself (PyNaCl or the Rust crate) before the decrypt drill. By construction it matches; it has not been proven here.
- Whether API request schemas should reject unknown fields (`strict()`) rather than strip them. An independent review of today's code is running; its findings go in the next entry.
- The `[partner name]` placeholder and the partner's confirmation of the cap.

---

## 2026-10-23, Friday, later. Independent review and fixes

### What happened

A second agent reviewed the contracts, the crypto package and the key tool without the author's reasoning, ran the tests, and tried hostile inputs. It reported fourteen findings, eight of them reproduced by running code, and a list of tests worth adding. All were applied in one commit. `docs/learn/05-what-a-review-finds.md` explains each one as a lesson; the short list:

| Finding                                                                                            | Fix                                                      | Test added                                              |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| Key tool: check-then-write gap, and a planted symlink could redirect the key                       | Exclusive create (`flag: 'wx'`), no pre-check            | keygen refuses an existing file and leaves it untouched |
| Key tool: `.secrets/` relative to the current directory, not the repository                        | Anchored on the tool's own location; `--out` for tests   | keygen tests write to a temp dir                        |
| Key tool: unknown flags ignored, so `--Dev` made a production key                                  | Unknown arguments exit 2; slug validated by the contract | unknown flag or bad slug writes nothing                 |
| Key tool: an existing `.secrets/` kept wider permissions                                           | `chmod 700` after `mkdir`                                | directory mode is 700                                   |
| Deck version unbounded on every event                                                              | At most 4 digits each side                               | over-long version rejected                              |
| Envelope schema accepted strings the crypto package cannot decode                                  | Whole base64 groups, minimum 67 characters               | `v1.A`, `v1.AAAAA`, 63 and 65 characters rejected       |
| Leading byte-order mark dropped on open                                                            | `ignoreBOM: true`                                        | round trip keeps it                                     |
| Lone surrogates silently became U+FFFD; over-long text sealed then stuck in the outbox             | `sealAnswer` refuses both with `CRYPTO_BAD_TEXT`         | half an emoji and 4,001 characters refused              |
| A degenerate ephemeral key opened under any private key (libsodium refuses it, tweetnacl does not) | All-zero shared secret refused before opening            | a forged zero-key envelope is refused                   |
| Request schemas stripped unknown fields                                                            | `strictObject` for events, sessions, join and sync       | extra fields rejected                                   |
| UUIDs accepted in any case and any version                                                         | Lowercase v4 only                                        | uppercase and nil rejected                              |
| Days accepted that do not exist                                                                    | `z.iso.date()`                                           | `2026-02-30` rejected, `2028-02-29` accepted            |
| Code generator could spin forever on a broken random source                                        | Throws on an empty result                                | empty and short sources tested                          |
| Health endpoint published per-workshop participant counts                                          | Slug and status only; counts move to the status command  | schema changed                                          |

Also recorded as comments in the contracts: join shares the rate limit of the authenticated routes; invite tokens are compared as strings; the API must cap request bodies in bytes before parsing JSON; the UI must truncate answers by code points.

### What the review confirmed as correct

The sealed-box construction matches libsodium's recipe step by step. The nonce derivation was checked against Python's BLAKE2b on a fixed input, and that value is now a known-answer test. Rejection sampling is unbiased, measured. Base64 and UTF-8 handling cannot crash or hang. The key tool never prints the private key.

### Still open

- None from the review. The libsodium cross-check that was open here was added later the same day; see the next entry.

### How to verify by hand

```
npm run check
```

Expected: 57 tests passing across 7 files, including the key tool's own tests, which spawn it against a temporary directory.

---

## 2026-10-23, Friday, afternoon. Cross-check against libsodium

### What happened

Marco asked why libsodium-wrappers 0.7.16 had failed to load. The investigation (recorded in the first entry under findings) showed the fix had shipped in 0.8.0 and that 0.8.4 loads cleanly in Node. He approved adding 0.8.4 as a development-only dependency of `@wb/crypto` so our envelopes can be checked against the reference implementation.

### What exists now

`packages/crypto/test/libsodium-interop.test.ts`, six tests:

- libsodium opens what we seal; we open what libsodium seals.
- A key pair made by libsodium works with our functions in both directions, which proves the key format is the same raw 32 bytes.
- Our BLAKE2b-24 nonce equals libsodium's `crypto_generichash(24, ...)` over the same input.
- Both sides refuse the forged envelope with an all-zero ephemeral key.
- The sealed layout is the same size: 32 + 16 + message.

The app and the export tool never load libsodium; it is in `devDependencies` only. One finding on the way: libsodium's `crypto_generichash` takes the key as an explicit argument, `null` for unkeyed, which the type definitions enforce.

### How to verify by hand

```
npm run check
```

Expected: 63 tests passing across 8 files.

---

## 2026-10-23, Friday, late afternoon. Hostname and accounts decided

Marco read the documents, ran the check, and asked whether a subdomain of under-over-through.co and his existing UOT GitHub account would do instead of a new domain and a new organization. Checked: the domain's DNS is at Netlify, mail is Google Workspace, the main site sets no cookies and loads no third-party scripts. Decided: yes to both, recorded as ADR 0010. The exact subdomain name is still to come; it must not contain an underscore, because certificate authorities refuse such names. Changes: the services list is rewritten (draft 0.2); the API moves from "Workers" to "Pages Functions" in the architecture plan, decision records and README, which is the same runtime on the same hostname as the client; the runbook gains entries for the domain and for Netlify DNS with the registrar and expiry fields to fill. No code changed.

---

## 2026-10-24, Saturday. The hostname is worldbuilder

Marco chose `worldbuilder`, so the app lives at `worldbuilder.under-over-through.co` and the first workshop at `/rural-manufacturing/` under it. He also asked whether one subdomain with an argument in the URL could serve several workshops. It can and already does: the workshop is the first path segment, which is better than a query parameter for install scope, storage, the API prefix and readability; the architecture plan, section 5.1, now shows the full URLs and the reasons. Placeholders replaced in the services list, ADR 0010, the runbook entry and the workshop copy file. No code changed.

---

## 2026-10-24, Saturday morning. Repositories created and pushed

Step 1 of Marco's list. Pre-push safety pass: no secret-looking file tracked, the development private key never appears anywhere in history. Then:

- `https://github.com/m-under-over-through/world-builder`, public, the app. Seven commits pushed; `origin` set. The CI workflow ran on GitHub's runner on the first push and passed in 19 seconds: install, typecheck, 63 tests, formatting.
- `https://github.com/m-under-over-through/world-builder-ops`, private, with a README that says what belongs there and why it is separate.

Not yet done, deliberately: branch protection on `main` (require a pull request and a passing CI run), which the development plan calls for from Phase 1 onwards. It is one setting; it means every change from then on, including the integrator's, arrives as a pull request Marco reads. Marco decided to turn it on after the walking skeleton lands, on Friday 30 October; the development plan carries the reminder.

Later the same morning: the nine commits carried Marco's business email from this machine's global git configuration. Nothing in the project needs it, and on a public repository anyone can read it, so the history of both repositories was rewritten to the account's GitHub noreply address (dates and content unchanged) and force-pushed, which is safe while nobody else has cloned. This repository's local git configuration now uses the noreply address; the global configuration is untouched. Marco turns on "keep my email private" and "block command line pushes that expose my email" on GitHub, so a future slip would be refused at push. Rule of thumb recorded: rewriting history is cheap on day one and disruptive once branches and pull requests exist.

In progress on Marco's side: the vault and the recovery codes (step 2). Next: the production key (step 3).

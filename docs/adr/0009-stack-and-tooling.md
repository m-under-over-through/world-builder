# 0009. TypeScript throughout, npm workspaces, Zod contracts, Vitest, no build step for tools

Date: 2026-10-23. Status: accepted.

## Context

One language across client, API and tools keeps the system legible to one operator. The machine has Node 24 and npm; pnpm is not installed and installing global tools is one more thing to maintain.

## Decision

- TypeScript, strict, ES modules, everywhere.
- npm workspaces: `packages/*` and `apps/*`. One lock file. `npm run check` is the gate.
- Contracts are Zod schemas in `@wb/contracts`; types are derived from them. Zod 4.
- Tests with Vitest, one config at the root.
- Tools under `tools/` run directly with `node file.ts` using Node's built-in type stripping; relative imports carry the `.ts` extension so this works without a build step. For the same reason the code avoids TypeScript syntax that only a compiler can turn into JavaScript: no enums (`as const` arrays instead) and no constructor parameter properties (fields are declared and assigned explicitly). Node's stripper refuses both; the first run of the keygen tool found the second.
- Prettier for formatting. No linter yet; add one when there is enough code for it to earn its place.
- Cryptography: `tweetnacl` (NaCl's box, audited, pure JavaScript, the same API in Node and browsers) plus `@noble/hashes` (BLAKE2b for the sealed-box nonce, SHA-256 for fingerprints). The first choice was `libsodium-wrappers`; its ES-module entry in 0.7.16 imports a file the package does not ship, so Node cannot load it, and working around that would have meant different loading code in Node and in the browser. The sealed box is composed in our own code from NaCl's box exactly as libsodium documents it, which keeps the envelopes compatible with libsodium and makes every step readable.
- Planned, not yet in use: Hono on Cloudflare Workers for the API, Drizzle for the database, Vite with vite-plugin-pwa and Dexie for the client.

## Consequences

- No global installs, no build step before a test can run.
- Node 24 is a hard requirement (`.nvmrc`, `engines`).

## Alternatives not taken

- pnpm (faster, stricter; not installed; npm is enough at this size).
- A separate repository per package (more ceremony than this needs).

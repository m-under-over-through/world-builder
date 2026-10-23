# The repository, file by file: what each config does and what to run when something fails

## Workspaces

`package.json` at the root declares `"workspaces": ["packages/*", "apps/*"]`. That tells npm that `packages/contracts` and `packages/crypto` are packages of their own, with their own `package.json`, and that one `npm install` at the root installs everything and links them together. `@wb/crypto` lists `@wb/contracts` as a dependency with version `*`, and npm resolves that to the folder next door rather than the registry. One lock file, `package-lock.json`, pins every version.

## The config files

| File                       | Does                                                                                                                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tsconfig.json`            | How TypeScript checks the code: strict mode on; ES modules; `allowImportingTsExtensions` so imports can say `./code.ts`; `noEmit` because nothing is compiled, only checked. `npm run typecheck` runs it over every package, test and tool. |
| `vitest.config.ts`         | Where tests live: `packages/*/test/**/*.test.ts`. `npm test` runs them all.                                                                                                                                                                 |
| `.prettierrc`              | Formatting rules. `npm run format` applies them; `format:check` only complains.                                                                                                                                                             |
| `.editorconfig`            | The same basics for any editor: spaces, two of them, newline at end.                                                                                                                                                                        |
| `.nvmrc` and `engines`     | Node 24. Tools run TypeScript directly, which needs 24.                                                                                                                                                                                     |
| `.gitignore`               | `node_modules`, `.secrets`, `.env`. Keys and installed packages never enter git.                                                                                                                                                            |
| `.github/workflows/ci.yml` | On every push and pull request, GitHub runs install, typecheck, tests, formatting. The same `npm run check` you run locally.                                                                                                                |
| `CLAUDE.md`                | Instructions for agents. Rules, ownership, what every change ships with.                                                                                                                                                                    |

## How a test runs

`npm test` starts Vitest, which reads `vitest.config.ts`, finds the test files, and for each `import` compiles the TypeScript on the fly. A test file imports from `../src/index.ts` (its own package) or from `@wb/contracts` (another package; npm's link makes that resolve). `describe` groups, `it` states one behaviour, `expect` checks it. A failing test prints the file, the behaviour's name, and what differed.

## How a tool runs

`node tools/workshop/keygen.ts rural-manufacturing --dev` runs TypeScript with no build. Node 24 strips the type annotations and runs the rest. Two things make that work: imports use real relative paths with `.ts` extensions, and the code uses no TypeScript syntax that has a runtime effect, such as enums or constructor parameter properties (`constructor(public readonly x: string)`). Stripping removes types; it cannot invent the assignments those features imply. Node says so plainly: `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`.

## When something fails

| Symptom              | First thing to run                  | What it tells you                                                                   |
| -------------------- | ----------------------------------- | ----------------------------------------------------------------------------------- |
| "Cannot find module" | `npm install`                       | A dependency or a workspace link is missing.                                        |
| Type errors          | `npm run typecheck`                 | Which file and line; the message names the mismatch.                                |
| A red test           | `npm test -- <path>`                | The behaviour that broke, with expected versus actual.                              |
| CI red, local green  | the CI log for the step that failed | Usually a file not committed, or formatting. `npm run check` locally reproduces CI. |
| Formatting failure   | `npm run format` then commit        | Prettier rewrites; nothing to decide.                                               |

## The two repositories

This public repository holds the app, the contracts and the content. A private ops repository (to be created) holds the backup workflow and the runbook pages that name vendor specifics. The split exists so that a misconfigured job in the public repository can never print a connection string into a public log.

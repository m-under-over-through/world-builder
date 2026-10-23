# Schemas as contracts: one description of each thing, checked on both sides

## The idea

Two programs that talk to each other, written by different people or agents, drift unless the shape of what they exchange is written down in one place and enforced in both. In this repository that place is `packages/contracts`, and the enforcement is Zod.

A Zod schema is a value that describes a shape (`z.object({ id: z.uuid(), seq: z.number().int().min(0) })`) and can do two things with it: produce the TypeScript type (`z.infer<typeof schema>`), and check real data at run time (`schema.safeParse(input)`). The first keeps the code honest while you write it; the second keeps the system honest when a phone, a file or a request sends something unexpected.

The rule is "parse, don't validate": at every boundary, run the schema and use the parsed value; never pass raw input further in. Boundaries here are: device to API (requests), API to device (responses), repository to deploy (`workshop.json`, `deck.json`), and database to export.

## What is in the contracts package

- `primitives.ts`: a day (`YYYY-MM-DD`), a UUID, a slug-like name, a deck version.
- `code.ts`: the anonymous code, its generation, normalisation and display.
- `events.ts`: the five event kinds, the sealed envelope format, the rule that only `answered` carries a body.
- `session.ts`: a session with its seed.
- `deck.ts`: cards and decks, with "unique ids" and "one of each set" as rules.
- `workshop.ts`: the workshop settings file, with date ordering as a rule.
- `api.ts`: routes, the authentication scheme, every error code with its HTTP status and meaning, and the request and response shapes.

Rules that involve more than one field (`answered` needs a body; `closesDay` after `opensDay`) are written with `superRefine`, which lets a schema add its own issues. Read one; they are plain.

## The trick worth noticing: the workshop folder is tested

`packages/contracts/test/deck-and-workshop.test.ts` reads the real `workshops/rural-manufacturing/deck.json` and `workshop.json` and runs them through the schemas. If someone adds a card with a duplicate id, misspells a date, or pastes a public key with a missing character, `npm test` fails before anything is deployed. The contract is not just for code; it guards the content too.

## Reading a failure

A failed parse returns `{ success: false, error }` where `error.issues` is a list. Each issue has a `path` (which field) and a `message`. The tests print the issues list when it is not empty, so a failing content test reads like:

```
expected [] to equal [{ path: ['cards', 3, 'id'], message: 'lowercase letters, digits and single hyphens only' }]
```

That is the field, the position in the array, and what rule it broke.

## Check it yourself

```
npm test -- packages/contracts
```

Or in `node` at the root:

```
const c = await import('./packages/contracts/src/index.ts');
c.eventSchema.safeParse({ kind: 'answered' }).error.issues
```

## What can go wrong

- **A schema changed without the other side.** The contract tests catch shape changes inside this repository; the API's contract tests (to come) will catch them across the wire.
- **Validation skipped at a boundary.** The code review checks that every handler parses its input with the schema from this package, and nothing else.

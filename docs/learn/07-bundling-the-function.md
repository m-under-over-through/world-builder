# 07. Bundling the function

The idea, why it is here, the procedure in this repository, how to check it yourself, what can go wrong, and what it does not do. Written on 28 October 2026, the day the first staging deploy failed because of it.

## The idea

A TypeScript file says what it needs with `import`. Two kinds of imports exist. A relative one, `./schema.ts`, names a file next to it. A bare one, `hono` or `@wb/contracts`, names a package, and Node finds it by walking up the folders looking for `node_modules/<name>`, then reading that package's `package.json` to learn which file is its entry.

On a laptop every package is there because `npm install` put it there. Our own packages are there too, but as links: `node_modules/@wb/contracts` is a symbolic link to `packages/contracts`, which is how npm workspaces work (learning note 04). A link is not a copy. Follow it and you land in our source folder, which holds TypeScript, not JavaScript.

A deployed function is different. Netlify zips a folder, uploads it to a server that runs AWS Lambda, and that server runs it as it is. There is no `npm install` there and no repository. Whatever the function imports has to be inside the zip, already resolvable, already JavaScript.

Netlify's packager tries to make that so. It turns a TypeScript function into JavaScript, then looks at every bare import, finds the package in `node_modules`, and copies it into the zip. That works for `hono`. For a link to a folder of TypeScript it copied the manifest and not the source, so at the first request Node reported:

```
Cannot find module '/var/task/node_modules/@wb/contracts/src/index.ts' imported from /var/task/netlify/functions/api.mjs
```

Read it as Node means it. The second path is the file that did the importing: the function file Netlify built. The first is where Node went looking, after reading the manifest it did find. The file was not there.

**Bundling** is the alternative. A bundler starts at the entry file, follows every import, relative and bare, and writes everything it reached into one JavaScript file, in dependency order, with the imports resolved away. Only Node's own modules, `node:crypto` and the like, stay as imports, because they are part of Node. The result does not need `node_modules` at all. The bundler we use is esbuild, which is also the one inside Netlify's packager; the difference is that we run it ourselves, on the whole graph, and check the result.

## Why it is here

Three reasons, beyond making the deploy work.

- **One file is legible.** What runs in deployment is `netlify/functions-build/api.mjs`, a file you can open. There is no second layer of packaging to reason about when something fails.
- **The build fails instead of the request.** The bundling tool refuses to finish if any import other than a Node module would be left outside the file. A dependency that cannot be inlined stops the deploy, with its name, rather than the function failing at its first call.
- **The version is in the file.** The build writes the deploy's commit into the bundle, so `/api/health` reports exactly which commit is running. Before, it read the environment at runtime and could only say what the environment said.

## The procedure in this repository

- `netlify/functions/api.mts` is the source of the function. It stays readable and is what you edit.
- `tools/ops/bundle-api.ts` makes the artefact. It is the third step of the build command in `netlify.toml`, after migrate and sync, before the client build. Options: `--out <dir>` and `--commit <ref>`; the build uses Netlify's `COMMIT_REF`.
- `netlify.toml` names `netlify/functions-build` as the functions directory, so Netlify packages our file and finds nothing in it to trace. The folder is ignored by git.
- `packages/db` has two entries. `@wb/db`, the root, exports the schema, the queries and `connectNeon`, which is all the function needs. `@wb/db/connect` exports `connect`, the dispatcher that also knows PGlite, and the migrator. Tools, tests and the local server use the second; the function uses the first. The split exists because a bundler follows every import it can see, and a dynamic `import('@electric-sql/pglite')` inside the function's graph would have pulled a whole Postgres compiled to WebAssembly into the artefact.
- Two tests in `apps/api/test/bundle.test.ts` hold this in place. The first walks the static import graph from the function entry and asserts it reaches the app, the contracts and the Neon connector, and never PGlite, the tools-only connector, or `@wb/crypto`. The second builds the real bundle into a temporary folder, asserts the text carries no PGlite and no crypto package, then runs it in a plain Node process, no test runner, with a database host that cannot exist, and expects health to answer 503 with `ok: false`, `dbReachable: false` and the baked-in version.

## How to check it yourself

```
node tools/ops/bundle-api.ts --commit $(git rev-parse HEAD)
grep -c "^import" netlify/functions-build/api.mjs
head -40 netlify/functions-build/api.mjs
```

The count is zero today: everything the function uses is web-standard (fetch, Request, Web Crypto), so not even a Node module is imported, and the file is self-contained from its first line. If a Node module ever appears, it is fine; anything else is not, and the tool would have refused to write the file.

Then run it the way Lambda would, with a database that does not exist:

```
cat > /tmp/run.mjs <<'JS'
const mod = await import(process.argv[2]);
const res = await mod.default(new Request('http://localhost/api/health'));
console.log(res.status, await res.text());
JS
DATABASE_URL=postgres://wb:nobody@db.invalid/neondb WB_PEPPER=ZGV2ZWxvcG1lbnQtcGVwcGVyLW5vdC1mb3ItcHJvZCE= node /tmp/run.mjs $PWD/netlify/functions-build/api.mjs
```

Expected: `503` and a JSON body with `"ok":false`, `"dbReachable":false` and the version you passed. On Netlify, the deploy log has a line `bundle-api: wrote ... (NNN KB, version abc1234)` and the live `/api/health` reports that version.

And once more with no secrets at all, which is what a deploy context looks like before its variables are set:

```
env -u DATABASE_URL -u WB_PEPPER node /tmp/run.mjs $PWD/netlify/functions-build/api.mjs
```

Expected: one log line, `SERVER_NOT_CONFIGURED DATABASE_URL is not set for this deploy context`, then `503` and `{"error":"SERVER_NOT_CONFIGURED", ...}`. The function answers that itself, before the app exists, so the answer never needs the database; the runbook has the entry.

## What can go wrong

- **A dependency that cannot be inlined.** Packages with native code, or that read files next to themselves at runtime, break when bundled. The tool fails the build with the import's name. The fix is to keep such a package out of the function's graph; the staging deploy shows the problem before production does.
- **Something heavy sneaks in.** The log line prints the size. The skeleton's bundle is about 1.2 MB unminified: the Neon driver, Zod (a third of it translations of its error messages), Drizzle's Postgres dialect, Hono, and our code. A jump to several megabytes means a new import pulled in more than intended. Run `npx esbuild --bundle --platform=node --format=esm --analyze netlify/functions/api.mts --outfile=/dev/null` for a breakdown by package.
- **A deploy context without its secrets.** The function does not throw; it answers every path with 503 `SERVER_NOT_CONFIGURED` and logs which variable is missing, never a value. Production looks like this until hardening week, and so does a deploy preview of a pull request from a fork. Set the variable for that context and trigger a deploy.
- **The graph test and reality differ.** The test reads source text, not the bundler's view. It is a guard for the wrong import landing in the wrong file, and the bundle test is the one that proves what the artefact holds. Keep both.

## What it does not do

It does not minify. Bytes do not matter at this size and a readable artefact does. It does not touch the client, which Vite builds separately. It does not change local development: `node apps/api/dev.ts` runs the TypeScript directly, with PGlite, through `@wb/db/connect`.

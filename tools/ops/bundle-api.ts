// Bundle the API function into one plain JavaScript file for Netlify (ADR 0011, amended 28 October).
//
//   node tools/ops/bundle-api.ts [--out <dir>] [--commit <ref>]
//
// Netlify's packager transpiles a TypeScript function but leaves npm packages outside the file and
// copies them by tracing imports. Our workspace packages (@wb/contracts, @wb/db, ...) are links to
// TypeScript source, and that trace carried their manifests but not their files, so the function
// failed at start with "Cannot find module". So the build makes the artefact itself: everything
// the function needs, in one file, with no imports except Node's own modules. What runs in
// deployment is that file, and you can open it (docs/learn/07-bundling-the-function.md).
//
// Runs as the third step of the Netlify build, after migrate and sync. Writes
// netlify/functions-build/api.mjs, the functions directory named in netlify.toml.

import { build } from 'esbuild';
import { mkdirSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const ENTRY = join(root, 'netlify/functions/api.mts');
export const DEFAULT_OUT_DIR = join(root, 'netlify/functions-build');

function isNodeBuiltin(specifier: string): boolean {
  return specifier.startsWith('node:') || builtinModules.includes(specifier);
}

/**
 * Bundles the function entry into `<outDir>/api.mjs` and returns that path. Refuses to leave any
 * import behind other than Node's own modules: a package that could not be inlined fails the
 * build here, loudly, instead of the function failing at its first request.
 */
export async function bundleApi(options: { outDir: string; commitRef: string }): Promise<string> {
  mkdirSync(options.outDir, { recursive: true });
  const outfile = join(options.outDir, 'api.mjs');
  const result = await build({
    entryPoints: [ENTRY],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    // The deploy's commit, baked in: the function reports its first seven characters as `version`
    // in /api/health, so the running code and the repository can be matched.
    define: { 'process.env.COMMIT_REF': JSON.stringify(options.commitRef) },
    metafile: true,
    logLevel: 'warning',
    legalComments: 'none',
  });
  const leftOutside = new Set<string>();
  for (const output of Object.values(result.metafile.outputs)) {
    for (const imported of output.imports) {
      if (imported.external && !isNodeBuiltin(imported.path)) leftOutside.add(imported.path);
    }
  }
  if (leftOutside.size > 0) {
    throw new Error(
      `bundle-api: these imports were left outside the bundle and would be missing at runtime: ${[...leftOutside].join(', ')}`,
    );
  }
  return outfile;
}

const USAGE = 'usage: node tools/ops/bundle-api.ts [--out <dir>] [--commit <ref>]';
function fail(message: string, code: number): never {
  console.error(message);
  process.exit(code);
}

const runAsCommand =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (runAsCommand) {
  const args = process.argv.slice(2);
  let outDir = DEFAULT_OUT_DIR;
  let commitRef = process.env.COMMIT_REF ?? 'unknown';
  while (args.length > 0) {
    const flag = args.shift();
    if (flag === '--out' && args.length > 0) outDir = resolve(args.shift()!);
    else if (flag === '--commit' && args.length > 0) commitRef = args.shift()!;
    else fail(`unknown argument "${flag}"\n${USAGE}`, 2);
  }
  const file = await bundleApi({ outDir, commitRef });
  const kb = Math.round(statSync(file).size / 1024);
  console.log(`bundle-api: wrote ${file} (${kb} KB, version ${commitRef.slice(0, 7)})`);
}

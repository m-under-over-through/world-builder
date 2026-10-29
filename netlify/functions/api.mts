// The API as a Netlify Function (ADR 0011). One function answers every /api/* path by handing the
// web-standard Request to the Hono app. The database connection and the app are created once per
// function instance and reused across requests.
//
// This is the source. What Netlify runs is netlify/functions-build/api.mjs, one plain JavaScript
// file made from this entry by tools/ops/bundle-api.ts during the build
// (docs/learn/07-bundling-the-function.md).
import { createApp, type App } from '../../apps/api/src/app.ts';
import { validatePepper } from '../../apps/api/src/auth.ts';
import { ERROR_CODES } from '../../packages/contracts/src/index.ts';
import { connectNeon, type Db } from '../../packages/db/src/index.ts';

let appPromise: Promise<App | undefined> | undefined;

/**
 * The app, or undefined when this deploy context cannot run one: no DATABASE_URL, no WB_PEPPER,
 * or a pepper that is not 32 bytes (the Production context before hardening week; a deploy
 * preview of a pull request from a fork, which Netlify keeps secret variables away from). The
 * reason is logged once per function instance, naming the variable and never its value, and every
 * request then answers 503 SERVER_NOT_CONFIGURED (docs/runbook.md) instead of Netlify's own 502
 * for an exception. The answer is kept for the instance's life: variables change only with a
 * deploy, and a deploy makes new instances.
 */
function getApp(): Promise<App | undefined> {
  if (!appPromise) appPromise = configure();
  return appPromise;
}

async function configure(): Promise<App | undefined> {
  let db: Db;
  let pepper: string;
  try {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is not set for this deploy context');
    db = connectNeon(databaseUrl);
    pepper = validatePepper(process.env.WB_PEPPER);
  } catch (error) {
    console.error(
      `SERVER_NOT_CONFIGURED ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
  return createApp({ db, pepper, version: process.env.COMMIT_REF?.slice(0, 7) ?? 'unknown' });
}

function notConfigured(): Response {
  const { status, meaning } = ERROR_CODES.SERVER_NOT_CONFIGURED;
  return Response.json({ error: 'SERVER_NOT_CONFIGURED', message: meaning }, { status });
}

export default async (request: Request): Promise<Response> => {
  const app = await getApp();
  return app ? app.fetch(request) : notConfigured();
};

export const config = { path: '/api/*' };

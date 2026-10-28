// The API as a Netlify Function (ADR 0011). One function answers every /api/* path by handing the
// web-standard Request to the Hono app. The database connection and the app are created once per
// function instance and reused across requests.
//
// This is the source. What Netlify runs is netlify/functions-build/api.mjs, one plain JavaScript
// file made from this entry by tools/ops/bundle-api.ts during the build
// (docs/learn/07-bundling-the-function.md).
import { createApp, type App } from '../../apps/api/src/app.ts';
import { validatePepper } from '../../apps/api/src/auth.ts';
import { connectNeon } from '../../packages/db/src/index.ts';

let appPromise: Promise<App> | undefined;

async function getApp(): Promise<App> {
  if (!appPromise) {
    appPromise = (async () => {
      const databaseUrl = process.env.DATABASE_URL;
      if (!databaseUrl) throw new Error('DATABASE_URL is not set for this deploy context');
      const db = connectNeon(databaseUrl);
      return createApp({
        db,
        pepper: validatePepper(process.env.WB_PEPPER),
        version: process.env.COMMIT_REF?.slice(0, 7) ?? 'unknown',
      });
    })();
  }
  return appPromise;
}

export default async (request: Request): Promise<Response> => (await getApp()).fetch(request);

export const config = { path: '/api/*' };

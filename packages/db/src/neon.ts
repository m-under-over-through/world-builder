import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema.ts';
import type { Db } from './types.ts';

/**
 * Neon over HTTP: one request per query and no connection to keep open, which suits a function
 * that lives for one request (ADR 0011). This is the only connector the deployed function carries.
 * The dispatcher that also knows PGlite is connect.ts, imported as `@wb/db/connect` by tools and
 * tests, and never by the function (apps/api/test/bundle.test.ts proves it).
 */
export function connectNeon(databaseUrl: string): Db {
  if (!databaseUrl.startsWith('postgres://') && !databaseUrl.startsWith('postgresql://')) {
    throw new Error('DATABASE_URL must start with postgres:// for Neon');
  }
  return drizzle(neon(databaseUrl), { schema }) as unknown as Db;
}

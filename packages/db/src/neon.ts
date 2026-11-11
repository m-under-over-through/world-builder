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
  assertNeonUrl(databaseUrl);
  return drizzle(neon(databaseUrl), { schema }) as unknown as Db;
}

/**
 * What a refused connection string is told. It names the variable and never the value: the value
 * carries the database password.
 */
export const NEON_URL_REFUSED =
  'DATABASE_URL must be a postgres:// URL with a user, a host and a database (the value is not shown)';

/**
 * Refuses a connection string Neon's driver would refuse, before the driver sees it.
 *
 * Why: neon() does not check the string when it is called; it checks on the first query, and when
 * the string does not parse as a URL its error quotes the whole string, password included
 * (`... is not a valid URL (connection string: postgresql://user:password@host/db)`, driver
 * 1.2.0). That message would reach the function's log through the server-error line, and the
 * build log through the migrate step. This is the same parse the driver does, done here, with a
 * message that carries nothing of the value (security pass of 11 November 2026, docs/build-log.md).
 */
export function assertNeonUrl(databaseUrl: string): void {
  if (!isNeonUrl(databaseUrl)) throw new Error(NEON_URL_REFUSED);
}

function isNeonUrl(url: string): boolean {
  if (!url.startsWith('postgres://') && !url.startsWith('postgresql://')) return false;
  try {
    const protocol = new URL(url).protocol;
    const { username, hostname, pathname } = new URL('http:' + url.slice(protocol.length));
    return (
      username !== '' && hostname !== '' && hostname !== '-' && pathname !== '' && pathname !== '/'
    );
  } catch {
    return false;
  }
}

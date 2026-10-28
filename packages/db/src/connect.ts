import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { migrate as migrateNeon } from 'drizzle-orm/neon-http/migrator';
import { neon } from '@neondatabase/serverless';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.ts';

/**
 * One schema, two drivers (ADR 0012). The shape of DATABASE_URL picks the driver:
 *   pglite://memory          an in-process Postgres, fresh each time; tests and the local server
 *   pglite:///absolute/path  the same, persisted in a folder on disk
 *   postgres://...           Neon over HTTP; staging and production
 *
 * `Db` is the common Postgres type both drivers extend, so every query is written once.
 * PGlite is imported lazily so the deployed function never bundles a test database.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const migrationsFolder = fileURLToPath(new URL('../drizzle/', import.meta.url));

export async function connect(databaseUrl: string): Promise<Db> {
  if (databaseUrl.startsWith('pglite://')) {
    const [{ PGlite }, { drizzle }, { migrate }] = await Promise.all([
      import('@electric-sql/pglite'),
      import('drizzle-orm/pglite'),
      import('drizzle-orm/pglite/migrator'),
    ]);
    const target = databaseUrl.slice('pglite://'.length);
    const client = target === 'memory' ? new PGlite() : new PGlite(target);
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder });
    return db as unknown as Db;
  }
  if (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://')) {
    return drizzleNeon(neon(databaseUrl), { schema }) as unknown as Db;
  }
  throw new Error('DATABASE_URL must start with pglite:// or postgres://');
}

/** Apply pending migrations to a Neon database. Run by the operator or the deploy, never by a request. */
export async function migrateNeonDatabase(databaseUrl: string): Promise<void> {
  const db = drizzleNeon(neon(databaseUrl), { schema });
  await migrateNeon(db, { migrationsFolder });
}

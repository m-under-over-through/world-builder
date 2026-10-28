import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { migrate as migrateNeon } from 'drizzle-orm/neon-http/migrator';
import { fileURLToPath } from 'node:url';
import { connectNeon } from './neon.ts';
import * as schema from './schema.ts';
import type { Db } from './types.ts';

/**
 * The connector for tools, tests and the local server, which may use either driver (ADR 0012).
 * The shape of the URL picks it:
 *   pglite://memory          an in-process Postgres, fresh each time; tests
 *   pglite:///absolute/path  the same, persisted in a folder on disk; the local server
 *   postgres://...           Neon over HTTP; staging and production
 *
 * This file is deliberately not exported from the package root. The deployed function imports
 * connectNeon from neon.ts, and its bundle must never carry PGlite, a whole Postgres compiled to
 * WebAssembly (see docs/learn/07-bundling-the-function.md). Import this file as `@wb/db/connect`.
 */
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
    return connectNeon(databaseUrl);
  }
  throw new Error('DATABASE_URL must start with pglite:// or postgres://');
}

/** Apply pending migrations to a Neon database. Run by the deploy or the operator, never by a request. */
export async function migrateNeonDatabase(databaseUrl: string): Promise<void> {
  const db = drizzleNeon(neon(databaseUrl), { schema });
  await migrateNeon(db, { migrationsFolder });
}

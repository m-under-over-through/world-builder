import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type * as schema from './schema.ts';

/**
 * The database handle every query takes: the Postgres type both drivers extend (ADR 0012), Neon
 * over HTTP in deployment and PGlite in tests and on a laptop. Queries are written once against
 * this type and never know which driver is behind it.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

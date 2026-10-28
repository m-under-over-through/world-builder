// @wb/db: the schema, the Neon connector, and the queries. See docs/adr/0012-skeleton-libraries.md.
// The connector that also knows PGlite (tests, the local server) is a separate entry,
// `@wb/db/connect`, so the deployed function never carries a test database
// (apps/api/test/bundle.test.ts proves it; docs/learn/07-bundling-the-function.md explains why).
export type { Db } from './types.ts';
export * from './schema.ts';
export * from './neon.ts';
export * from './queries.ts';
export * from './workshop-sync.ts';

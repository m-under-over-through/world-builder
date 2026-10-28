import { defineConfig } from 'drizzle-kit';

// `npm run generate -w packages/db` turns schema.ts into SQL migration files under drizzle/.
// No database connection is needed to generate; applying is done by the code (migrate.ts).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './drizzle',
});

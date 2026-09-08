/**
 * Applies pending SQL migrations. Safe to run repeatedly; drizzle records
 * applied migrations in its own metadata table.
 *
 * Usage: npm run db:migrate
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool);
  console.log('Applying migrations...');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations applied.');
  await pool.end();
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});

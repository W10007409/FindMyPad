import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadConfig } from '../config.js';
import { pathToFileURL } from 'node:url';
export async function runMigrations(url: string) {
  const pool = new pg.Pool({ connectionString: url });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: './server/src/db/migrations' });
  await pool.end();
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMigrations(loadConfig().DATABASE_URL).then(() => console.log('migrated')).catch((e) => { console.error(e); process.exit(1); });
}

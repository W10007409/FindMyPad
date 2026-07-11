import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';
export type DbClient = NodePgDatabase<typeof schema>;
export function createDb(url: string): { db: DbClient; close: () => Promise<void> } {
  const pool = new pg.Pool({ connectionString: url });
  const db = drizzle(pool, { schema });
  return { db, close: () => pool.end() };
}

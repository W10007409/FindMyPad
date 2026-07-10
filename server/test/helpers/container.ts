import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { runMigrations } from '../../src/db/migrate.js';

let container: StartedPostgreSqlContainer;
export async function setup() {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const url = container.getConnectionUri();
  process.env.DATABASE_URL = url;
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? '0123456789abcdef';
  await runMigrations(url);
}
export async function teardown() { await container.stop(); }

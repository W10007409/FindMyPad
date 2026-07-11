import { loadConfig } from '../config.js';
import { createDb } from './client.js';
import { seedAdmin } from './seed.js';

const [username, password, roleArg] = process.argv.slice(2);
if (!username || !password) { console.error('usage: tsx seed-cli.ts <username> <password> [admin|employee]'); process.exit(1); }
const role = roleArg ?? 'admin';
if (role !== 'admin' && role !== 'employee') {
  console.error(`invalid role '${roleArg}'. must be 'admin' or 'employee'`);
  process.exit(1);
}
const { db, close } = createDb(loadConfig().DATABASE_URL);
await seedAdmin(db, username, password, role);
await close();
console.log(`admin '${username}' created`);

import { loadConfig } from '../config.js';
import { createDb } from './client.js';
import { seedAdmin } from './seed.js';

const [username, password, role] = process.argv.slice(2);
if (!username || !password) { console.error('usage: tsx seed-cli.ts <username> <password> [admin|employee]'); process.exit(1); }
const { db, close } = createDb(loadConfig().DATABASE_URL);
await seedAdmin(db, username, password, (role as 'admin' | 'employee') ?? 'admin');
await close();
console.log(`admin '${username}' created`);

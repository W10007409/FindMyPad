import { eq } from 'drizzle-orm';
import { loadConfig } from '../config.js';
import { createDb } from './client.js';
import { adminUsers } from './schema.js';
import { hashPassword } from '../services/auth.js';

const [username, password] = process.argv.slice(2);
if (!username || !password) {
  console.error('usage: tsx set-password.ts <username> <newPassword>');
  process.exit(1);
}
const { db, close } = createDb(loadConfig().DATABASE_URL);
const res = await db
  .update(adminUsers)
  .set({ passwordHash: hashPassword(password) })
  .where(eq(adminUsers.username, username))
  .returning({ id: adminUsers.id });
await close();
if (res.length === 0) {
  console.error(`no admin user named '${username}'`);
  process.exit(1);
}
console.log(`password updated for '${username}' (id=${res[0].id})`);

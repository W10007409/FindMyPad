import { eq } from 'drizzle-orm';
import { loadConfig } from '../config.js';
import { createDb } from './client.js';
import { users } from './schema.js';
import { hashPassword } from '../services/auth.js';

const [empNo, password] = process.argv.slice(2);
if (!empNo || !password) {
  console.error('usage: tsx set-password.ts <empNo> <newPassword>');
  process.exit(1);
}
const { db, close } = createDb(loadConfig().DATABASE_URL);
const res = await db
  .update(users)
  .set({ passwordHash: hashPassword(password), mustChangePassword: false })
  .where(eq(users.empNo, empNo))
  .returning({ id: users.id });
await close();
if (res.length === 0) {
  console.error(`no admin user named '${empNo}'`);
  process.exit(1);
}
console.log(`password updated for '${empNo}' (id=${res[0].id})`);

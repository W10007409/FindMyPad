import { eq, isNull, or } from 'drizzle-orm';
import { loadConfig } from '../config.js';
import { createDb } from './client.js';
import { users } from './schema.js';
import { hashPassword } from '../services/auth.js';

/**
 * Give every imported employee a login: initial password 1234 with must_change_password=true.
 * Idempotent — only sets a password where none exists yet, so re-running never clobbers a
 * password a user has already changed. Also ensures an 'admin' account exists.
 *
 * usage: tsx seed-employees.ts [adminEmpNo]   (adminEmpNo default 'admin')
 */
const adminEmpNo = process.argv[2] ?? 'admin';
const { db, close } = createDb(loadConfig().DATABASE_URL);

const initialHash = () => hashPassword('1234');

// 1) Seed a password for every user that doesn't have one yet.
const pending = await db.select({ id: users.id }).from(users).where(isNull(users.passwordHash));
for (const u of pending) {
  await db.update(users)
    .set({ passwordHash: initialHash(), mustChangePassword: true, role: 'employee', isActive: true })
    .where(eq(users.id, u.id));
}

// 2) Ensure an admin account (empNo=adminEmpNo). If it exists, promote to admin; else create it.
const [existingAdmin] = await db.select().from(users).where(eq(users.empNo, adminEmpNo)).limit(1);
if (existingAdmin) {
  await db.update(users).set({ role: 'admin', isActive: true }).where(eq(users.id, existingAdmin.id));
  if (!existingAdmin.passwordHash) {
    await db.update(users).set({ passwordHash: initialHash(), mustChangePassword: true }).where(eq(users.id, existingAdmin.id));
  }
} else {
  await db.insert(users).values({
    empNo: adminEmpNo, name: '관리자', role: 'admin',
    passwordHash: initialHash(), mustChangePassword: true, isActive: true,
  });
}

await close();
console.log(`seeded ${pending.length} employee passwords; admin='${adminEmpNo}' ready (initial password 1234)`);

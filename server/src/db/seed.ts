import { eq } from 'drizzle-orm';
import type { DbClient } from './client.js';
import { users } from './schema.js';
import { hashPassword } from '../services/auth.js';

/**
 * Seed (or update) a login account in the unified `users` table. `username` is the 사번(empNo).
 * mustChangePassword defaults to false here so seeded/test accounts can be used immediately;
 * the employee bulk-seed (seed-employees.ts) sets it true for the forced first-change flow.
 */
export async function seedAdmin(
  db: DbClient,
  username: string,
  password: string,
  role: 'admin' | 'employee' = 'admin',
  opts: { name?: string; mustChangePassword?: boolean } = {},
) {
  const values = {
    empNo: username,
    name: opts.name ?? username,
    role,
    passwordHash: hashPassword(password),
    mustChangePassword: opts.mustChangePassword ?? false,
    isActive: true,
  };
  await db.insert(users).values(values).onConflictDoUpdate({
    target: users.empNo,
    set: { passwordHash: values.passwordHash, role, mustChangePassword: values.mustChangePassword, isActive: true },
  });
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.empNo, username)).limit(1);
  return u;
}

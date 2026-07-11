import type { DbClient } from './client.js';
import { adminUsers } from './schema.js';
import { hashPassword } from '../services/auth.js';

export async function seedAdmin(db: DbClient, username: string, password: string, role: 'admin' | 'employee' = 'admin') {
  await db.insert(adminUsers).values({ username, passwordHash: hashPassword(password), role });
}

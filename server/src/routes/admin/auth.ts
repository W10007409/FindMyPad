import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { adminUsers } from '../../db/schema.js';
import { verifyPassword, signAdminJwt } from '../../services/auth.js';
import { UnauthorizedError } from '../../errors.js';

const Body = z.object({ username: z.string(), password: z.string() });

export function registerAdminAuthRoutes(app: FastifyInstance) {
  app.post('/api/admin/login', async (req) => {
    const { username, password } = Body.parse(req.body);
    const rows = await app.deps.db.select().from(adminUsers).where(eq(adminUsers.username, username)).limit(1);
    const u = rows[0];
    if (!u || !verifyPassword(password, u.passwordHash)) throw new UnauthorizedError('bad credentials');
    return { token: signAdminJwt({ sub: u.id, role: u.role, username: u.username }, app.deps.config.JWT_SECRET) };
  });
}

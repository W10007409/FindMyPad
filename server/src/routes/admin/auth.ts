import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { users } from '../../db/schema.js';
import { verifyPassword, hashPassword, signAdminJwt } from '../../services/auth.js';
import { requireAdmin } from '../../plugins/auth-admin.js';
import { UnauthorizedError, ValidationError } from '../../errors.js';

// 사번 로그인. `empNo`가 정식 필드이며, 이전 대시보드 호환을 위해 `username`도 사번으로 받아준다.
const LoginBody = z.object({
  empNo: z.string().optional(),
  username: z.string().optional(),
  password: z.string(),
}).refine((b) => b.empNo || b.username, { message: 'empNo required' });

const ChangeBody = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(4, 'new password must be at least 4 characters'),
});

export function registerAdminAuthRoutes(app: FastifyInstance) {
  app.post('/api/admin/login', async (req) => {
    const b = LoginBody.parse(req.body);
    const empNo = (b.empNo ?? b.username)!.trim();
    const [u] = await app.deps.db.select().from(users).where(eq(users.empNo, empNo)).limit(1);
    if (!u || !u.isActive || !u.passwordHash || !verifyPassword(b.password, u.passwordHash)) {
      throw new UnauthorizedError('bad credentials');
    }
    const token = signAdminJwt({ sub: u.id, role: u.role, empNo: u.empNo }, app.deps.config.JWT_SECRET);
    return { token, role: u.role, name: u.name, empNo: u.empNo, mustChangePassword: u.mustChangePassword };
  });

  // 인증된 사용자가 자기 비밀번호를 변경(최초 로그인 강제 변경 포함). 새 비번은 1234 금지.
  app.post('/api/auth/change-password', { preHandler: requireAdmin(app, ['admin', 'employee']) }, async (req) => {
    const b = ChangeBody.parse(req.body);
    if (b.newPassword === '1234') throw new ValidationError('new password cannot be the initial password');
    const id = req.admin!.id;
    const [u] = await app.deps.db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!u || !u.passwordHash || !verifyPassword(b.currentPassword, u.passwordHash)) {
      throw new UnauthorizedError('current password is incorrect');
    }
    await app.deps.db.update(users)
      .set({ passwordHash: hashPassword(b.newPassword), mustChangePassword: false })
      .where(eq(users.id, id));
    return { ok: true };
  });
}

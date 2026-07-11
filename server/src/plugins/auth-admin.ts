import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { verifyAdminJwt } from '../services/auth.js';
import { UnauthorizedError } from '../errors.js';

export function requireAdmin(app: FastifyInstance, roles: Array<'admin' | 'employee'> = ['admin', 'employee']): preHandlerHookHandler {
  return async (req) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) throw new UnauthorizedError('admin token required');
    let payload;
    try { payload = verifyAdminJwt(auth.slice(7), app.deps.config.JWT_SECRET); }
    catch { throw new UnauthorizedError('invalid admin token'); }
    if (!roles.includes(payload.role)) throw new UnauthorizedError('insufficient role');
    req.admin = { id: payload.sub, role: payload.role, username: payload.username };
  };
}

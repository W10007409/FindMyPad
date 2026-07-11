import type { FastifyInstance, FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify';
import { eq } from 'drizzle-orm';
import { devices } from '../db/schema.js';
import { hashToken } from '../services/auth.js';
import { UnauthorizedError } from '../errors.js';

export function requireDevice(app: FastifyInstance): preHandlerHookHandler {
  return async (req: FastifyRequest, _reply: FastifyReply) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) throw new UnauthorizedError('device token required');
    const hash = hashToken(auth.slice(7));
    const rows = await app.deps.db.select().from(devices).where(eq(devices.deviceTokenHash, hash)).limit(1);
    if (rows.length === 0) throw new UnauthorizedError('invalid device token');
    req.device = { id: rows[0].id, serial: rows[0].serial };
  };
}

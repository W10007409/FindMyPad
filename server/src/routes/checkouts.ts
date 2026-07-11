import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { checkouts, users } from '../db/schema.js';
import { requireDevice } from '../plugins/auth-device.js';
import { ConflictError, NotFoundError } from '../errors.js';

const Body = z.object({ empNo: z.string().min(1), consentAt: z.string().datetime() });

export function registerCheckoutRoutes(app: FastifyInstance) {
  const db = app.deps.db;

  app.post('/api/checkouts', { preHandler: requireDevice(app) }, async (req) => {
    const b = Body.parse(req.body);
    const [user] = await db.select().from(users).where(eq(users.empNo, b.empNo)).limit(1);
    if (!user) throw new NotFoundError('user not found');
    try {
      const [row] = await db.insert(checkouts)
        .values({ deviceId: req.device!.id, userId: user.id, consentAt: new Date(b.consentAt) })
        .returning();
      return { checkoutId: row.id, userId: user.id };
    } catch (e: any) {
      if (e?.code === '23505') throw new ConflictError('device already checked out');
      throw e;
    }
  });

  app.post('/api/checkouts/:id/return', { preHandler: requireDevice(app) }, async (req) => {
    const id = Number((req.params as { id: string }).id);
    const [row] = await db.update(checkouts).set({ returnedAt: new Date() })
      .where(and(eq(checkouts.id, id), eq(checkouts.deviceId, req.device!.id), isNull(checkouts.returnedAt)))
      .returning();
    if (!row) throw new NotFoundError('active checkout not found');
    return { checkoutId: row.id, returnedAt: row.returnedAt };
  });
}

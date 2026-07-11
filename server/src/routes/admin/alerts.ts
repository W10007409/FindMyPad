import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../../plugins/auth-admin.js';
import { scanStale } from '../../jobs/stale-scan.js';

export function registerAlertRoutes(app: FastifyInstance) {
  app.get('/api/admin/alerts/stale', { preHandler: requireAdmin(app) }, async (req) => {
    const days = z.object({ days: z.coerce.number().default(app.deps.config.STALE_DAYS) }).parse(req.query).days;
    return { items: await scanStale(app.deps.db, days) };
  });
}

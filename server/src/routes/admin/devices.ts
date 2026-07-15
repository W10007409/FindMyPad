import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, desc, eq, ilike, inArray, isNull, or } from 'drizzle-orm';
import { devices, users, checkouts, reports } from '../../db/schema.js';
import { requireAdmin } from '../../plugins/auth-admin.js';
import { resolveIndoorLocation } from '../../services/location.js';
import { NotFoundError } from '../../errors.js';

async function latestReport(db: FastifyInstance['deps']['db'], deviceId: number) {
  const [r] = await db.select().from(reports).where(eq(reports.deviceId, deviceId)).orderBy(desc(reports.reportedAt)).limit(1);
  return r ?? null;
}
async function activeUser(db: FastifyInstance['deps']['db'], deviceId: number) {
  const [row] = await db.select({ empNo: users.empNo, name: users.name, dept: users.dept })
    .from(checkouts).innerJoin(users, eq(checkouts.userId, users.id))
    .where(and(eq(checkouts.deviceId, deviceId), isNull(checkouts.returnedAt))).limit(1);
  return row ?? null;
}

export function registerAdminDeviceRoutes(app: FastifyInstance) {
  const db = app.deps.db;

  app.get('/api/admin/devices', { preHandler: requireAdmin(app, ['admin']) }, async (req) => {
    const q = (z.object({ q: z.string().optional() }).parse(req.query).q ?? '').trim();
    const like = `%${q}%`;

    let rows;
    if (q) {
      // q가 이름/사번과 매칭되는 활성 대여의 device_id 목록을 먼저 조회한다.
      // (drizzle-orm 0.36.4에서 sql`${id} in (${subquery})` 패턴이 불안정하여 inArray 폴백을 사용)
      const userMatchedRows = await db.select({ id: checkouts.deviceId }).from(checkouts)
        .innerJoin(users, eq(checkouts.userId, users.id))
        .where(and(isNull(checkouts.returnedAt), or(ilike(users.name, like), ilike(users.empNo, like))));
      const userMatchedDeviceIds = userMatchedRows.map((r) => r.id).filter((id): id is number => id !== null);

      const conditions = [ilike(devices.serial, like), ilike(devices.assetNo, like)];
      if (userMatchedDeviceIds.length > 0) conditions.push(inArray(devices.id, userMatchedDeviceIds));

      rows = await db.select().from(devices).where(or(...conditions)).limit(100);
    } else {
      rows = await db.select().from(devices).limit(100);
    }

    const items = await Promise.all(rows.map(async (d) => {
      const rep = await latestReport(db, d.id);
      const cu = await activeUser(db, d.id);
      const indoor = await resolveIndoorLocation(db, rep?.bssid ?? null);
      return {
        id: d.id, serial: d.serial, assetNo: d.assetNo, model: d.model,
        batteryPct: rep?.batteryPct ?? null, lastSeenAt: d.lastSeenAt,
        lat: rep?.lat ?? null, lng: rep?.lng ?? null,
        currentUser: cu, indoor,
      };
    }));
    return { items };
  });

  app.get('/api/admin/devices/:id', { preHandler: requireAdmin(app, ['admin']) }, async (req) => {
    const id = Number((req.params as { id: string }).id);
    const [device] = await db.select().from(devices).where(eq(devices.id, id)).limit(1);
    const recentReports = await db.select().from(reports).where(eq(reports.deviceId, id)).orderBy(desc(reports.reportedAt)).limit(20);
    const history = await db.select({
      id: checkouts.id, empNo: users.empNo, name: users.name,
      checkedOut: checkouts.checkedOut, returnedAt: checkouts.returnedAt, consentAt: checkouts.consentAt,
    }).from(checkouts).innerJoin(users, eq(checkouts.userId, users.id))
      .where(eq(checkouts.deviceId, id)).orderBy(desc(checkouts.checkedOut)).limit(50);
    const currentUser = await activeUser(db, id);
    const indoor = await resolveIndoorLocation(db, recentReports[0]?.bssid ?? null);
    return { device, currentUser, indoor, recentReports, history };
  });

  async function sendCmd(id: number, type: 'RING' | 'LOCATE_NOW'): Promise<{ queued: boolean; reason?: 'no_token' | 'send_failed' }> {
    const [d] = await db.select().from(devices).where(eq(devices.id, id)).limit(1);
    if (!d) throw new NotFoundError('device not found');
    if (!d.fcmToken) return { queued: false, reason: 'no_token' };
    try {
      await app.deps.fcm.send(d.fcmToken, { type });
      return { queued: true };
    } catch (e) {
      app.log.warn({ err: e, deviceId: id, type }, 'fcm send failed');
      return { queued: false, reason: 'send_failed' };
    }
  }
  app.post('/api/admin/devices/:id/ring', { preHandler: requireAdmin(app, ['admin']) },
    async (req) => sendCmd(Number((req.params as { id: string }).id), 'RING'));
  app.post('/api/admin/devices/:id/locate', { preHandler: requireAdmin(app, ['admin']) },
    async (req) => sendCmd(Number((req.params as { id: string }).id), 'LOCATE_NOW'));
}

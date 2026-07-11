import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { reports, devices } from '../db/schema.js';
import { requireDevice } from '../plugins/auth-device.js';
import { resolveIndoorLocation } from '../services/location.js';

const Body = z.object({
  lat: z.number().optional(), lng: z.number().optional(), accuracyM: z.number().optional(),
  bssid: z.string().optional(), ssid: z.string().optional(), batteryPct: z.number().int().min(0).max(100).optional(),
});

export function registerReportRoutes(app: FastifyInstance) {
  app.post('/api/reports', { preHandler: requireDevice(app) }, async (req) => {
    const b = Body.parse(req.body);
    const deviceId = req.device!.id;
    const [rep] = await app.deps.db.insert(reports).values({
      deviceId, lat: b.lat, lng: b.lng, accuracyM: b.accuracyM,
      bssid: b.bssid, ssid: b.ssid, batteryPct: b.batteryPct, publicIp: req.ip,
    }).returning();
    await app.deps.db.update(devices).set({ lastSeenAt: new Date() }).where(eq(devices.id, deviceId));
    const indoor = await resolveIndoorLocation(app.deps.db, b.bssid);
    return { reportId: rep.id, indoor };
  });
}

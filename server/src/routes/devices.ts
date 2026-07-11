import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { devices } from '../db/schema.js';
import { generateDeviceToken } from '../services/auth.js';

const Body = z.object({
  serial: z.string().min(1),
  model: z.string().optional(),
  wifiMac: z.string().optional(),
  fcmToken: z.string().optional(),
  assetNo: z.string().optional(),
});

export function registerDeviceRoutes(app: FastifyInstance) {
  app.post('/api/devices/enroll', async (req) => {
    const b = Body.parse(req.body);
    const { token, hash } = generateDeviceToken();
    const [row] = await app.deps.db.insert(devices)
      .values({ serial: b.serial, model: b.model, wifiMac: b.wifiMac, fcmToken: b.fcmToken, assetNo: b.assetNo, deviceTokenHash: hash })
      .onConflictDoUpdate({
        target: devices.serial,
        set: { model: b.model, wifiMac: b.wifiMac, fcmToken: b.fcmToken, assetNo: b.assetNo, deviceTokenHash: hash },
      })
      .returning();
    return { deviceId: row.id, assetNo: row.assetNo, deviceToken: token };
  });
}

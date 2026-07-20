import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { reports, devices } from '../db/schema.js';
import { requireDevice } from '../plugins/auth-device.js';
import { resolveIndoorLocation } from '../services/location.js';

const NearbyAp = z.object({ bssid: z.string(), rssi: z.number().int(), ssid: z.string().optional(), frequency: z.number().int().optional() });
const Body = z.object({
  lat: z.number().optional(), lng: z.number().optional(), accuracyM: z.number().optional(),
  bssid: z.string().optional(), ssid: z.string().optional(), batteryPct: z.number().int().min(0).max(100).optional(),
  batteryStatus: z.string().optional(), batteryPlug: z.string().optional(), batteryTempC: z.number().optional(),
  batteryHealth: z.string().optional(), batteryVoltageMv: z.number().int().optional(),
  wifiRssi: z.number().int().optional(), wifiLinkMbps: z.number().int().optional(), wifiFreqMhz: z.number().int().optional(),
  localIp: z.string().optional(), storageFreeMb: z.number().int().optional(), storageTotalMb: z.number().int().optional(),
  osVersion: z.string().optional(), uptimeSec: z.number().int().optional(),
  nearbyAps: z.array(NearbyAp).optional(),
});

export function registerReportRoutes(app: FastifyInstance) {
  app.post('/api/reports', { preHandler: requireDevice(app) }, async (req) => {
    const b = Body.parse(req.body);
    const deviceId = req.device!.id;
    const [rep] = await app.deps.db.insert(reports).values({
      deviceId, lat: b.lat, lng: b.lng, accuracyM: b.accuracyM,
      bssid: b.bssid, ssid: b.ssid, batteryPct: b.batteryPct, publicIp: req.ip,
      batteryStatus: b.batteryStatus, batteryPlug: b.batteryPlug, batteryTempC: b.batteryTempC,
      batteryHealth: b.batteryHealth, batteryVoltageMv: b.batteryVoltageMv,
      wifiRssi: b.wifiRssi, wifiLinkMbps: b.wifiLinkMbps, wifiFreqMhz: b.wifiFreqMhz,
      localIp: b.localIp, storageFreeMb: b.storageFreeMb, storageTotalMb: b.storageTotalMb,
      osVersion: b.osVersion, uptimeSec: b.uptimeSec, nearbyAps: b.nearbyAps,
    }).returning();
    await app.deps.db.update(devices).set({ lastSeenAt: new Date() }).where(eq(devices.id, deviceId));
    const indoor = await resolveIndoorLocation(app.deps.db, b.bssid);
    return { reportId: rep.id, indoor };
  });
}

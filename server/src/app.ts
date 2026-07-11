import Fastify, { FastifyInstance } from 'fastify';
import type { Config } from './config.js';
import type { DbClient } from './db/client.js';
import type { FcmSender } from './services/fcm.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerAdminAuthRoutes } from './routes/admin/auth.js';
import { registerDeviceRoutes } from './routes/devices.js';
import { registerReportRoutes } from './routes/reports.js';
import { registerCheckoutRoutes } from './routes/checkouts.js';
import { registerAdminDeviceRoutes } from './routes/admin/devices.js';
import { registerApMapRoutes } from './routes/admin/ap-map.js';

export interface AppDeps { config: Config; db: DbClient; fcm: FcmSender; }

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: false, trustProxy: deps.config.TRUST_PROXY });
  app.decorate('deps', deps);
  registerErrorHandler(app);
  registerAdminAuthRoutes(app);
  registerDeviceRoutes(app);
  registerReportRoutes(app);
  registerCheckoutRoutes(app);
  registerAdminDeviceRoutes(app);
  registerApMapRoutes(app);
  app.get('/health', async () => ({ status: 'ok' }));
  return app;
}

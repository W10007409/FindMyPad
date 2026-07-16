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
import { registerAlertRoutes } from './routes/admin/alerts.js';
import { registerAssetRoutes } from './routes/admin/assets.js';

export interface AppDeps { config: Config; db: DbClient; fcm: FcmSender; }

export function buildApp(deps: AppDeps, opts: { logger?: boolean } = {}): FastifyInstance {
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: deps.config.TRUST_PROXY });
  // Tolerate an empty JSON body: bodyless POSTs (e.g. ring/locate commands) may still
  // arrive with Content-Type: application/json. Fastify's default parser 400s on that;
  // treat empty as no body so command endpoints don't reject valid requests.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (body === '' || body == null) { done(null, undefined); return; }
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      (err as Error & { statusCode?: number }).statusCode = 400;
      done(err as Error, undefined);
    }
  });
  app.decorate('deps', deps);
  registerErrorHandler(app);
  registerAdminAuthRoutes(app);
  registerDeviceRoutes(app);
  registerReportRoutes(app);
  registerCheckoutRoutes(app);
  registerAdminDeviceRoutes(app);
  registerApMapRoutes(app);
  registerAlertRoutes(app);
  registerAssetRoutes(app);
  app.get('/health', async () => ({ status: 'ok' }));
  return app;
}

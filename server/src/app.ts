import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
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
  // 대시보드가 다른 오리진(NCP CDN 등)일 때만 CORS 활성. CORS_ORIGINS 비면 동일 오리진으로 간주.
  const corsOrigins = deps.config.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  if (corsOrigins.length > 0) {
    app.register(cors, {
      origin: corsOrigins,
      methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 86400,
    });
  }
  registerErrorHandler(app);
  const registerRoutes = (instance: FastifyInstance) => {
    registerAdminAuthRoutes(instance);
    registerDeviceRoutes(instance);
    registerReportRoutes(instance);
    registerCheckoutRoutes(instance);
    registerAdminDeviceRoutes(instance);
    registerApMapRoutes(instance);
    registerAlertRoutes(instance);
    registerAssetRoutes(instance);
    instance.get('/health', async () => ({ status: 'ok' }));
  };
  const base = deps.config.BASE_PATH;
  if (base) {
    // 모든 라우트를 접두사(/FindMyPad) 하위로. 컨테이너/인프라 헬스체크용 루트 /health도 유지.
    app.register(async (instance) => registerRoutes(instance), { prefix: base });
    app.get('/health', async () => ({ status: 'ok' }));
  } else {
    registerRoutes(app);
  }
  return app;
}

import Fastify, { FastifyInstance } from 'fastify';
import type { Config } from './config.js';
import type { DbClient } from './db/client.js';
import type { FcmSender } from './services/fcm.js';
import { registerErrorHandler } from './plugins/error-handler.js';

export interface AppDeps { config: Config; db: DbClient; fcm: FcmSender; }

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: false, trustProxy: deps.config.TRUST_PROXY });
  app.decorate('deps', deps);
  registerErrorHandler(app);
  app.get('/health', async () => ({ status: 'ok' }));
  return app;
}

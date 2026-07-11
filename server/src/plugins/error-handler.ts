import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../errors.js';

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
    }
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: { code: 'VALIDATION', message: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') } });
    }
    if ((err as any).statusCode === 400) {
      return reply.status(400).send({ error: { code: 'VALIDATION', message: err.message } });
    }
    _req.log?.error?.(err);
    return reply.status(500).send({ error: { code: 'INTERNAL', message: 'internal error' } });
  });
}

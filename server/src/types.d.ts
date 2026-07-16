import 'fastify';
declare module 'fastify' {
  interface FastifyInstance { deps: import('./app.js').AppDeps; }
  interface FastifyRequest {
    device?: { id: number; serial: string };
    admin?: { id: number; role: 'admin' | 'employee'; empNo: string };
  }
}

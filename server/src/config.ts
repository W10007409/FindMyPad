import { z } from 'zod';
const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  PORT: z.coerce.number().default(3000),
  RETENTION_DAYS: z.coerce.number().default(90),
  STALE_DAYS: z.coerce.number().default(7),
  CORP_SSIDS: z.string().default(''),
  CORP_PUBLIC_IPS: z.string().default(''),
  MAXMIND_MMDB_PATH: z.string().optional(),
  // 대시보드가 다른 오리진(NCP CDN)일 때 허용할 오리진 콤마목록. 비면 CORS 비활성(동일 오리진).
  CORS_ORIGINS: z.string().default(''),
  TRUST_PROXY: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  FIREBASE_SERVICE_ACCOUNT: z.string().optional(),
});
export type Config = z.infer<typeof EnvSchema>;
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return EnvSchema.parse(env);
}

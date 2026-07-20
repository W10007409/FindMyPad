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
  TRUST_PROXY: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  FIREBASE_SERVICE_ACCOUNT: z.string().optional(),
});
export type Config = z.infer<typeof EnvSchema>;
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return EnvSchema.parse(env);
}

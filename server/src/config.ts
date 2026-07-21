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
  // 하위경로 서빙용 접두사(예: '/FindMyPad'). 비면 루트(/api). CDN이 경로를 벗겨내지 않고
  // 원본에 그대로 전달할 때, 서버가 이 접두사 하위로 라우트를 등록한다. 앞에 '/', 끝에 슬래시 없음.
  BASE_PATH: z.string().default('').transform((v) => (v && !v.startsWith('/') ? `/${v}` : v).replace(/\/$/, '')),
  TRUST_PROXY: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  FIREBASE_SERVICE_ACCOUNT: z.string().optional(),
});
export type Config = z.infer<typeof EnvSchema>;
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return EnvSchema.parse(env);
}

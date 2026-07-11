# pad-tracker server (P1)

## 로컬 기동
```bash
cp .env.example .env
docker compose up -d db
pnpm install
pnpm db:migrate
pnpm seed:admin root secret123 admin
pnpm dev
```

## 테스트 (Docker 필요 — Testcontainers)
```bash
pnpm test
```

## API
- POST /api/devices/enroll · POST /api/reports · POST /api/checkouts · POST /api/checkouts/:id/return
- POST /api/admin/login · GET /api/admin/devices?q= · GET /api/admin/devices/:id
- POST /api/admin/devices/:id/ring · /locate · PUT /api/admin/ap-map · GET /api/admin/alerts/stale?days=7

> FCM은 P1에서 스텁. 실발송은 P2(Firebase 키).

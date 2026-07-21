# deploy/ — FindMyPad 배포

패드가 **사외(외부망)** 에도 있을 수 있어, API는 공인 HTTPS로 노출한다. 아키텍처 상세는
[`aws-architecture.md`](./aws-architecture.md) 참고.

## 구성물

| 경로 | 내용 |
|---|---|
| `aws-architecture.md` | 아키텍처 문서(구성요소·요건·두 가지 안·env 매핑) |
| `Dockerfile` · `docker-entrypoint.sh` | API 서버 컨테이너 이미지 (구성 A·B 공통) |
| `compose/` | **구성 A**(단일 EC2): `docker-compose.prod.yml` + `Caddyfile` + `.env.prod.example` |
| `terraform/` | **구성 B**(권장 매니지드): AWS IaC 스캐폴드 |
| `ncp/` | **구성 C**(NCP CDN + 로컬 DB): 대시보드=NCP Object Storage/CDN+, API+DB=로컬 공인 원본. `docker-compose.yml` + `Caddyfile` + `.env.example` + 셋업 가이드 |

## 빠른 시작

### 구성 A — 단일 EC2 (파일럿)
```bash
# EC2(Docker 설치) + 도메인 A레코드 + 보안그룹 80/443
cd deploy/compose
cp .env.prod.example .env         # 값 채우기 (DB비번/JWT/도메인/CORP_PUBLIC_IPS)
mkdir -p ../secrets && cp <firebase 서비스계정>.json ../secrets/firebase-service-account.json
cd ../../dashboard && npm ci && npm run build   # 대시보드 정적 빌드
cd ../deploy/compose && docker compose -f docker-compose.prod.yml up -d --build
```
Caddy가 Let's Encrypt로 TLS 자동 발급. 앱/대시보드는 `https://{DOMAIN}` 하나를 바라봄
(`/api/*`→API, 그 외→대시보드).

### 구성 B — AWS 매니지드 (운영)
```bash
# 1) 이미지 빌드·푸시
docker build -f deploy/Dockerfile -t <ECR_URL>:v0.1.0 .
docker push <ECR_URL>:v0.1.0
# 2) 인프라
cd deploy/terraform
cp terraform.tfvars.example terraform.tfvars   # 도메인/호스팅존/이미지태그 등
terraform init && terraform apply
# 3) 시크릿 값 주입(Secrets Manager), 4) 마이그레이션 1회 태스크, 5) 대시보드 S3 업로드
```
상세 순서는 `terraform/README.md` 참고.

## 공통 — 배포 전 앱/대시보드 변경 (필수)
- **Android** `app/src/main/java/com/wjtb/padtracker/AppContainer.kt` `defaultBaseUrl`
  → `https://api.example.com/` (현재 `http://127.0.0.1:3000/` 하드코딩). knox flavor는 cleartext 불가 → HTTPS 필수.
- **대시보드** `VITE_API_BASE_URL` → 배포 도메인 기준. (구성 A는 동일 도메인 `/api` 기본값 그대로면 됨)
- 운영자 값: `CORP_PUBLIC_IPS`(사내 egress 공인 IP), Firebase 서비스계정, (선택) MaxMind mmdb.

## 시크릿/상태 커밋 금지
`deploy/compose/.env`, `deploy/secrets/`, `deploy/terraform/*.tfvars`, `*.tfstate`,
`.terraform/` 는 `.gitignore` 처리됨. `*.example` 템플릿만 커밋한다.

# P5 — 파일럿 준비 패키지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 10~20대 파일럿을 위한 서버 프로덕션 설정(Dockerfile·prod compose·env) + AP 매핑 템플릿 + 배포/파일럿 운영 문서를 main에 준비. 검증 가능한 부분(Docker 이미지 빌드, compose 유효성)은 실제 검증하고, 인프라·서명·법무·실기기는 사람 게이트(문서로 안내).

**Architecture:** 이 Phase는 배포 설정 + 문서다(기능 코드 아님, TDD 아님). 검증 게이트 = `docker build` 성공 + `docker compose -f docker-compose.prod.yml config` 유효 + AP CSV 헤더가 P1 ap-map 파서와 일치 + 문서 내부 일관성. 서버는 **사내 리버스 프록시 뒤 HTTP:3000, TRUST_PROXY=true**(HTTPS는 사내 인프라).

**Tech Stack:** Node 20 + pnpm(서버, 기존 P1), tsc→dist, Drizzle 마이그레이션, Docker + docker-compose, PostgreSQL 16.

## Global Constraints

- **Base**: main. main에는 서버(`server/`)와 루트 `package.json`(pnpm), `tsconfig.json`, `docker-compose.yml`(개발용, PG만), `.env.example`이 이미 있음. android-agent/dashboard 코드는 다른 브랜치(main엔 없음).
- **서버 빌드 계약**(기존 P1, 변경 금지): 루트 `package.json` 스크립트 `build`=`tsc -p tsconfig.json`→`dist/`(엔트리 `dist/server.js`), `db:migrate`=`tsx server/src/db/migrate.ts`. `tsconfig.json`은 `rootDir: server/src`, `outDir: dist` → `tsc`가 `dist/server.js`·`dist/db/migrate.js` 등 생성. 마이그레이션 SQL은 `server/src/db/migrations/`.
- **런타임 마이그레이션은 컴파일된 것으로**: `tsc`가 `server/src/db/migrate.ts`→`dist/db/migrate.js`로 컴파일(migrate.ts는 P1에서 Windows-safe `pathToFileURL` 가드 포함). `dist/db/migrate.js`는 `migrationsFolder: './server/src/db/migrations'`(소스의 상대경로)를 참조 → **런타임 이미지에 `server/src/db/migrations/` 폴더가 WORKDIR 기준으로 존재해야 함**. 이렇게 하면 런타임에 `tsx` 불필요(마이그레이터는 `drizzle-orm` prod 의존).
- **시크릿 금지**: `.env.prod`(실값)·keystore·Firebase 서비스계정은 커밋 금지. `.env.prod.example`만 커밋(placeholder). 강한 `JWT_SECRET` 생성 안내.
- **Docker 빌드 컨텍스트**: 빌드 컨텍스트 = 레포 루트. 루트에 `addon_knox_api_level_28_samsung_electronics/`(대용량, gitignore·untracked)와 `.superpowers/`가 상주하므로 **`.dockerignore`로 반드시 제외**(빌드 컨텍스트 비대·불필요 복사 방지).
- **Docker 필요**: `docker build`/`docker compose config` 검증에 로컬 Docker 데몬 필요(현재 가용, v29.3.1). Gradle 아님 — 빌드는 수 분(pnpm install + tsc).
- **앱 서명·대시보드 호스팅**은 문서 안내만(설정은 각 브랜치 후속). P5는 main만 건드린다.

---

## 파일 구조 (main에 추가)

```
FindMyPad/
├── Dockerfile                       # 서버 프로덕션 이미지 (멀티스테이지)
├── .dockerignore                    # 빌드 컨텍스트 제외
├── docker-compose.prod.yml          # server + postgres
├── .env.prod.example                # 프로덕션 env 템플릿
└── docs/
    ├── ap-map-template.csv          # AP 매핑 CSV 템플릿
    ├── p5-prerequisites.md          # §0 사람 준비물 체크리스트
    ├── p5-deployment.md             # 배포 런북 (서버·대시보드·앱 서명)
    └── p5-pilot-runbook.md          # 파일럿(10~20대) 런북 + 수용 기준
```

---

## Task 1: 서버 Dockerfile + .dockerignore (docker build 검증)

**Files:**
- Create: `Dockerfile`, `.dockerignore`

**Interfaces:**
- Produces: 빌드 가능한 서버 프로덕션 이미지(`pad-tracker-server`), 시작 시 마이그레이션 후 서버 기동.

- [ ] **Step 1: .dockerignore 작성 (컨텍스트 축소 — 먼저)**

`.dockerignore`:
```
node_modules
dist
.git
.env
.env.*
!.env.prod.example
addon_knox_api_level_28_samsung_electronics
.superpowers
android-agent
dashboard
docs
*.md
.idea
coverage
```
> 루트의 대용량 Knox 애드온·스크래치·다른 컴포넌트를 컨텍스트에서 제외. 서버 빌드에 필요한 건 `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `drizzle.config.ts`, `server/`.

- [ ] **Step 2: Dockerfile 작성 (멀티스테이지)**

`Dockerfile`:
```dockerfile
# ---- builder ----
FROM node:20-slim AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json drizzle.config.ts ./
COPY server ./server
RUN pnpm build

# ---- runtime ----
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
# 컴파일 산출물 + 마이그레이션 SQL(런타임 migrate.js가 상대경로로 참조)
COPY --from=builder /app/dist ./dist
COPY server/src/db/migrations ./server/src/db/migrations
EXPOSE 3000
USER node
# 시작 시 마이그레이션 후 서버 기동 (마이그레이터는 drizzle-orm prod 의존; tsx 불필요)
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/server.js"]
```
> 주의: `pnpm-lock.yaml`이 루트에 있어야 함(P1에서 커밋됨). 없으면 `pnpm install --frozen-lockfile`이 실패 → `--frozen-lockfile` 제거 또는 lock 생성. `node:20-slim`에 `node` 유저 존재. `drizzle.config.ts`는 빌드에 불필요할 수 있으나 tsconfig가 include 안 하면 생략 가능 — 컴파일 에러 시 조정.

- [ ] **Step 3: docker build 검증**

Run (수 분 소요 — pnpm install + tsc):
```bash
cd /f/MyWorkSpace/FindMyPad && docker build -t pad-tracker-server .
```
Expected: `Successfully built` / `naming to ... pad-tracker-server`. 빌드 실패 시:
- `pnpm build` 단계 tsc 에러 → tsconfig/소스 확인(P1은 통과했으므로 대개 컨텍스트/복사 누락).
- `dist/db/migrate.js` 미생성 → tsconfig include에 `server/src` 포함 확인.
- lockfile 관련 → `--frozen-lockfile` 조정.

(이미지 실행/마이그레이션 런타임 검증은 DB 필요 → Task 2의 compose에서 선택적으로. 이 태스크는 **빌드 성공**까지.)

- [ ] **Step 4: 커밋**

```bash
git add Dockerfile .dockerignore
git commit -m "build(server): production Dockerfile (multi-stage) + dockerignore"
```

---

## Task 2: docker-compose.prod.yml + .env.prod.example (compose config 검증)

**Files:**
- Create: `docker-compose.prod.yml`, `.env.prod.example`

**Interfaces:**
- Produces: 유효한 프로덕션 compose(server+postgres), 프로덕션 env 템플릿.

- [ ] **Step 1: .env.prod.example 작성**

`.env.prod.example`:
```
# --- 프로덕션 환경변수 (실값은 .env.prod 에, 커밋 금지) ---
# 강한 랜덤 값 사용: openssl rand -hex 32
DATABASE_URL=postgres://pad:CHANGE_ME@db:5432/padtracker
POSTGRES_USER=pad
POSTGRES_PASSWORD=CHANGE_ME
POSTGRES_DB=padtracker
JWT_SECRET=CHANGE_ME_openssl_rand_hex_32
# FCM 실발송용 서비스계정 JSON 경로(컨테이너 내부) 또는 내용
FIREBASE_SERVICE_ACCOUNT=/run/secrets/firebase-service-account.json
RETENTION_DAYS=90
STALE_DAYS=7
CORP_SSIDS=CORP-WIFI,CORP-WIFI-5G
# 사내 리버스 프록시 뒤 → X-Forwarded-* 신뢰
TRUST_PROXY=true
PORT=3000
```
> `DATABASE_URL`의 호스트는 compose 서비스명 `db`. `JWT_SECRET`/`POSTGRES_PASSWORD`는 반드시 강한 값으로 교체(placeholder `CHANGE_ME` 금지).

- [ ] **Step 2: docker-compose.prod.yml 작성**

`docker-compose.prod.yml`:
```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  server:
    build:
      context: .
      dockerfile: Dockerfile
    image: pad-tracker-server
    env_file: .env.prod
    depends_on:
      db:
        condition: service_healthy
    ports:
      - "3000:3000"
    healthcheck:
      test: ["CMD-SHELL", "node -e \"fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
      interval: 15s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  pgdata:
```
> 리버스 프록시·HTTPS는 사내 인프라(compose 미포함). 서버는 3000에서 HTTP. `env_file: .env.prod`(사람이 `.env.prod.example`→`.env.prod` 복사·값 채움).

- [ ] **Step 3: compose 유효성 검증**

Run:
```bash
cd /f/MyWorkSpace/FindMyPad && cp .env.prod.example .env.prod && docker compose -f docker-compose.prod.yml config >/dev/null && echo "COMPOSE VALID" && rm -f .env.prod
```
Expected: `COMPOSE VALID`(문법·env 보간 유효). (`.env.prod`는 검증용 임시 — 삭제, 커밋 금지.)
> 선택(시간 되면): `docker compose -f docker-compose.prod.yml up -d db` 후 `... up -d --build server` → `/health` 확인 → `down -v`. DB 있는 실기동 스모크. 실패해도 DoD는 build+config로 충족.

- [ ] **Step 4: 커밋 (.env.prod 제외 확인)**

```bash
git status   # .env.prod 이 staged 아님을 확인 (gitignore 필요 시 추가)
git add docker-compose.prod.yml .env.prod.example
git commit -m "build(server): production compose (server+postgres, behind corp proxy) + env template"
```
> `.gitignore`에 `.env.prod` 없으면 추가(루트 `.gitignore` 확인). `.env.prod.example`은 커밋.

---

## Task 3: AP 매핑 CSV 템플릿 + 사람 준비물 체크리스트

**Files:**
- Create: `docs/ap-map-template.csv`, `docs/p5-prerequisites.md`

**Interfaces:**
- Produces: P1 ap-map 파서와 헤더 정합인 CSV 템플릿, §0 준비물 체크리스트.

- [ ] **Step 1: docs/ap-map-template.csv 작성**

```csv
bssid,building,floor,zone,note
AA:BB:CC:DD:EE:01,본관,3,동측,정문 근처
AA:BB:CC:DD:EE:02,본관,3,서측,
AA:BB:CC:DD:EE:03,별관,1,로비,안내데스크
```
> 헤더는 P1 `server/src/routes/admin/ap-map.ts` 파서(`bssid,building,floor,zone,note`)와 정확히 일치해야 함. 확인: 해당 파일의 `get('bssid')` 등 컬럼명 대조.

- [ ] **Step 2: 헤더 정합 확인**

Run: `grep -nE "get\('(bssid|building|floor|zone|note)'\)" server/src/routes/admin/ap-map.ts` → 5개 컬럼이 템플릿 헤더와 일치 확인.

- [ ] **Step 3: docs/p5-prerequisites.md 작성**

정의서 §0 사람 준비물을 체크리스트로(각 항목: 무엇/발급처·절차/소요/필요 시점·담당):
- Knox 파트너 계정(samsungknox.com, 회사 계정) — P4 이전.
- KPE 라이선스 키(포털, 개발용 무료→상용 KPE Standard 무료) — P4/파일럿.
- 앱 서명 keystore(사내 표준, `keytool` 생성 절차) — 서명 빌드.
- 서버 인프라: 도메인·HTTPS는 **사내 리버스 프록시/LB**(TLS 종단), 서버는 그 뒤 HTTP:3000(TRUST_PROXY) — 배포.
- Firebase 프로젝트: `google-services.json`(앱, feat/p4-knox `app/`) + 서비스계정 JSON(서버, `FIREBASE_SERVICE_ACCOUNT`) — 실 FCM(벨울리기).
- 위치정보 수집 동의 문구 법무 검토본(위치정보보호법) — 배포 전, 서버 설정으로 교체 가능(정의서 §8).
- 삼성 실기기(파일럿 10~20대, 렌탈 패드 동일 모델 권장) — 파일럿.
각 항목에 "완료 기준" 체크박스. Phase 타임라인 표.

- [ ] **Step 4: 커밋**

```bash
git add docs/ap-map-template.csv docs/p5-prerequisites.md
git commit -m "docs(pilot): AP-map CSV template + human prerequisites checklist"
```

---

## Task 4: 배포 런북 (docs/p5-deployment.md)

**Files:**
- Create: `docs/p5-deployment.md`

**Interfaces:**
- Consumes: Dockerfile/compose(Task 1,2), P1 서버 스크립트, P3 대시보드 빌드, P4 knox 빌드.

- [ ] **Step 1: docs/p5-deployment.md 작성 — 서버**

- `.env.prod.example`→`.env.prod` 복사, 강한 `JWT_SECRET`(`openssl rand -hex 32`)·`POSTGRES_PASSWORD` 설정, Firebase 서비스계정 배치.
- `docker compose -f docker-compose.prod.yml up -d --build` → DB healthy 후 server 기동(시작 시 마이그레이션 자동).
- 초기 관리자: `docker compose -f docker-compose.prod.yml exec server node dist/db/seed-cli.js <username> <password> admin` (또는 로컬 `pnpm seed:admin`).
- 사내 리버스 프록시 뒤: 프록시가 HTTPS 종단, `/`·`/api`를 server:3000으로 프록시, `X-Forwarded-For/Proto` 전달, `TRUST_PROXY=true`. `/health` 확인.
- 운영: 무응답 기기(`GET /api/admin/alerts/stale`)·retention 배치(일 1회 03:00 로그)·배터리 모니터링, `pg_dump` 백업(cron), 로그.

- [ ] **Step 2: 대시보드 배포 섹션**

- `dashboard/`(feat/p3-dashboard): `VITE_API_BASE_URL` 설정(예: 서버와 동일 오리진이면 `/api`) → `npm ci && npm run build` → `dist/`를 사내 정적 호스팅 또는 리버스 프록시 `/`에 배포. `/api`는 서버로 프록시.

- [ ] **Step 3: 앱 서명 빌드 섹션 (스니펫 안내)**

feat/p4-knox `app/build.gradle.kts`에 추가할 release signingConfig 스니펫(문서로):
```kotlin
// local.properties 에서 keystore 정보 로드 (커밋 금지)
val ks = Properties().apply { rootProject.file("local.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) } }
android {
  signingConfigs {
    create("release") {
      storeFile = ks.getProperty("KEYSTORE_FILE")?.let { file(it) }
      storePassword = ks.getProperty("KEYSTORE_PASSWORD")
      keyAlias = ks.getProperty("KEY_ALIAS")
      keyPassword = ks.getProperty("KEY_PASSWORD")
    }
  }
  buildTypes { getByName("release") { signingConfig = signingConfigs.getByName("release"); isMinifyEnabled = false } }
}
```
- keystore 생성: `keytool -genkeypair -v -keystore pad.keystore -alias pad -keyalg RSA -keysize 2048 -validity 10000`.
- `local.properties`에 `KEYSTORE_FILE/PASSWORD`, `KEY_ALIAS/PASSWORD`, `KPE_LICENSE_KEY`, `google-services.json` 배치(전부 커밋 금지).
- `./gradlew :app:assembleKnoxRelease` → 서명 APK → 패드 배포(MDM/수동).

- [ ] **Step 4: 커밋**

```bash
git add docs/p5-deployment.md
git commit -m "docs(pilot): deployment runbook (server + dashboard + signed app)"
```

---

## Task 5: 파일럿 런북 + 최종 DoD (docs/p5-pilot-runbook.md)

**Files:**
- Create: `docs/p5-pilot-runbook.md`

**Interfaces:**
- Consumes: 전 산출물 + 정의서 §7 수용 기준.

- [ ] **Step 1: docs/p5-pilot-runbook.md 작성**

파일럿(10~20대) 순서:
1. **준비물 완료**(`docs/p5-prerequisites.md` 전부 ✅).
2. **서버 배포**(`docs/p5-deployment.md`) + 초기 관리자.
3. **AP 매핑 적재**: WLC/AP 콘솔에서 BSSID→구역 확보 → `docs/ap-map-template.csv` 형식으로 작성 → 대시보드 AP매핑 화면 업로드(또는 `PUT /api/admin/ap-map`).
4. **앱 서명 빌드**(`assembleKnoxRelease`) → 각 패드 설치.
5. **패드 설정**(각 대): Device Admin 활성화 + Knox 라이선스 활성화(`docs/knox-device-test.md` 체크리스트) → 앱에서 사번 등록 + 위치정보 동의.
6. **대시보드 검증**: 이름/사번 검색 → 현재 사용자·실내위치·마지막 보고·배터리 확인, 벨울리기, 상세 지도.
7. **1주 모니터링**: 주기 보고 도달, 무응답 기기, 배터리, retention.
8. **수용 기준 측정**(정의서 §7): ① 관리자 검색→10초 내 마지막 위치·사용자, ② 벨 울리기 도달률(Wi-Fi 연결 기기) 95%+, ③ 실내위치(층 단위) 정확도 90%+, ④ 사용자 임의 앱 삭제 불가. 각 기준 측정 방법·기록 표.
- **MAC 고정**: KSP 프로파일(정의서 §9 KBA-358) — 사내 SSID MAC 랜덤화 해제(관리자 설정).
- **롤백/이슈 대응**: 라이선스 실패 코드표 참조(`docs/knox-device-test.md`), 서버 롤백(compose 이전 이미지), 데이터 백업.

- [ ] **Step 2: 최종 DoD 검증**

Run:
```bash
cd /f/MyWorkSpace/FindMyPad
docker build -t pad-tracker-server . && echo "BUILD OK"
cp .env.prod.example .env.prod && docker compose -f docker-compose.prod.yml config >/dev/null && echo "COMPOSE OK" && rm -f .env.prod
head -1 docs/ap-map-template.csv   # bssid,building,floor,zone,note 확인
```
Expected: BUILD OK + COMPOSE OK + 헤더 정합. 문서 4종 교차참조(knox-device-test, ap-map 엔드포인트, env 키, §7 수용기준) 정확 확인.

- [ ] **Step 3: 최종 커밋**

```bash
git add docs/p5-pilot-runbook.md
git commit -m "docs(pilot): pilot runbook (10-20 pads) + acceptance criteria; P5 DoD complete"
```

---

## Self-Review (스펙 대비 커버리지)

| 스펙 §3 산출물 | 태스크 |
|---|---|
| Dockerfile + .dockerignore | 1 |
| docker-compose.prod.yml + .env.prod.example | 2 |
| docs/ap-map-template.csv | 3 |
| docs/p5-prerequisites.md | 3 |
| docs/p5-deployment.md (+ 서명 스니펫) | 4 |
| docs/p5-pilot-runbook.md | 5 |

| 스펙 §7 검증(DoD) | 태스크 |
|---|---|
| docker build 성공 | 1, 5 |
| compose config 유효 | 2, 5 |
| AP CSV 헤더 정합 | 3, 5 |
| 문서 완비·일관 | 3,4,5 |

**미해결/주의:**
- 실제 프록시 배포·서명 키·Firebase 키·실기기 설치·파일럿 운영·수용 기준 측정은 **사람 게이트** — 문서가 절차 안내.
- Dockerfile 런타임 마이그레이션은 `dist/db/migrate.js` + `server/src/db/migrations/` 폴더 존재에 의존(§Global Constraints). 빌드 실패 시 tsconfig include/복사 경로 조정.
- `.env.prod`(검증용 임시)·keystore·서비스계정 커밋 금지 — 각 커밋 후 `git status` 확인. 루트 `.gitignore`에 `.env.prod` 없으면 추가.
- 앱 서명 스니펫·대시보드 호스팅은 문서 안내(설정은 각 브랜치 후속).

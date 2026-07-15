# P5 — 배포 런북 (서버 · 대시보드 · 서명 앱)

> 파일럿(10~20대) 배포에 필요한 실행 절차. 코드/설정 산출물(Dockerfile, `docker-compose.prod.yml`,
> `.env.prod.example`)은 이미 `main`에 있다(P5 Task 1~2). 이 문서는 **그 산출물을 실제로 배포하는
> 순서**를 다룬다. 사람 준비물(계정·keystore·법무 검토 등)은 `docs/p5-prerequisites.md` 참고 — 이
> 문서는 그 준비물이 갖춰졌다는 전제로 배포 절차만 다룬다.

---

## 1. 서버 배포

### 1.1 환경변수 준비

```bash
cp .env.prod.example .env.prod
```

`.env.prod`는 **커밋 금지**(`.gitignore`의 `.env.*` / `!.env.prod.example` 규칙으로 이미 보호됨).
다음 값을 반드시 강한 값으로 교체 — `.env.prod.example`의 `CHANGE_ME` 플레이스홀더를 그대로 두고
배포하지 않는다:

| 키 | 생성 방법 | 비고 |
|---|---|---|
| `JWT_SECRET` | `openssl rand -hex 32` | 세션 토큰 서명. 최소 16자(서버 `EnvSchema` 검증), 파일럿은 32바이트 hex 권장 |
| `POSTGRES_PASSWORD` | `openssl rand -hex 24` 등 강한 랜덤 값 | `DATABASE_URL`의 비밀번호와 반드시 일치시킬 것 |

`DATABASE_URL=postgres://pad:<POSTGRES_PASSWORD와 동일값>@db:5432/padtracker` — 사용자명(`pad`)·DB명
(`padtracker`)은 `POSTGRES_USER`/`POSTGRES_DB`와 일치해야 한다. `FIREBASE_SERVICE_ACCOUNT`가 가리키는
경로(기본값 `/run/secrets/firebase-service-account.json`)에 Firebase 서비스계정 JSON을 배치한다
(발급 절차는 `docs/p5-prerequisites.md` §5). `TRUST_PROXY=true`, `PORT=3000`은 기본값 그대로 둔다
(§1.4 참고).

### 1.2 기동

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

> **`--env-file .env.prod`를 반드시 붙인다.** `docker-compose.prod.yml`의 `server` 서비스는
> `env_file: .env.prod`로 **컨테이너 내부 프로세스**에 환경변수를 주입하지만, 이것만으로는 Compose가
> `db` 서비스의 `environment:` 블록(`${POSTGRES_USER}`/`${POSTGRES_PASSWORD}`/`${POSTGRES_DB}`)과
> healthcheck(`pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}`)에서 쓰는 **Compose 변수 보간**은
> 채워지지 않는다. `env_file:`은 컴포즈 파일 파싱 시점이 아니라 컨테이너 생성 시점에 적용되기
> 때문이다. `--env-file`을 빠뜨리면 이 변수들이 빈 문자열로 해석되어 **Postgres가 빈 자격증명으로
> 기동**(또는 healthcheck가 영구히 실패)한다. `docker compose ... config`로 실제 보간 결과를 확인해
> `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB`가 비어 있지 않은지 사전 점검할 수 있다.

기동 순서: `db`가 `healthcheck`(`pg_isready`) 통과 후 `server`가 시작한다
(`depends_on: db: condition: service_healthy`). **마이그레이션은 별도로 실행할 필요가 없다** —
`Dockerfile`의 `CMD`가 `node dist/db/migrate.js && node dist/server.js`이므로 서버 컨테이너 시작 시
자동으로 적용된다. 상태 확인:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml ps
docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f server   # 마이그레이션 로그 확인
curl -f http://localhost:3000/health   # {"status":"ok"}
```

이후 이 문서의 모든 `docker compose` 명령은 `--env-file .env.prod -f docker-compose.prod.yml`을
동일하게 붙인다.

### 1.3 초기 관리자 계정 시딩

컨테이너에는 **프로덕션 의존성만** 설치돼 있다(`Dockerfile` runtime 스테이지가
`pnpm install --frozen-lockfile --prod`) — `tsx`가 없으므로 `pnpm seed:admin`(내부적으로
`tsx server/src/db/seed-cli.ts` 실행)은 **컨테이너 안에서 실패한다**. 컴파일된 산출물을 직접
실행한다:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml exec server \
  node dist/db/seed-cli.js <username> <password> admin
```

로컬(호스트) 환경에서 `pnpm install`로 devDependencies(`tsx` 포함)까지 설치돼 있고 로컬에서 DB에
직접 접근 가능한 경우에는 `pnpm seed:admin -- <username> <password> admin`로 동일한 작업을 수행할
수 있다 — 이건 **로컬 실행 시에만** 유효하며, 컨테이너 exec에는 쓰지 않는다(위와 같은 이유로 실패).

### 1.4 사내 리버스 프록시 뒤 배포

이 이미지는 TLS를 종단하지 않는다. `docker-compose.prod.yml`은 `server`를 호스트의 `3000:3000`으로
노출할 뿐이고, 실제 HTTPS 종단과 도메인 라우팅은 **사내 리버스 프록시/LB**(Nginx, ALB 등)가 맡는다
(준비물: `docs/p5-prerequisites.md` §4). 프록시 설정 요건:

1. `https://padtracker.internal.company.com/` (또는 발급받은 실제 도메인)의 TLS 인증서를 종단.
2. `/`와 `/api`를 컨테이너 호스트의 `server:3000`으로 프록시(대시보드 정적 파일도 같은 오리진의 `/`에
   서빙하는 경우 §2 참고 — `/api`만 서버로, 나머지는 대시보드 `dist/`로 라우팅).
3. `X-Forwarded-For`, `X-Forwarded-Proto` 헤더를 프록시가 전달하도록 설정.
4. 서버 쪽 `.env.prod`의 `TRUST_PROXY=true`(이미 `.env.prod.example` 기본값)로 위 헤더를 신뢰하게
   한다 — `server/src/app.ts`의 `buildApp`이 `Fastify({ logger: false, trustProxy: deps.config.TRUST_PROXY })`로
   이를 사용해 기기 보고(`reports`)의 `public_ip`를 프록시 IP가 아닌 **실제 클라이언트 IP**로 기록한다.
   `TRUST_PROXY`가 `false`(또는 프록시가 헤더를 전달하지 않음)면 모든 요청이 프록시의 IP로 잘못 기록된다.

Nginx 예시(참고용 — 사내 표준 프록시 설정을 우선):

```nginx
location /api/ {
  proxy_pass http://server:3000/api/;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
location /health {
  proxy_pass http://server:3000/health;
}
```

> `server:3000`은 리버스 프록시 컨테이너가 **compose 네트워크 내부**에 있을 때만 resolve된다(compose
> 서비스 DNS 이름). §1.4에서 다루는 **사내(외부) 리버스 프록시** 케이스처럼 프록시가 compose 네트워크
> **밖**에 있다면(그래서 `server`를 호스트 포트 `3000:3000`으로 노출하는 것) `proxy_pass`는 대신 도커
> 호스트의 주소/호스트명과 노출된 포트를 가리켜야 한다(예: `http://<docker-host>:3000/api/`) —
> `server:3000` 형태를 그대로 쓰면 프록시가 이름을 resolve하지 못한다.

배포 완료 확인: 프록시를 통해 `https://<도메인>/health` → `{"status":"ok"}`, 그리고 아무 기기든
보고를 하나 발생시킨 뒤 DB의 `reports.public_ip`(또는 관리자 기기 상세 화면)가 프록시 IP가 아닌
실제 클라이언트 공인 IP로 기록됐는지 확인한다(`docs/p5-prerequisites.md` §4 완료 기준과 동일).

### 1.5 운영(모니터링 · 백업 · 로그)

**모니터링**

- **무응답 기기(stale devices)**: `GET /api/admin/alerts/stale?days=<N>`(관리자 인증 필요, 기본
  `days`는 `STALE_DAYS` env, 기본 7일) — `server/src/routes/admin/alerts.ts`. 대시보드 또는
  `curl`/모니터링 스크립트로 주기 조회해 며칠간 보고가 없는 기기를 확인한다. 서버는 이 스캔을
  **매일 09:00에도 자동 실행**하지만(`server/src/jobs/scheduler.ts`) 그 결과는 알림 발송 없이
  **로그에만 기록**되므로(`stale devices: N`), 실제 대응(연락·회수)은 이 API를 대시보드에서 조회하거나
  서버 로그를 관제하는 사람이 트리거해야 한다.
- **retention 배치**: 매일 03:00에 `RETENTION_DAYS`(기본 90일)보다 오래된 보고(`reports`)를 자동
  삭제(`purgeOldReports`, `server/src/jobs/scheduler.ts`). 별도 cron 설정 불필요 — 서버 프로세스
  내장 스케줄러(`node-cron`)가 컨테이너 기동 중 자동 실행한다. 로그에서
  `retention purged N reports`로 실행 여부를 확인할 수 있다.
- **배터리**: 관리자 기기 목록/상세 API(`GET /api/admin/devices`, `GET /api/admin/devices/:id`)의
  `batteryPct` 필드(최근 보고 기준)를 대시보드에서 주기 확인. 별도 알림 배치는 없음 — 파일럿 기간
  중 대시보드 목록을 육안 점검하거나, 필요 시 위 stale 알림과 동일한 패턴으로 배터리 임계치 스캔을
  후속 추가할 수 있다(P5 범위 밖).

**백업**

`pgdata` 볼륨(named volume, `docker-compose.prod.yml`)에 실 데이터가 있다. `pg_dump`를 호스트
cron(또는 사내 백업 인프라)으로 매일 실행:

```bash
# 호스트 crontab (예: 매일 02:30, retention 03:00 실행 전)
30 2 * * * docker compose --env-file /path/to/.env.prod -f /path/to/docker-compose.prod.yml \
  exec -T db pg_dump -U pad padtracker | gzip > /backup/padtracker_$(date +\%Y\%m\%d).sql.gz
```

`pad`/`padtracker`는 `.env.prod`의 `POSTGRES_USER`/`POSTGRES_DB`와 일치시킨다(위 백업 커맨드도 이
값에서 온 것 — 다르게 설정했다면 `-U`/DB명을 맞춰야 한다). 백업 파일은 `/backup`(사내 백업 스토리지
마운트) 등 컨테이너/repo 외부에 보관하고, 오래된 백업은 별도 로테이션 정책으로 정리한다. 복구는 다른
`docker compose` 명령과 동일하게 `--env-file .env.prod -f docker-compose.prod.yml`을 반드시 포함해야
한다(생략하면 repo의 DEV `docker-compose.yml`을 기본으로 사용하는데, 거기에도 `db` 서비스가 있어
잘못된 스택을 대상으로 하게 된다):

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < dump.sql
```

(gzip 해제 후 실행)

**로그**

`docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f server` / `logs -f db`로
확인. 컨테이너 재시작 시 로그가 유실되지 않도록 사내 로그 수집기(예: journald, ELK 등)로 컨테이너
stdout을 전달하는 것을 권장(사내 표준에 따름 — 이 문서는 compose 기본 로그드라이버 사용을 전제).

---

## 2. 대시보드 배포

대시보드(`dashboard/`)는 **`feat/p3-dashboard` 브랜치**에 있다(`main`/`feat/p5-pilot-prep`에는
코드 없음) — 배포 전 해당 브랜치를 체크아웃하거나 머지해야 한다.

```bash
git checkout feat/p3-dashboard   # 또는 main에 머지된 이후 커밋
cd dashboard
```

`VITE_API_BASE_URL` 설정(빌드 시 환경변수 — `.env.production` 또는 빌드 커맨드에 인라인):

- 대시보드와 서버를 **동일 오리진**(같은 도메인, 리버스 프록시가 `/`와 `/api`를 함께 라우팅)으로
  서빙하는 경우: `VITE_API_BASE_URL=/api`.
- 별도 오리진으로 서빙하는 경우: 서버의 전체 URL(예: `https://padtracker.internal.company.com/api`).

빌드:

```bash
npm ci
VITE_API_BASE_URL=/api npm run build
```

`dist/`가 산출된다. 이를 사내 정적 호스팅(S3+CDN, Nginx 정적 서빙 등) 또는 §1.4의 리버스 프록시가
`/`로 서빙하도록 배치한다. `/api`는 §1.4대로 서버(`server:3000`)로 프록시되어야 대시보드가 API를
호출할 수 있다. 정적 파일 서빙 시 SPA 라우팅(존재하지 않는 하위 경로 → `index.html` 폴백) 설정을
빠뜨리지 않는다(사내 표준 정적 호스팅/프록시 설정에 따름).

배포 확인: `https://<도메인>/`에서 관리자 로그인 화면이 뜨고, 로그인 후 기기 목록 API 호출이
성공(네트워크 탭에서 `/api/admin/...` 200 확인)하는지 점검.

---

## 3. 앱 서명 빌드

앱(`android-agent/`)의 Knox 통합은 **`feat/p4-knox` 브랜치**에 있다. release `signingConfig` 실배선
자체는 이 태스크 범위 밖(그 브랜치의 후속 작업)이며, 아래는 그 브랜치의 `app/build.gradle.kts`에
추가할 스니펫과 서명 절차 안내다.

### 3.1 keystore 생성

준비물(`docs/p5-prerequisites.md` §3)이 아직이면 먼저 생성:

```bash
keytool -genkeypair -v -keystore pad.keystore -alias pad -keyalg RSA -keysize 2048 -validity 10000
```

생성된 `.keystore` 파일과 비밀번호는 **절대 커밋하지 않는다**(`.gitignore`의 `*.keystore`,
`*.jks`, `android-agent/local.properties`로 이미 보호됨). 안전한 사내 시크릿 저장소에 백업 보관 —
분실 시 이후 업데이트를 기존 설치본에 배포할 수 없다.

### 3.2 `local.properties`

`android-agent/local.properties`(gitignored, 커밋 금지)에 다음 키를 채운다:

```properties
KEYSTORE_FILE=/absolute/path/to/pad.keystore
KEYSTORE_PASSWORD=<store password>
KEY_ALIAS=pad
KEY_PASSWORD=<key password>
KPE_LICENSE_KEY=<Knox Platform for Enterprise 라이선스 키>
```

추가로 `android-agent/app/google-services.json`(gitignored)을 배치 — Firebase 프로젝트에서 발급
(`docs/p5-prerequisites.md` §5). 이 파일이 있어야 `google-services` 플러그인이 적용되고 실제 FCM
푸시(벨울리기 등)가 동작한다.

### 3.3 release `signingConfig` (`app/build.gradle.kts`에 추가)

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

### 3.4 빌드 및 배포

```bash
cd android-agent
./gradlew :app:assembleKnoxRelease
```

산출물: `android-agent/app/build/outputs/apk/knox/release/app-knox-release.apk`(서명된 APK, 정확한
경로는 flavor/buildType 조합에 따라 다를 수 있음 — `gradlew` 출력의 `BUILD SUCCESSFUL` 로그에서
실제 산출 경로 확인). 파일럿 기기(10~20대)에 배포:

- **MDM 사용 시**: 사내 MDM(Knox Manage 등)으로 APK 푸시.
- **수동 설치 시**: `adb install -r app-knox-release.apk`(기기별 반복) 또는 사내 배포 채널(사내
  앱스토어 등)에 업로드.

배포 전 `docs/knox-device-test.md`(`feat/p4-knox` 브랜치) 체크리스트로 최소 1대에서 라이선스
활성화·Device Admin·MAC 랜덤화 해제(KSP 프로파일)를 검증했는지 확인한다.

---

## 4. 관련 문서

- `docs/p5-prerequisites.md` — 이 런북이 전제하는 사람 준비물(keystore, Firebase, 도메인/HTTPS,
  Knox 계정·KPE 키, 법무 검토, 실기기) 체크리스트.
- `.env.prod.example` — 서버 프로덕션 env 키 전체 목록·설명.
- `docker-compose.prod.yml` — `server`+`db` 서비스 정의(§1의 명령이 참조).
- `Dockerfile` — 멀티스테이지 빌드, 런타임 CMD(`migrate.js && server.js`).
- `docs/knox-device-test.md`(`feat/p4-knox` 브랜치) — 서명 APK 설치 전 라이선스/기기 검증 체크리스트.
- `docs/p5-pilot-runbook.md` — 이 배포 이후의 파일럿 실행 순서 + 수용 기준.

# P5 — 파일럿 준비 패키지 설계 (spec)

> **Phase**: P5. 10~20대 파일럿을 위한 배포·운영 준비. 대부분 사람 준비물(서명 키·인프라·법무·실기기·KPE 키)이라, 자동화 산출물 = **서버 프로덕션 설정 + 문서·체크리스트·템플릿**. 검증 가능한 부분(Docker 빌드)은 실제 검증, 나머지는 사람 게이트.
> **완료 기준**: `docker build`로 서버 이미지 빌드 성공 + `docker compose -f docker-compose.prod.yml config` 유효 + AP CSV 템플릿이 P1 ap-map 파서 헤더와 일치 + 문서 4종 완비.
> **선행 문서**: 「구현 정의서」 §0·§5(P5)·§7·§8, 「개발 실행 설계서」(2026-07-10), P1~P4 완료.
> **작성일**: 2026-07-15

---

## 1. 목표 & 범위

파일럿(10~20대) 실행에 필요한 배포·운영 자산을 갖춘다. 코드는 P1~P4로 완료됐고, P5는 그것을 **실제 배포·운영**하기 위한 설정과 문서다.

**범위(In) — main 브랜치**
- 서버 프로덕션 설정: `Dockerfile`, `docker-compose.prod.yml`, `.env.prod.example`.
- AP 매핑 CSV 템플릿 + 적재 절차.
- 문서 4종: 사람 준비물 체크리스트, 배포 런북, 파일럿 런북, (앱 서명 설정 스니펫 안내 포함).

**범위 밖(Out — 사람/인프라 게이트)**
- 실제 서명 키(keystore) 생성·서버 인프라(도메인·HTTPS·리버스 프록시)·Firebase 서비스계정·위치정보 동의 법무본·삼성 실기기·KPE 키 — 정의서 §0 사람 준비물.
- **앱 release signingConfig 실배선**은 앱 브랜치(feat/p4-knox) 소관 → P5는 **문서로 스니펫 안내**(설정 추가는 후속, 앱 브랜치에서).
- 대시보드 프로덕션 호스팅 이미지 — 정적 빌드(`vite build`)를 사내 표준 정적 호스팅/프록시로 서빙하도록 **문서 안내**(별도 이미지 미포함).
- 실제 프록시 배포·서명·설치·파일럿 운영·수용 기준 측정 — 사람.

## 2. 결정 사항 (brainstorming 확정)

| 항목 | 결정 |
|---|---|
| 배치 | 문서 중심 + main에 서버 prod 설정. Base = main |
| HTTPS 종단 | **사내 리버스 프록시 뒤** — 서버는 HTTP:3000, `TRUST_PROXY=true`, HTTPS는 사내 인프라(문서 안내) |
| 서버 이미지 | Node 20 멀티스테이지 Dockerfile(pnpm 빌드 → dist 런타임), 시작 시 마이그레이션 |
| prod compose | server + postgres(named volume), 리버스 프록시 미포함(사내) |
| 앱 서명 | 문서 스니펫 안내(feat/p4-knox에 후속 배선) |
| 대시보드 | `vite build` 정적 산출물 → 사내 정적 호스팅(문서) |

## 3. 산출물 구조 (main에 추가)

```
FindMyPad/
├── Dockerfile                       # (신규) 서버 프로덕션 이미지
├── docker-compose.prod.yml          # (신규) server + postgres
├── .env.prod.example                # (신규) 프로덕션 env 템플릿
├── .dockerignore                    # (신규) node_modules/dist 등 제외
└── docs/
    ├── ap-map-template.csv          # (신규) AP 매핑 CSV 템플릿
    ├── p5-prerequisites.md          # (신규) §0 사람 준비물 체크리스트
    ├── p5-deployment.md             # (신규) 배포 런북(서버·대시보드·앱)
    └── p5-pilot-runbook.md          # (신규) 파일럿(10~20대) 런북 + 수용 기준
```

## 4. 서버 프로덕션 설정

### 4.1 Dockerfile (멀티스테이지)
- **builder**: `node:20-slim`(또는 alpine), pnpm 활성화(corepack), `pnpm install --frozen-lockfile`, `pnpm build`(tsc → dist).
- **runtime**: `node:20-slim`, prod 의존성 + `dist/` + 마이그레이션 실행에 필요한 것(`server/src/db/migrations`, `tsx`, `drizzle-orm/pg`, `tsconfig`) 복사. 비루트 유저. 엔트리: 마이그레이션 후 `node dist/server.js`.
  - 마이그레이션: `pnpm db:migrate`(`tsx server/src/db/migrate.ts` — 상대경로 `./server/src/db/migrations` 참조)를 런타임에 실행하려면 tsx + ts 소스 + migrations 폴더가 이미지에 있어야 함. → 런타임 스테이지에 해당 파일 포함(또는 entrypoint 스크립트 `db:migrate && start`).
- `PORT`(기본 3000) 노출.

### 4.2 docker-compose.prod.yml
- `db`(postgres:16-alpine, named volume, healthcheck), `server`(위 이미지 build, `env_file: .env.prod`, `depends_on: db healthy`, `restart: unless-stopped`, `ports: "3000:3000"`, 자체 healthcheck `/health`). 리버스 프록시·HTTPS는 사내(문서).

### 4.3 .env.prod.example
`DATABASE_URL`, `JWT_SECRET`(강한 값 필수), `FIREBASE_SERVICE_ACCOUNT`(서비스계정 JSON 경로/내용 — P2/실 FCM), `RETENTION_DAYS=90`, `STALE_DAYS=7`, `CORP_SSIDS`, `TRUST_PROXY=true`, `PORT=3000`. 강한 `JWT_SECRET` 생성 안내(placeholder 거부).

## 5. AP 매핑 템플릿

`docs/ap-map-template.csv` — P1 ap-map 파서 헤더와 정확히 일치:
```
bssid,building,floor,zone,note
AA:BB:CC:DD:EE:01,본관,3,동측,정문 근처
AA:BB:CC:DD:EE:02,본관,3,서측,
AA:BB:CC:DD:EE:03,별관,1,로비,안내데스크
```
적재: 대시보드 **AP매핑 화면**에 붙여넣기 또는 `PUT /api/admin/ap-map {csv}`(Bearer). BSSID는 WLC/AP 관리 콘솔에서 확보.

## 6. 문서

- **`docs/p5-prerequisites.md`** — 정의서 §0 사람 준비물 체크리스트(발급처·절차·소요·담당): Knox 파트너 계정, KPE 라이선스 키(개발용 무료→상용 KPE Standard 무료), 앱 서명 keystore, 서버 인프라(도메인·HTTPS는 사내 리버스 프록시), Firebase 프로젝트+`google-services.json`(앱)+서비스계정(서버), 위치정보 수집 동의 문구 법무 검토본, 삼성 실기기(파일럿 대수). 각 항목 Phase 타임라인.
- **`docs/p5-deployment.md`** — 배포 런북:
  - 서버: `docker build` → `.env.prod` 작성(강한 JWT, Firebase 키) → `docker compose -f docker-compose.prod.yml up -d` → 마이그레이션 자동 → `seed:admin`으로 초기 관리자 → 사내 리버스 프록시 뒤(TRUST_PROXY, X-Forwarded-*, HTTPS 종단) → `/health` 확인.
  - 대시보드: `VITE_API_BASE_URL` 설정 → `npm run build` → `dist/`를 사내 정적 호스팅/프록시 `/`에 배포(예: 서버와 동일 오리진 또는 `/api` 프록시).
  - 앱: **release signingConfig 스니펫**(feat/p4-knox `app/build.gradle.kts`에 추가할 코드 — keystore는 `local.properties`, 커밋 금지) → `assembleKnoxRelease` → 서명 APK → 패드 배포(MDM/수동).
  - 운영: 모니터링(무응답 기기 `GET /admin/alerts/stale`·배터리·retention 배치 로그), 백업(`pg_dump` cron), 로그 수집.
- **`docs/p5-pilot-runbook.md`** — 파일럿(10~20대) 순서: 준비물(§0) 완료 → 서버 배포 → AP 매핑 적재 → 앱 서명 빌드 → 패드 설치(Device Admin 활성화 + Knox 라이선스 활성화 → `docs/knox-device-test.md` 참조) → 사번 등록/동의 → 대시보드 검증(검색·실내위치·벨울리기) → 1주 모니터링 → **수용 기준 측정(정의서 §7)**: ① 관리자 검색→10초 내 위치·사용자, ② 벨 도달률(Wi-Fi 연결) 95%+, ③ 실내위치(층 단위) 90%+, ④ 사용자 임의 앱 삭제 불가. MAC 고정은 KSP 프로파일(정의서 §9 KBA-358).

## 7. 검증 (DoD)

- **자동(이 세션)**:
  1. `docker build -t pad-tracker-server .` → 서버 이미지 빌드 성공(pnpm build 통과, dist 생성).
  2. `docker compose -f docker-compose.prod.yml config` → 유효(문법·env 참조).
  3. `docs/ap-map-template.csv` 헤더가 P1 ap-map 파서(`bssid,building,floor,zone,note`)와 일치.
  4. 문서 4종 완비·내부 일관(교차참조 정확: knox-device-test, ap-map 엔드포인트, env 키).
- **한계/사람 게이트**: 실제 프록시 배포·서명 키·Firebase 키·실기기 설치·파일럿 운영·수용 기준 측정은 사람. 문서로 안내.

## 8. 완료 기준 (Definition of Done)

1. `Dockerfile`로 서버 이미지가 빌드된다(`docker build` 성공).
2. `docker-compose.prod.yml`이 유효하고(config 통과) server+postgres·TRUST_PROXY·healthcheck·restart 구성.
3. `.env.prod.example`·`.dockerignore` 존재, 시크릿 하드코딩 없음(강한 JWT 안내).
4. `docs/ap-map-template.csv` 헤더 정합.
5. 문서 4종(prerequisites·deployment·pilot-runbook + 서명 스니펫) 완비, P1~P4 산출물·정의서 §7 수용 기준 교차참조 정확.

## 9. 자동화 수준 & 사람 게이트

**혼합.** 서버 이미지·compose·템플릿·문서는 자동 생성·검증(Docker 빌드). 실제 인프라·서명·법무·실기기·파일럿 운영은 사람 게이트 — 문서가 그 절차를 안내한다.

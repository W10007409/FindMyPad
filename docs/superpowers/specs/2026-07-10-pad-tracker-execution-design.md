# 렌탈 패드 위치추적 시스템 — 개발 실행 설계서 (superpowers 기반)

> **문서 성격**: 구현 정의서(§0~§9)를 "실제로 어떻게 개발할 것인가"로 옮긴 엔지니어링 실행 설계서.
> **핵심 질문**: superpowers 플러그인으로 이 시스템을 구현할 수 있는가? → 답: **P1~P3·P5는 Yes(자동 개발 가능), P4(Knox)는 실기기 검증 게이트가 있는 반자동.**
> **작성일**: 2026-07-10
> **선행 문서**: 「렌탈 패드 위치추적 시스템 구현 정의서」 (2026-07-10)

---

## 1. 요약 (Go 판정)

**Go.** 이 프로젝트는 superpowers 플러그인의 표준 흐름(brainstorming → writing-plans → TDD → verification → code-review)으로 개발 가능하다.

- **P1(서버+DB), P3(대시보드)** — 외부 하드웨어·라이선스 없이 **100% 자동 개발·검증** 가능. `docker compose up` + 자동화 테스트가 완료 기준이므로 Claude Code가 끝까지 스스로 검증한다.
- **P2(앱 dev 플레이버)** — Mock `DeviceControl`과 에뮬레이터로 앱 **전체 흐름을 자동 개발**. 단 FCM 벨울리기 실동작 확인에는 사람이 발급한 Firebase 키(`google-services.json`)가 필요하다.
- **P4(Knox 통합)** — Knox API는 **삼성 실기기 + 라이선스 활성화 후에만 동작**. 코드는 자동 작성하되, "라이선스 활성화·앱 삭제 차단·권한 무음부여·MAC 고정" 검증은 사람이 실기기에서 체크리스트로 수행하는 **반자동 게이트**다.

결정적 이점 하나: **`knoxsdk.jar`(API level 28, rev 5)가 이미 확보되어 있다** (`addon_knox_api_level_28_samsung_electronics/libs/knoxsdk.jar`). 정의서 §0 준비물 #2가 부분 해결된 상태다.

**리스크 톤**: 기술적 불확실성은 대부분 P4에 집중되어 있고, P1~P3은 잘 알려진 스택이라 낮다. 따라서 **P1→P2→P3을 먼저 완주해 가치를 조기 확인**하고, P4는 사람 준비물(§6)이 갖춰지는 시점에 착수하는 것이 최적이다.

---

## 2. superpowers 스킬 ↔ 작업 매핑

이 저장소에 설치된 superpowers 스킬을 프로젝트 작업에 매핑한다. **각 Phase는 독립된 spec → plan → 구현 사이클**로 돌린다.

| 단계 | 사용 스킬 | 이 프로젝트에서의 용도 |
|---|---|---|
| Phase 착수 | `superpowers:brainstorming` | Phase별 요구사항·설계 확정 후 spec 문서화 |
| 계획 수립 | `superpowers:writing-plans` | spec을 실행 가능한 단계별 구현 plan으로 분해 |
| 계획 실행 | `superpowers:executing-plans` | 체크포인트(리뷰 게이트)를 두고 plan 실행 |
| 구현 | `superpowers:test-driven-development` | 서버 REST API, 앱 비즈니스 로직 — 테스트 먼저 |
| 병렬화 | `superpowers:subagent-driven-development` / `dispatching-parallel-agents` | 서로 독립적인 엔드포인트/화면을 서브에이전트로 팬아웃 |
| 격리 | `superpowers:using-git-worktrees` | Phase·컴포넌트 작업을 워크트리로 격리(상위 F:/MyWorkSpace 오염 방지) |
| 완료 검증 | `superpowers:verification-before-completion` | "됐다"고 말하기 전 명령 실행·출력 확인 (증거 우선) |
| 코드 리뷰 | `superpowers:requesting-code-review` / `receiving-code-review` | 각 Phase 병합 전 리뷰 게이트 |
| 디버깅 | `superpowers:systematic-debugging` | 버그·테스트 실패·예기치 못한 동작 |
| 마무리 | `superpowers:finishing-a-development-branch` | Phase 브랜치 병합/PR/정리 결정 |

**운영 원칙**
- 정의서 §5의 "각 Phase를 독립 Claude Code 세션으로 수행" 지침과 정확히 일치한다. 매 세션은 `brainstorming`으로 열고 `verification-before-completion`으로 닫는다.
- P1~P3의 자동화 테스트는 Claude Code가 스스로 돌려 완료를 증명한다. P2의 FCM·P4의 Knox만 사람 확인이 필요하다.

---

## 3. Phase별 실행 설계

각 Phase에 대해 ① 산출물 ② 사람 선행 준비물 ③ superpowers 실행 흐름 ④ 완료(검증) 기준 ⑤ 자동화 수준을 명시한다.

### P1. 서버 + DB — *자동화 100%*

- **산출물**: `pad-tracker/` 모노레포 스캐폴드, `docker-compose.yml`(PostgreSQL), 스키마 마이그레이션(정의서 §3), 전체 REST API(정의서 §4.2), 유닛/통합 테스트.
- **사람 선행 준비물**: 없음. (로컬 Docker만 있으면 됨)
- **superpowers 실행 흐름**:
  1. `brainstorming` — 스택 확정(Fastify vs NestJS, 마이그레이션 도구, 테스트 컨테이너), 모노레포 위치 결정(§4 리스크 R7).
  2. `writing-plans` — 스키마 → 마이그레이션 → 각 엔드포인트(TDD) → 부가 로직(실내위치 조인, 무응답 배치) 순서로 plan.
  3. `test-driven-development` — 핵심 케이스부터: 이중 체크아웃 방지(409, `one_active_checkout_per_device` 유니크 인덱스), `ap_map` 조인, 무응답 감지, 디바이스 토큰 인증.
  4. `verification-before-completion` — `docker compose up` 후 통합 테스트 그린 확인.
- **완료 기준**: `docker compose up` → API 테스트 전부 통과(정의서 §5 P1). **사람 개입 불필요.**
- **자동화 수준**: **완전 자동.** 이 Phase가 이후 모든 조각의 계약(스키마·API)을 고정하므로 최우선.

### P2. 안드로이드 에이전트 앱 (dev 플레이버) — *자동화 高, FCM만 키 필요*

- **산출물**: Kotlin 앱 전체 흐름 — 온보딩(`EnrollmentActivity`) → 체크아웃/동의 → `ReportWorker`(15분 주기 보고) → FCM 벨울리기. `DeviceControl` 인터페이스 + `MockDeviceControl`. 빌드 플레이버 `knox`/`dev` 분리.
- **사람 선행 준비물**: Firebase 프로젝트 + `google-services.json`(§6 #4). FCM 실동작 확인에 필요.
- **superpowers 실행 흐름**:
  1. `brainstorming` — 앱 아키텍처(WorkManager 주기, Room 큐잉/재시도, 플레이버 소스셋 분리), `DeviceControl` 인터페이스 계약 확정.
  2. `writing-plans` — 인터페이스 → Mock 구현 → 각 화면/Worker → Retrofit 클라이언트(P1 API 계약 사용) → FCM 서비스.
  3. `test-driven-development` — 앱 로직(보고 큐잉/재시도, 체크아웃 상태머신)을 로컬 유닛 테스트로. Knox 경로는 `MockDeviceControl`로 대체.
  4. `verification-before-completion` — dev 플레이버로 에뮬레이터 E2E(에뮬레이터 mock location 사용). FCM 벨울리기는 키 투입 후 확인.
- **완료 기준**: 에뮬레이터에서 온보딩→체크아웃→주기보고→벨울리기 E2E 동작(정의서 §5 P2). **FCM 확인 지점만 사람/키 개입.**
- **자동화 수준**: **높음.** Mock 격리 덕분에 Knox 자산 없이 전체 흐름 개발·검증. FCM 실발송만 키 의존.

### P3. 관리자 대시보드 — *자동화 100%*

- **산출물**: React+Vite+TS. 화면 5종(검색 홈, 기기 상세+지도, 무응답 기기, AP 매핑 관리, 직원용 내 패드 찾기). 지도는 Leaflet(OSM), 지도 컴포넌트 추상화. `ap_map` 기반 실내위치 표시.
- **사람 선행 준비물**: 없음. (P1 API가 떠 있으면 됨)
- **superpowers 실행 흐름**:
  1. `brainstorming` — 정보구조·권한 분리(관리자 vs 직원용 간이 페이지) 확정.
  2. `writing-plans` → `subagent-driven-development` — 화면 5종은 대체로 독립적이라 서브에이전트 팬아웃에 적합.
  3. `verification-before-completion` — 브라우저에서 시나리오(검색→상세→벨울리기→AP매핑) 확인. Chrome 자동화 도구로 자체 검증 가능.
- **완료 기준**: 브라우저에서 시나리오 확인(정의서 §5 P3). **자체 검증 가능.**
- **자동화 수준**: **완전 자동.**

### P4. Knox 통합 — *반자동 (실기기 검증 게이트)*

- **산출물**: `KnoxDeviceControl` 구현(확보된 `knoxsdk.jar` 사용) — 라이선스 활성화, 앱 삭제 방지, 권한 무음 부여, MAC 랜덤화 비활성화, 실 시리얼 조회. `knox` 플레이버 빌드. `docs/knox-device-test.md` 수동 테스트 체크리스트.
- **사람 선행 준비물**: KPE 라이선스 키(§6 #3), 삼성 실기기(§6 #5), 앱을 기기 관리자로 활성화하는 최초 1회 탭.
- **superpowers 실행 흐름**:
  1. `brainstorming` — 확보된 jar(API 28, rev 5)의 실제 클래스 시그니처를 기준으로 §4.1.2 API 표를 검증·조정(디컴파일/`javap`로 시그니처 확인).
  2. `writing-plans` → 구현 → 컴파일 에러 기준 조정(정의서 §4.1.2 주의).
  3. `systematic-debugging` — 실기기에서 라이선스 브로드캐스트/권한 부여 실패 시.
  4. `verification-before-completion` — **사람이** 실기기 체크리스트 수행: 라이선스 활성화, 앱 삭제 차단, 권한 자동 부여, 재부팅 후 보고 재개, MAC 고정.
- **완료 기준**: 삼성 실기기에서 §7 Knox 경로 체크리스트 통과(정의서 §5 P4).
- **자동화 수준**: **반자동.** 코드는 자동, 검증은 사람+실기기. 여기가 유일한 하드 게이트.

### P5. 파일럿 준비 — *혼합*

- **산출물**: 서명 빌드 설정, 배포 문서, AP 매핑표 실데이터 적재 절차, 운영 가이드(`docs/`).
- **사람 선행 준비물**: keystore, 서버 인프라(DB·도메인·HTTPS), AP 매핑 실데이터, 위치정보 동의 문구 법무 검토본(§6 #8).
- **자동화 수준**: 문서·스크립트는 자동, 인프라·법무·서명은 사람.

---

## 4. 기술 리스크 & 대응

| # | 리스크 | 영향 | 대응 (설계 반영) |
|---|---|---|---|
| R1 | **Knox jar가 2019년/API 28 rev 5로 노후.** 최신 Knox 3.x와 API 시그니처 상이 가능 | P4 컴파일·동작 실패 | jar에서 실제 클래스 시그니처 확인(`javap`/디컴파일) 후 §4.1.2 표를 코드에 맞게 조정. 모든 Knox 호출을 `DeviceControl` 뒤로 격리해 서버·앱 나머지에 영향 없음 |
| R2 | **에뮬레이터에서 Knox API 미동작** | P2 개발 차단 위험 | `MockDeviceControl`(항상 성공, `ANDROID_ID`를 시리얼 대용) + `dev`/`knox` 플레이버 분리로 전 흐름을 에뮬레이터에서 개발 |
| R3 | **GPS 미탑재 → 네트워크 측위 정확도** | 실외 위치 정확도 저하 | 실내는 `ap_map`(BSSID→건물/층/구역) 조인이 1차 신뢰 소스. 네트워크 좌표는 보조. 수용 기준은 "층 단위 90%"(§7)로 이미 현실적 |
| R4 | **FCM 도달률**(벨울리기, Wi-Fi 연결 기기) | 찾기 기능 신뢰도 | high-priority FCM 메시지, `LOCATE_NOW`로 즉시 보고 병행. 수용 기준 95%(§7) 파일럿에서 측정 |
| R5 | **Android 10+ 백그라운드 위치·BSSID 조회에 위치 권한 필요** | 무음 수집 실패 | Knox `applyRuntimePermissions()`로 무음 부여(P4). dev 플레이버에서는 수동 권한 허용으로 대체 개발 |
| R6 | **MAC 랜덤화**로 WLC 연동 시 실 MAC 불일치 | (선택) WLC 연동 정확도 | `WifiPolicy`로 사내 SSID 랜덤화 비활성화(P4). WLC 연동 자체는 2차 범위 — 인터페이스만 정의 |
| R7 | **모노레포 위치**: 현재 `F:/MyWorkSpace`가 여러 프로젝트를 담은 상위 git repo. `FindMyPad/`는 그 하위 폴더 | 커밋 오염·워크플로 혼선 | **권장: `pad-tracker/`를 `FindMyPad/` 아래 독립 git 저장소로 초기화**(상위 repo와 분리). 최소한 워크트리(`using-git-worktrees`)로 격리. 첫 P1 brainstorming에서 확정 |
| R8 | **시크릿 유출**(KPE 키, `google-services.json`, 서비스 계정, JWT, DB URL) | 보안 사고 | 착수 즉시 `.gitignore`에 §6 시크릿 전부 등록. 키는 `local.properties`/환경변수 주입, 소스 하드코딩 금지 |
| R9 | **위치정보 법적 요건**(개인정보/위치정보보호법) | 배포 차단 | 체크아웃 동의 화면 필수·`consent_at` 기록·보유기간 90일 자동삭제 배치를 설계에 내장(정의서 §8). 문구는 서버 설정으로 관리해 법무본 교체 가능 |

---

## 5. 이번 세션 이후 권장 순서

```
[본 문서: 실행 설계]  ← 지금 여기
        │
        ▼
P1  server+DB    : brainstorming → writing-plans → TDD → verify   (Knox 불필요, 완전 자동)
        │  ← API·스키마 계약 고정
        ▼
P2  app(dev)     : Mock DeviceControl로 전 흐름   (FCM 키만 사람)
        │
        ▼
P3  dashboard    : P1 API 소비, 화면 5종         (완전 자동)
        │
        ▼
── 사람 준비물 게이트(§6 #1,#3,#5,#8) ──
        ▼
P4  Knox 통합    : 실기기 검증                    (반자동)
        ▼
P5  파일럿 준비
```

**다음 액션**: **P1(서버+DB) spec을 위한 `brainstorming` 세션 시작.** 그 세션에서 확정할 것 — ① 서버 프레임워크(Fastify vs NestJS) ② 마이그레이션/ORM 도구 ③ 모노레포를 독립 repo로 뗄지(R7) ④ 테스트 컨테이너 전략.

---

## 6. 사람 선행 준비물 체크리스트 (Phase 타임라인 매핑)

정의서 §0을 Phase 순서에 맞춰 재배열. **P1~P3 착수에는 준비물이 거의 없다.**

| # | 준비물 | 필요 Phase | 상태 |
|---|---|---|---|
| — | 로컬 Docker | P1 | 확인 필요 |
| 4 | Firebase 프로젝트 + `google-services.json` + 서비스 계정 키 | P2(FCM 확인) | ⬜ 필요 |
| 2 | `knoxsdk.jar` + support 라이브러리 | P4 | ✅ **확보됨** (`addon_knox_api_level_28_.../libs/knoxsdk.jar`, API 28 rev 5) |
| 1 | Knox 파트너 계정 | P4 이전 | ⬜ 필요 |
| 3 | KPE 라이선스 키(개발용 무료) | P4 | ⬜ 필요 |
| 5 | 삼성 실기기 1대+ (렌탈 패드 동일 모델 권장) | P4 | ⬜ 필요 |
| 6 | 사내 AP 매핑표 CSV (BSSID→건물/층/구역) | P3(표시)·P5(실데이터) | ⬜ 템플릿은 Claude Code가 생성 |
| 7 | 앱 서명 keystore, 서버 인프라(DB·도메인·HTTPS) | P5 | ⬜ 필요 |
| 8 | 위치정보 수집 동의 문구 법무 검토 | 배포 전 | ⬜ 필요 |

---

## 7. 참고

- 선행 구현 정의서 §1~§9 (아키텍처·데이터 모델·API·마일스톤·법적 요건).
- Knox SDK 문서·API 레퍼런스: 정의서 §9 링크 목록.
- 확보된 로컬 Knox 문서: `addon_knox_api_level_28_samsung_electronics/docs/reference/`.

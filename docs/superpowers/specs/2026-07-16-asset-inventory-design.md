# 자산 대장(개인별 지급 현황) 연동 설계 (spec)

> **성격**: P1~P5 이후 후속 기능. 사내 `개인별 패드 지급 현황.xlsx`(2,544대)를 시스템에 연동 — 시리얼↔자산번호↔지급자 관리, 시리얼 검색 시 대여자(지급자) 표시, 상시 추적.
> **브랜치 전략**(사용자 결정): 분리 유지 — 서버=feat/server-fcm-logger, 앱=feat/p4-knox, 대시보드=feat/p3-dashboard.
> **작성일**: 2026-07-16

## 결정 사항 (brainstorming)
1. **대여자 = 엑셀 지급자**. 시리얼↔자산번호↔지급대상자(소유자·사번·조직)를 inventory로 import. 검색 시 지급자를 대여자로 표시. 런타임 체크아웃은 보조.
2. **시리얼**: knox=`Build.getSerial()` 실시리얼 / dev·비-Knox=온보딩 수동 입력(자산번호/시리얼).
3. **상시 추적**: 포그라운드 서비스로 승격(지속 알림, 부팅 자동, 앱 미실행에도 보고).
4. **브랜치 분리 유지** → 컴포넌트별 구현.

## 엑셀 구조 (sheet "pad", 2,544행)
자산명(모델) · **자산번호**(고유) · SAP번호 · **제조번호(=시리얼, 고유)** · **소유자**(이름) · **사번** · 조직1명 · 조직2명 · 위치정보 · 상태 · 비고 · 지급일 · 최초생성일.

## 슬라이스 & 컴포넌트 설계

### 1차 — 서버 (feat/server-fcm-logger) [먼저]
- **테이블 `assets`**: `serial` TEXT PK · `asset_no` TEXT uniq · `sap_no` · `model` · `owner_name` · `owner_emp_no` · `org1` · `org2` · `location` · `status` · `issued_at` · `note`.
- **import**: Node 스크립트가 xlsx(exceljs)를 읽어 `assets` upsert(serial 충돌 시 갱신) + `users`(emp_no→name/dept=org2) upsert. 재실행 안전.
- **엔드포인트** `PUT /api/admin/assets` (관리자): JSON 행 배열 업서트(이후 갱신/대시보드 업로드용).
- **검색 강화** `GET /api/admin/devices?q=`: 매칭 대상에 assets(serial·asset_no·owner_name·owner_emp_no) 추가. 응답 항목에 `assetNo·model·owner{name,empNo,org1,org2}·issuedLocation` 포함. **미등록 자산도** 대장 기준으로 결과에 포함(enrolled=false 표시). enroll된 기기는 reports 기반 위치·배터리도 병합.
- 등록(enroll)은 시그니처 불변(시리얼 전송) — 서버가 assets와 serial로 매칭.

### 2차 — 앱 (feat/p4-knox)
- 온보딩에 시리얼 입력 UI(dev). knox는 Build.getSerial. 입력/조회한 시리얼로 enroll.

### 3차 — 앱 (feat/p4-knox)
- 포그라운드 서비스(ReportingService)로 주기 보고 승격. 지속 알림, BOOT 자동 시작.

### 대시보드 (feat/p3-dashboard)
- 검색/상세에 지급자(대여자)·자산번호·모델·조직·지급위치 표시. 시리얼·자산번호·이름·사번 검색.

## DoD (1차)
- `assets` 마이그레이션 + import 스크립트로 2,544행 적재.
- 검색이 시리얼/자산번호/이름/사번으로 지급자·자산정보 반환(신규 테스트 + 무회귀).
- 대시보드가 지급자·자산번호 표시. 실행 중 서버/대시보드로 시연.

## 자동화/게이트
서버·대시보드는 자동(테스트+실행 확인). 앱 시리얼 입력·포그라운드 서비스는 실기기 확인(2·3차).

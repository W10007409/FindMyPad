# 직원 포털 · 확장 텔레메트리 · IP/실내 위치 설계 (spec)

> **성격**: 자산 대장 연동(2026-07-16-asset-inventory) 이후 후속. 사번 기반 직원 로그인·권한 분리, 앱 수집 정보 확대, GPS 없는 패드의 IP/AP 위치, 관리자 기능 가이드.
> **브랜치 전략**: 분리 유지 — 서버=feat/server-fcm-logger, 앱=feat/p4-knox, 대시보드=feat/p3-dashboard.
> **작성일**: 2026-07-16

## 결정 사항 (brainstorming)
1. **로그인 대상**: 임포트된 전 직원(users 테이블 276명). 초기 비밀번호 `1234`, 최초 로그인 시 강제 변경.
2. **위치**: IP(이탈감지·대략 지역) + AP매핑(BSSID→건물·층, 실내 정밀) 병행. GPS는 없음(lat/lng는 계속 null).
3. **수집 범위**: 최대 — 배터리 상세, Wi-Fi 신호/링크, 내부/공인 IP, 저장공간, 부팅·가동시간, OS 버전, **주변 Wi-Fi 스캔 목록**.
4. **직원 권한**: 본인 소유(대장 ownerEmpNo=사번) 패드에 한해 조회 + 벨/위치요청. 무응답·AP매핑·자산업로드는 관리자 전용.

## 서브프로젝트 & 순서
A(인증/RBAC) → B(텔레메트리) → C(IP/실내 위치) → D(관리자 가이드). A가 나머지를 게이트하므로 먼저.

---

## A. 사번 로그인 + RBAC + 최초 비번 변경 (서버 + 대시보드)

### 데이터 모델 — 인증을 `users`로 단일화
`users`에 컬럼 추가: `password_hash text`, `must_change_password boolean default true`, `role text('admin'|'employee') default 'employee'`, `is_active boolean default true`.
- 마이그레이션 시 기존 users 전부 `password_hash=hash('1234')`, `must_change_password=true`, `role='employee'`, `is_active=true` 로 시드.
- 관리자 계정: `empNo='admin'` users 행 보장(role='admin'). 기존 `admin_users.root`는 유지하되 로그인은 users 경로로 통일(‘root’ 사번으로 admin 시드, must_change=false).
- `admin_users` 테이블은 남겨두되 신규 로그인 경로에선 미사용(후속 정리).

### 엔드포인트
- `POST /api/admin/login` — body `{ empNo, password }` (기존 `username`도 empNo로 허용). users 대상 검증. 응답 `{ token, mustChangePassword, role, name }`. JWT payload `{ sub: userId, role, empNo }`.
- `POST /api/auth/change-password` (인증 필요) — `{ currentPassword, newPassword }`. newPassword ≥ 4자, `1234` 금지. 성공 시 hash 갱신 + `must_change_password=false`.
- `requireAuth(roles)` preHandler를 users JWT 기준으로 재작성(기존 requireAdmin 대체/래핑). `req.user = { id, role, empNo }`.

### 자기 패드 스코핑
- 소유 판정: `assets.owner_emp_no = req.user.empNo`.
- `GET /api/admin/devices?q=` — role=employee면 결과를 본인 소유 자산(및 그 enrolled 기기)으로 제한. admin은 전체.
- `GET /api/admin/devices/:id` — employee는 본인 소유 기기만, 아니면 403.
- `POST .../ring`,`/locate` — employee는 본인 소유 기기만 허용, 아니면 403.
- 관리자 전용(role=['admin']): `/alerts/stale`, `PUT /ap-map`, `PUT /assets`.

### 대시보드
- 로그인 페이지: 라벨을 **사번 / 비밀번호**로. 응답의 mustChangePassword=true면 **비밀번호 변경 화면**으로 강제 이동(다른 라우트 접근 차단).
- 비밀번호 변경 화면: 현재(최초 1234) → 새 비번 2회. 완료 후 홈.
- 네비게이션: employee에겐 무응답·AP매핑 링크 숨김. admin은 전체.
- employee 홈: 검색 대신 **내 패드** 목록(본인 소유) 자동 표시. admin 홈은 기존 검색.
- JWT/역할은 로그인 응답으로 판단, localStorage에 role·mustChangePassword 저장.

### DoD(A)
- 마이그레이션 + 276명 시드(1234). 사번 로그인 성공. 최초 로그인 강제 변경 동작.
- employee 계정으로 타인 패드 접근 시 403, 본인 패드만 목록/상세/벨/위치.
- 관리자 전용 엔드포인트 employee 403. 기존 테스트 무회귀 + 신규 테스트.

---

## B. 확장 텔레메트리 (앱 + 서버 + 대시보드)

### 수집 항목 (추가 런타임 권한 없이 가능; 위치권한은 이미 부여)
- **배터리**(ACTION_BATTERY_CHANGED sticky): 레벨(기존), 상태(충전/방전/완충), 플러그(AC/USB/무선), 온도(℃), 건강, 전압(mV).
- **Wi-Fi 연결**(WifiManager.connectionInfo): SSID/BSSID(기존), RSSI(dBm), 링크속도(Mbps), 주파수(MHz), 내부 IP.
- **주변 Wi-Fi 스캔**(WifiManager.scanResults): `[{bssid, rssi, ssid, frequency}]` 목록 — 다중 AP 실내 측위 근거. `CHANGE_WIFI_STATE` 권한 추가 필요(startScan).
- **시스템**: OS 버전(RELEASE/SDK), 저장공간 free/total(MB, StatFs), 가동시간(elapsedRealtime, 초), 마지막 부팅 시각.
- **공인 IP**: 서버가 요청에서 취득(기존).

### 스키마 — `reports` 확장(모두 nullable, 하위호환)
`battery_status text`, `battery_plug text`, `battery_temp_c real`, `battery_health text`, `battery_voltage_mv int`, `wifi_rssi smallint`, `wifi_link_mbps smallint`, `wifi_freq_mhz int`, `local_ip text`, `storage_free_mb int`, `storage_total_mb int`, `os_version text`, `uptime_sec bigint`, `nearby_aps jsonb`(배열).

### API/앱
- `ReportRequest`에 위 필드 optional 추가. `SnapshotCollector` 확장(수집 실패 항목은 null). `ReportSnapshot`/`ReportBuilder` 대응.
- 스캔은 배터리 절약 위해 매 주기마다 강제 startScan하지 않고 캐시된 scanResults 사용(있으면). throttle 고려.

### 대시보드
- DeviceDetail 최근보고 표: 배터리(레벨·상태·온도), Wi-Fi(SSID·RSSI·링크), IP(내부/공인), 저장공간, OS, 가동시간 표시.
- **주변 AP** 접이식 목록(bssid·rssi·매핑된 위치가 있으면 건물/층).

### DoD(B)
- 마이그레이션 + 확장 필드. 앱이 최대 항목 수집·전송(실기기 확인). 대시보드 상세 표시. 무회귀.

---

## C. IP 기반 위치 + 실내(AP) 위치 (서버 + 대시보드)

### 설계 — 두 축
1. **네트워크 상태(공인 IP)**: 사내 egress IP(들)을 config로 등록(`CORP_PUBLIC_IPS`= CIDR/IP 콤마목록). 보고의 publicIp가 매칭이면 **사내망(정상)**, 아니면 **외부망(반출·이탈 의심)** + 원 IP 표시.
   - 대략 도시/지역: 선택적 오프라인 MaxMind GeoLite2(.mmdb) 파일이 있으면 city/region 조회, 없으면 IP만 표시. mmdb는 운영자 제공(gitignore). 사내망 환경상 외부 API 미사용.
2. **실내 위치(AP매핑)**: 보고의 BSSID(및 주변 스캔의 최강 신호 BSSID)를 `ap_map`으로 조회 → 건물·층·zone. 기존 `resolveIndoorLocation` 확장(주변 스캔 다중 BSSID 중 매핑 존재+RSSI 최강 우선).

### 엔드포인트/응답
- 상세 응답에 `network: { publicIp, onCorpNetwork: bool, city?, region? }`, `indoor: { building, floor, zone } | null`(기존 필드 확장).
- “지금 위치 요청”은 기존대로 즉시 보고 트리거. 보고 도착 후 상세에서 실내/네트워크가 갱신됨.

### 대시보드
- DeviceDetail “위치” 섹션: 
  - 실내: 건물·층·zone(AP매핑 있을 때) / 없으면 “실내 위치 미확인 — AP매핑 필요” 안내.
  - 네트워크: 배지 **사내망/외부망** + 공인 IP + (mmdb 있을 때) 도시. 
  - GPS 부재 설명 문구(“이 패드는 GPS가 없어 Wi-Fi/IP 기반으로 위치를 추정합니다”).

### DoD(C)
- CORP_PUBLIC_IPS 매칭으로 사내/외부 판정. AP매핑 있는 BSSID는 건물·층 표시. mmdb 없을 때도 정상 동작(IP만). 신규 테스트.

---

## D. 관리자 기능 가이드 (대시보드, 관리자 전용)

- **무응답 기기(stale)**: 페이지 상단 도움말 패널 — “최근 N일 이상 보고가 없는 패드. 방전·분실·반납 누락 점검용. 오래된 순 정렬.” 임계일수 입력 설명.
- **AP매핑**: 도움말 패널 — “각 Wi-Fi AP(BSSID)가 어느 건물·층·구역인지 등록하면 패드의 접속 AP로 실내 위치를 알 수 있습니다.” + **샘플 CSV**(bssid,building,floor,zone,note)와 단계 안내(‘어떻게 BSSID를 아나요’ → 패드 상세의 주변 AP 목록에서 확인 가능) + 현재 등록 건수.
- 두 메뉴는 employee에게 숨김(A의 네비 게이트) + 서버 관리자 전용(기존).

### DoD(D)
- 두 페이지에 친절한 설명·샘플·단계 안내 표시. employee 네비에서 비노출. 관리자만 접근.

---

## E. 대시보드 UI 세련화 (디자인 스킬 적용, 대시보드 전역)

기능 구현(A~D)과 병행/직후로 대시보드 시각 정체성을 정비. frontend-design 원칙 적용.

- **디자인 토큰**: 색(중립+악센트 4~6), 타이포(디스플레이/본문/데이터용), 간격 스케일을 CSS 변수/Tailwind 테마로 정의. 라이트/다크 모두 지원.
- **정보 설계(운영 UI)**: 요약 먼저→상세. 상태를 형태로 인코딩 — 배터리/온라인/무응답/사내망을 칩·상태줄·심각도 스트라이프로 한눈에. 의미색(정상/경고/위험)은 악센트와 분리.
- **레이아웃**: 카드/그리드·gap 기반, 테이블은 자체 overflow-x. 기기 상세는 상단 요약(대여자·자산·상태 배지) + 위치 섹션 + 최근보고 표 + 주변 AP.
- **컴포넌트 리프레시**: 검색/내 패드 카드, 상세 헤더, 무응답·AP매핑 도움말 패널, 로그인·비번변경 화면을 일관된 스타일로. 상호작용 요소는 상호작용처럼 보이게, 포커스 가시화, prefers-reduced-motion 존중.
- **카피**: 사용자 언어로(‘알림 설정’ 아닌 ‘무응답 기기’ 등). 능동태·명확한 버튼 라벨.
- 과도한 장식 지양 — 실용적 관리도구 톤(플래그십 히어로 불필요), 절제된 완성도.

### DoD(E)
- 토큰화된 팔레트/타이포, 라이트·다크 정상. 상태의 시각적 인코딩. 반응형(가로 스크롤 없음). 기존 기능·테스트 무회귀.

## 보안/PII
- users에 비밀번호 해시(scrypt) 저장. 최초 1234·강제 변경으로 계정 탈취 위험 완화. JWT 12h.
- 개인정보(사번·이름) 노출 최소화: employee는 본인 데이터만. `개인별 패드 지급 현황.xlsx`·mmdb·서비스계정·google-services.json은 gitignore 유지.
- 텔레메트리는 기기 진단 신호(개인정보 아님). 주변 AP 스캔은 실내측위 목적, 사내 한정.

## 자동화/게이트
서버·대시보드는 자동(테스트+실행). 앱 텔레메트리 수집은 실기기 확인(B). CORP_PUBLIC_IPS·mmdb·관리자 계정은 사람 게이트(운영자 값).

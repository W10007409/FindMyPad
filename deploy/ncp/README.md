# NCP CDN + 로컬 DB 배포 가이드

**구성**: 대시보드(정적)는 **NCP Object Storage + CDN+**, API+DB는 **로컬 박스(공인 IP)**.
패드(외부)는 `https://api.<도메인>`(로컬)을 직접 호출, 관리자/직원은 `https://app.<도메인>`(NCP CDN) 접속.

```mermaid
flowchart LR
  pad[외부 패드] -- HTTPS /api --> api
  browser[브라우저] -- HTTPS --> cdn[NCP CDN+]
  cdn -- 원본 pull --> obj[NCP Object Storage<br/>대시보드 dist]
  browser -. XHR /api (CORS) .-> api
  subgraph 로컬 박스 (공인 IP, 상시 ON)
    caddy[Caddy TLS :443] --> api[API :3000]
    api --> pg[(PostgreSQL 로컬)]
  end
  api -- FCM --> fcm[(Firebase)]
```

- 대시보드(`app.<도메인>`)와 API(`api.<도메인>`)가 **다른 오리진** → API가 **CORS**로 대시보드 오리진 허용(`CORS_ORIGINS`). (서버에 반영됨)

## 사전 준비
- 로컬 박스: **공인 IP** + 방화벽 **80/443 인바운드 개방** + Docker.
- 도메인 1개(예: `example.com`) + NCP 계정.
- Firebase 프로젝트 + 서비스계정 JSON(서버용), `google-services.json`(앱용).

## 1) DNS
- `api.<도메인>` → **A레코드 = 로컬 박스 공인 IP**.
- `app.<도메인>` → NCP CDN+ 도메인으로 **CNAME**(아래 3단계에서 발급).

## 2) 로컬 API 원본 기동
```bash
cd deploy/ncp
cp .env.example .env          # API_DOMAIN, CORS_ORIGINS=https://app.<도메인>, DB비번, JWT 채우기
mkdir -p ../secrets && cp <firebase 서비스계정>.json ../secrets/firebase-service-account.json
docker compose up -d --build
# Caddy가 api.<도메인> 인증서를 Let's Encrypt로 발급 (DNS+포트 선행 필요)
curl https://api.<도메인>/health   # {"status":"ok"}
```

## 3) 대시보드 → NCP Object Storage + CDN+
```bash
# API 도메인을 향하도록 빌드 (절대 URL)
cd dashboard
VITE_API_BASE_URL=https://api.<도메인>/api npm ci && VITE_API_BASE_URL=https://api.<도메인>/api npm run build
# dist/ 를 NCP Object Storage 버킷에 업로드 (콘솔 또는 s3 호환 CLI)
```
NCP 콘솔 절차:
1. **Object Storage** 버킷 생성 → `dashboard/dist` 업로드. **정적 웹사이트 호스팅** 활성화, **인덱스=index.html, 에러문서=index.html**(SPA 라우팅 폴백).
2. **CDN+** 서비스 생성 → 원본(origin)=그 Object Storage 버킷/웹사이트 엔드포인트.
3. CDN+에 **커스텀 도메인 `app.<도메인>`** 연결 + 인증서(Certificate Manager). 발급된 CDN 도메인을 1단계 CNAME에 지정.
4. 캐시 정책: 정적 자원 캐시. (API는 CDN을 거치지 않으므로 무관)

## 4) 앱 baseUrl (배포 전 필수)
`android-agent/app/src/main/java/com/wjtb/padtracker/AppContainer.kt`
```kotlin
private val defaultBaseUrl = "https://api.<도메인>/"
```
로 변경 후 **재서명 릴리스 빌드**(`deploy/README` 서명 방식). knox flavor는 cleartext 불가 → HTTPS 필수.

## 5) 검증
- 브라우저에서 `https://app.<도메인>` → 로그인 → 네트워크 탭에서 `https://api.<도메인>/api/...` 호출이 **CORS 통과**(200)하는지.
- 패드(앱)에서 보고가 `api.<도메인>`으로 도달하는지(관리자 상세에 최근 보고 갱신).

## 주의사항
- **상시 전원/네트워크**: 로컬 박스가 꺼지면 패드 보고 중단. 관리형 HA 없음.
- **DB 백업 직접**: 예) 야간 `pg_dump` 크론 + 외부 저장. RDS 자동백업 없음.
- **client IP**: 사내/외부망 판정은 Caddy의 `X-Forwarded-For`(→`TRUST_PROXY=true`)로 동작. NCP CDN은 대시보드 정적에만 관여하므로 API의 client IP에 영향 없음.
- **보안**: API가 인터넷 직노출 → JWT 인증 유지(있음). 필요시 방화벽 소스 제한/WAF 고려.
- `.env`·`../secrets/`는 커밋 금지(.gitignore 처리).

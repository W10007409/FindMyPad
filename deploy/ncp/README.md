# NCP 배포 가이드 (NCP CDN+ 버킷 전용 + 로컬 DB)

**확인된 제약**: `wjtools.wjthinkbig.com` 은 **NCP CDN+(원본=버킷)로 정적만** 서빙 → 동적 API(패드 보고 POST·인증)를
같은 `/FindMyPad/api` 경로로 통과시킬 수 없다(CDN+는 리버스프록시가 아님).
→ **API는 별도 호스트 + CORS** 로 노출한다.

## 최종 구성 (권장 A)
- **프론트(정적)**: 버킷 `ai-srt-corrector` 의 `FindMyPad/` → NCP CDN+ → `https://wjtools.wjthinkbig.com/FindMyPad`
- **API(동적)+DB**: 로컬 박스(공인 IP) → `https://findmypad-api.wjthinkbig.com` (별도 서브도메인)
- 프론트와 API가 다른 오리진 → **CORS**(`CORS_ORIGINS=https://wjtools.wjthinkbig.com`). 서버에 반영됨.

```mermaid
flowchart LR
  browser[브라우저] -- https://wjtools.../FindMyPad --> cdn[NCP CDN+]
  cdn -- 원본 --> obj[버킷 ai-srt-corrector/FindMyPad/]
  browser -. XHR (CORS) .-> api
  pad[패드] -- https://findmypad-api... --> api
  subgraph 로컬 박스 (공인 IP)
    caddy[Caddy TLS] --> api[API :3000] --> pg[(PostgreSQL)]
  end
  api -- FCM --> fcm[(Firebase)]
```

## 1) 프론트엔드 빌드 → 버킷 업로드
```bash
cd dashboard
# base=/FindMyPad/(정적 경로) + API는 절대 URL(별도 호스트). Git Bash면 MSYS_NO_PATHCONV=1 필수.
MSYS_NO_PATHCONV=1 VITE_BASE_PATH=/FindMyPad/ VITE_API_BASE_URL=https://findmypad-api.wjthinkbig.com/api npm ci
MSYS_NO_PATHCONV=1 VITE_BASE_PATH=/FindMyPad/ VITE_API_BASE_URL=https://findmypad-api.wjthinkbig.com/api npm run build
# dist/* → 버킷 ai-srt-corrector/FindMyPad/ 업로드 (index.html, assets/*)
```
- 확인: asset 경로 `/FindMyPad/assets/...`, API 호출은 `https://findmypad-api.wjthinkbig.com/api/...`.
- **SPA 폴백**: 버킷 정적 웹사이트 에러문서 = `index.html`(또는 CDN+ 404→/FindMyPad/index.html).

## 2) API DNS + 인증서
- `findmypad-api.wjthinkbig.com` → **A레코드 = 로컬 박스 공인 IP**, 방화벽 80/443 개방(Let's Encrypt).

## 3) 로컬 API + DB 기동
```bash
cd deploy/ncp
cp .env.example .env      # API_DOMAIN=findmypad-api..., CORS_ORIGINS=https://wjtools..., BASE_PATH 비움, DB/JWT
mkdir -p ../secrets && cp <firebase 서비스계정>.json ../secrets/firebase-service-account.json
docker compose up -d --build
curl https://findmypad-api.wjthinkbig.com/health          # {"status":"ok"}
```

## 4) 앱 baseUrl (배포 전 필수)
`android-agent/app/src/main/java/com/wjtb/padtracker/AppContainer.kt`
```kotlin
private val defaultBaseUrl = "https://findmypad-api.wjthinkbig.com/"
```
변경 후 재서명 릴리스 빌드. knox flavor는 HTTPS 필수.

## 5) 검증
- 브라우저 `https://wjtools.wjthinkbig.com/FindMyPad` 로그인 → 네트워크 탭에 `https://findmypad-api.../api/...` **CORS 통과(200)**.
- 앱 보고가 `findmypad-api.../api/reports` 도달 → 관리자 상세 갱신.

---

## (대안 B) 한 호스트로 통합하고 싶다면 — 프록시 필요
`wjtools.wjthinkbig.com/FindMyPad/api` 로 API까지 같은 호스트에 두려면, CDN+(정적)만으로는 불가하고
**프론트 계층에 리버스프록시**(nginx/Caddy)를 둬서 `/FindMyPad/api/*`→로컬 API, `/FindMyPad/*`→버킷 으로 갈라야 한다.
그 경우 서버는 `BASE_PATH=/FindMyPad`, `CORS_ORIGINS` 비움. nginx 예:
```nginx
location /FindMyPad/api/ { proxy_pass https://findmypad-api.wjthinkbig.com; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; }
location /FindMyPad/     { proxy_pass https://<버킷/CDN 엔드포인트>/FindMyPad/; proxy_intercept_errors on; error_page 404 = /FindMyPad/index.html; }
```

## 주의
- 로컬 박스 상시 ON, DB 백업 직접(pg_dump 크론). `.env`·`../secrets/` 커밋 금지.
- 사내/외부망 판정은 Caddy `X-Forwarded-For` + `TRUST_PROXY=true` 로 동작.

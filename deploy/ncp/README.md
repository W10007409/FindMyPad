# NCP 배포 가이드 — https://wjtools.wjthinkbig.com/FindMyPad

**목표**: 단일 호스트 하위경로 `…/FindMyPad` 에서 **프론트엔드 + API** 모두 서비스.
- 프론트(정적) → NCP **Object Storage 버킷 `ai-srt-corrector`** 의 `FindMyPad/` 프리픽스 → NCP CDN/프록시가 서빙.
- API(동적) + DB → **로컬 박스**(공인 IP). `/FindMyPad/api/*` 는 로컬 API로 라우팅.
- 같은 호스트라 **CORS 불필요**(비활성). 서버는 **`BASE_PATH=/FindMyPad`** 로 `/FindMyPad/api` 를 서빙.

```mermaid
flowchart LR
  user[패드/브라우저] -- https://wjtools.wjthinkbig.com/FindMyPad --> edge[wjtools 프론트 계층<br/>CDN 또는 리버스프록시]
  edge -- "/FindMyPad/* (정적)" --> obj[Object Storage<br/>ai-srt-corrector/FindMyPad/]
  edge -- "/FindMyPad/api/* (동적)" --> api
  subgraph 로컬 박스 (공인 IP, 상시 ON)
    api[API BASE_PATH=/FindMyPad :3000] --> pg[(PostgreSQL 로컬)]
  end
  api -- FCM --> fcm[(Firebase)]
```

## 반영된 코드 변경 (이미 적용됨)
- **서버**: `BASE_PATH` env → 모든 라우트를 `/FindMyPad` 하위에 등록(`/FindMyPad/api/...`, `/FindMyPad/health`). 루트 `/health`도 유지(컨테이너 체크).
- **프론트**: `VITE_BASE_PATH`로 vite `base` 지정, 라우터 `basename`·API base가 `import.meta.env.BASE_URL`에서 파생.

## 1) 프론트엔드 빌드 → 버킷 업로드
```bash
cd dashboard
# ⚠️ Git Bash면 MSYS_NO_PATHCONV=1 필수(슬래시 경로변환 방지). 리눅스/CI는 불필요.
MSYS_NO_PATHCONV=1 VITE_BASE_PATH=/FindMyPad/ npm ci
MSYS_NO_PATHCONV=1 VITE_BASE_PATH=/FindMyPad/ npm run build
# dist/* 를 버킷 ai-srt-corrector 의 FindMyPad/ 아래로 업로드 (콘솔 또는 S3 호환 CLI)
#   dist/index.html            -> ai-srt-corrector/FindMyPad/index.html
#   dist/assets/*              -> ai-srt-corrector/FindMyPad/assets/*
```
빌드 결과 asset 경로가 `/FindMyPad/assets/...` 인지 확인. **SPA 폴백**: 버킷 정적 웹사이트 에러문서=`index.html`(또는 프론트 계층에서 404→/FindMyPad/index.html).

## 2) 로컬 API + DB 기동
```bash
cd deploy/ncp
cp .env.example .env      # BASE_PATH=/FindMyPad, API_DOMAIN(로컬 박스 도메인), DB비번, JWT 채우기
mkdir -p ../secrets && cp <firebase 서비스계정>.json ../secrets/firebase-service-account.json
docker compose up -d --build
curl https://<API_DOMAIN>/FindMyPad/health   # {"status":"ok"}
```

## 3) wjtools 프론트 계층 라우팅 (핵심)
`wjtools.wjthinkbig.com` 을 서빙하는 계층에서 아래처럼 경로 분기해야 한다.

**A. nginx 리버스프록시인 경우** (권장, 유연):
```nginx
# 동적 API → 로컬 원본 (경로 그대로 전달; 서버가 BASE_PATH=/FindMyPad 로 받음)
location /FindMyPad/api/ {
    proxy_pass https://findmypad-origin.example.com;   # 로컬 박스(API_DOMAIN)
    proxy_set_header Host              $host;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;   # 사내/외부망 판정
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;
}
# 정적 → 버킷 (SPA 폴백)
location /FindMyPad/ {
    proxy_pass https://<ai-srt-corrector 버킷/CDN 엔드포인트>/FindMyPad/;
    proxy_intercept_errors on;
    error_page 404 = /FindMyPad/index.html;
}
```

**B. NCP CDN+(원본=버킷)만 있는 경우**:
- CDN+ 에 **경로별 원본 규칙**으로 `/FindMyPad/api/*` → 두 번째 원본(로컬 API `API_DOMAIN`), 그 외 `/FindMyPad/*` → 버킷. (NCP CDN+가 경로별 원본을 지원할 때)
- 지원하지 않으면 위 **A(nginx)** 를 프론트 계층으로 두거나, API만 별도 호스트로 노출(그 경우 `CORS_ORIGINS` 설정 필요).

## 4) 앱 baseUrl (배포 전 필수)
`android-agent/app/src/main/java/com/wjtb/padtracker/AppContainer.kt`
```kotlin
private val defaultBaseUrl = "https://wjtools.wjthinkbig.com/FindMyPad/"
```
(PadApi가 `api/reports` 등 상대경로 → `…/FindMyPad/api/reports`.) 변경 후 재서명 릴리스 빌드. knox flavor는 HTTPS 필수.

## 5) 검증
- 브라우저 `https://wjtools.wjthinkbig.com/FindMyPad` → 로그인 → `/FindMyPad/api/...` 200.
- 앱 보고가 `…/FindMyPad/api/reports` 로 도달 → 관리자 상세에 최근 보고 갱신.

## 주의
- 로컬 박스 상시 ON, **DB 백업 직접**(pg_dump 크론).
- API가 인터넷 경유 노출 → JWT 유지. 프론트 계층에서 소스 IP 제한/WAF 고려.
- `.env`·`../secrets/` 커밋 금지.

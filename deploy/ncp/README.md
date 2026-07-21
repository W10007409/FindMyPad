# NCP 배포 가이드 — 구성 B (단일 호스트 https://wjtools.wjthinkbig.com/FindMyPad)

**선택된 구성 B**: 프론트+API를 **한 호스트/하위경로**에서 서비스.
NCP CDN+(버킷)만으로는 동적 API를 통과 못 하므로, **프론트 계층에 리버스프록시**를 둬서 경로를 분기한다.
- `/FindMyPad/api/*` → **로컬 API 원본**(공인 IP, BASE_PATH=/FindMyPad)
- `/FindMyPad/*` → **버킷 `ai-srt-corrector`/FindMyPad/**(정적)
- 같은 호스트 → **CORS 불필요**.

```mermaid
flowchart LR
  user[패드/브라우저] -- https://wjtools.../FindMyPad --> px[리버스프록시<br/>wjtools 프론트]
  px -- "/FindMyPad/api/*" --> api
  px -- "/FindMyPad/*" --> obj[버킷 ai-srt-corrector/FindMyPad/]
  subgraph 로컬 박스 (공인 IP)
    caddy[Caddy TLS findmypad-origin] --> api[API BASE_PATH=/FindMyPad :3000] --> pg[(PostgreSQL)]
  end
  api -- FCM --> fcm[(Firebase)]
```

## 코드 반영(완료)
- 서버 `BASE_PATH=/FindMyPad` → `/FindMyPad/api/...` 서빙(루트 `/health` 유지). 서버 98/98.
- 프론트 `VITE_BASE_PATH=/FindMyPad/` → asset·라우터·API base 전부 `/FindMyPad` 파생(같은 오리진).
- **앱 knox 릴리스**: `DEFAULT_BASE_URL=https://wjtools.wjthinkbig.com/FindMyPad/` 로 빌드됨(생성 BuildConfig 확인). `apk-dist/padtracker-knox-release-*.apk`.

## 1) 프론트엔드 빌드 → 버킷 업로드
```bash
cd dashboard
# 같은 오리진이므로 API URL 오버라이드 불필요(기본 /FindMyPad/api). Git Bash면 MSYS_NO_PATHCONV=1.
MSYS_NO_PATHCONV=1 VITE_BASE_PATH=/FindMyPad/ npm ci
MSYS_NO_PATHCONV=1 VITE_BASE_PATH=/FindMyPad/ npm run build
# dist/* → 버킷 ai-srt-corrector/FindMyPad/ 업로드
```

## 2) 로컬 API + DB 기동
```bash
cd deploy/ncp
cp .env.example .env      # API_DOMAIN=findmypad-origin..., BASE_PATH=/FindMyPad, CORS 비움, DB/JWT
mkdir -p ../secrets && cp <firebase 서비스계정>.json ../secrets/firebase-service-account.json
docker compose up -d --build
curl https://findmypad-origin.wjthinkbig.com/FindMyPad/health   # {"status":"ok"}
```
DNS: `findmypad-origin.wjthinkbig.com` A→로컬 박스 공인 IP, 80/443 개방(Let's Encrypt).

## 3) wjtools 프론트 계층 라우팅
`wjtools.wjthinkbig.com` 프록시에 **`wjtools-proxy.nginx.conf`** 의 `/FindMyPad/api/`·`/FindMyPad/` location을 반영.
(NCP CDN+ 버킷 전용이면, CDN+ 앞단에 이 nginx/Caddy 프록시를 두어 origin으로 삼는다.)

## 4) 앱 배포
- knox 릴리스 APK는 이미 `https://wjtools.wjthinkbig.com/FindMyPad/` 로 빌드됨 → `apk-dist/`. 기기에 설치/배포.
- 프로덕션 URL 바꾸려면 `android-agent/local.properties` 에 `PROD_BASE_URL=...` 지정 후 재빌드.

## 5) 검증
- 브라우저 `https://wjtools.wjthinkbig.com/FindMyPad` 로그인 → `/FindMyPad/api/...` 200(같은 오리진, CORS 없음).
- 앱 보고가 `…/FindMyPad/api/reports` 도달 → 관리자 상세 갱신.

## 주의
- 로컬 박스 상시 ON, DB 백업 직접(pg_dump 크론). `.env`·`../secrets/` 커밋 금지.
- 사내/외부망 판정: 프록시/Caddy `X-Forwarded-For` + `TRUST_PROXY=true`.

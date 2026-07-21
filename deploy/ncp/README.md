# NCP 배포 가이드 — wjtools 단일 호스트 (프록시·서브도메인 불가)

**제약**: `wjtools.wjthinkbig.com` **하나만** 사용, 리버스프록시 추가 불가, 서브도메인 추가 불가.
이 조건에서 동적 API를 같은 호스트에 얹는 **유일한 방법 = NCP CDN+ "경로별 원본(multi-origin)"**.

## 동작 원리
NCP CDN+ 가 경로에 따라 다른 원본에서 콘텐츠를 당긴다:
- `/FindMyPad/api/*`  → **로컬 박스 공인 IP:포트** (동적, 캐시 우회)
- `/FindMyPad/*`      → **버킷 `ai-srt-corrector`/FindMyPad/** (정적)

```mermaid
flowchart LR
  user[패드/브라우저] -- https://wjtools.../FindMyPad --> cdn[NCP CDN+]
  cdn -- "/FindMyPad/api/* (no-cache)" --> ip[로컬 박스 공인 IP:8080]
  cdn -- "/FindMyPad/* (정적)" --> obj[버킷 ai-srt-corrector/FindMyPad/]
  subgraph 로컬 박스 (공인 IP)
    ip --> api[API BASE_PATH=/FindMyPad] --> pg[(PostgreSQL)]
  end
  api -- FCM --> fcm[(Firebase)]
```

## ⚠️ 먼저 확인 (이게 되어야 이 방식이 성립)
NCP 콘솔에서 **CDN+ 가 "경로 패턴별 추가 원본"을 지원하는지** 확인:
1. `/FindMyPad/api/*` (또는 `/FindMyPad/api*`) 패턴 → 원본 = `http://<로컬 공인 IP>:8080`, **캐시 TTL=0 / 캐시 안 함**, **POST 등 메서드 통과** 허용.
2. 기본(그 외 `/FindMyPad/*`) → 원본 = 버킷.
3. **X-Forwarded-For 전달** 옵션 활성(사내/외부망 판정에 실 IP 필요).

지원하지 않으면 이 호스트 하나로는 동적 API가 불가 → 프록시나 서브도메인 중 하나를 열어야 함(그때는 앞선 구성 A/B).

## 코드 상태 (이미 맞음)
- 서버 `BASE_PATH=/FindMyPad` → `/FindMyPad/api/...` 서빙. (CDN이 경로 그대로 전달)
- 앱 knox 릴리스 `DEFAULT_BASE_URL=https://wjtools.wjthinkbig.com/FindMyPad/`. (`apk-dist/`)
- 프론트 `VITE_BASE_PATH=/FindMyPad/`(같은 오리진, CORS 불필요).

## 1) 프론트 빌드 → 버킷
```bash
cd dashboard
MSYS_NO_PATHCONV=1 VITE_BASE_PATH=/FindMyPad/ npm ci
MSYS_NO_PATHCONV=1 VITE_BASE_PATH=/FindMyPad/ npm run build
# dist/* → 버킷 ai-srt-corrector/FindMyPad/  (SPA 폴백: 에러문서=index.html)
```

## 2) 로컬 API + DB
```bash
cd deploy/ncp
cp .env.example .env      # ORIGIN_PORT(예 8080), BASE_PATH=/FindMyPad, DB/JWT
mkdir -p ../secrets && cp <firebase 서비스계정>.json ../secrets/firebase-service-account.json
docker compose up -d --build
curl http://<로컬 공인 IP>:8080/FindMyPad/health   # {"status":"ok"}
```
- 방화벽에서 `ORIGIN_PORT` 를 **NCP CDN egress IP 대역으로 제한** 권장(공인 노출 최소화).

## 3) CDN 경로별 원본 설정 (위 "먼저 확인" 대로)
`/FindMyPad/api/*` → `http://<로컬 공인 IP>:8080` (no-cache), 나머지 → 버킷.

## 4) 앱 배포
- knox 릴리스 APK(`apk-dist/`)는 이미 `https://wjtools.wjthinkbig.com/FindMyPad/` 로 빌드됨 → 기기 배포.
- URL 변경 시 `android-agent/local.properties` 의 `PROD_BASE_URL` 수정 후 재빌드.

## 5) 검증
- 브라우저 `https://wjtools.wjthinkbig.com/FindMyPad` 로그인 → `/FindMyPad/api/...` 200.
- 앱 보고 `…/FindMyPad/api/reports` 도달 → 관리자 상세 갱신.

## 주의
- 로컬 박스 상시 ON, DB 백업 직접(pg_dump 크론). `.env`·`../secrets/` 커밋 금지.
- CDN↔원본 구간이 HTTP면 방화벽 IP 제한 필수. (원본 HTTPS 지원 시 그쪽 권장)

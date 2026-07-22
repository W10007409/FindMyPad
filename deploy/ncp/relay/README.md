# NCP 릴레이(리버스 터널) — 내부 API를 외부에 노출

## 왜 필요한가
- 패드는 **외부망** → API가 외부에서 닿아야 함.
- 하지만 API+DB는 **내부망**에 두고(데이터 완전 내부), 공인 IP·인바운드 개방은 **불가**.
- 해결: 내부 서버가 **아웃바운드로** 소형 NCP 릴레이에 연결(리버스 터널). 외부 요청은 릴레이→터널→내부 API로 전달.
- **DB는 절대 밖으로 나가지 않음.** 릴레이는 트래픽만 중계(저장 없음).

## 전체 흐름
```
패드/브라우저(외부)
  → NCP CDN  https://wjtools.wjthinkbig.com/FindMyPad/api/*   (경로별 원본)
  → NCP 릴레이 서버(공인IP)  :8080   [frps]
  → ── 리버스 터널(frpc가 아웃바운드로 미리 연결) ──
  → 내부 서버  api:3000  →  Postgres(내부)
```
도구: **frp**(오픈소스). `frps`=릴레이, `frpc`=내부 클라이언트.

## 준비물
| | 사양 | 네트워크 |
|---|---|---|
| **NCP 릴레이 서버** | 1~2 vCPU / 1~2GB, Ubuntu, Docker | 공인 IP. 인바운드 7000(내부서버 egress IP만), 8080(NCP CDN IP만) |
| **내부 서버** | 2 vCPU / 2~4GB, Docker | 공인 IP·인바운드 **불필요**. 릴레이(7000)로 **아웃바운드**만 |

## 파일
- `frps.toml` / `docker-compose.relay.yml` — 릴레이에서 실행
- `frpc.toml` / `docker-compose.internal.yml` — 내부 서버에서 실행 (api+db+frpc)

---

## 1) 릴레이 서버 세팅 (NCP 공인 서버)
```bash
# frps.toml 편집: auth.token 을 강력한 공유 토큰으로, webServer.password 변경
docker compose -f docker-compose.relay.yml up -d
docker logs findmypad-relay-frps-1        # "frps started" 확인
```
방화벽(ACG): `7000/tcp` ← 내부서버 egress IP, `8080/tcp` ← NCP CDN egress IP.

## 2) 내부 서버 세팅 (API+DB+frpc)
```bash
git clone https://github.com/W10007409/FindMyPad.git
cd FindMyPad/deploy/ncp
cp .env.example .env                      # BASE_PATH=/FindMyPad, DB비번, JWT (ORIGIN_PORT는 무시됨)
mkdir -p secrets && cp firebase-service-account.json secrets/
cd relay
# frpc.toml 편집: serverAddr=릴레이 공인 IP, auth.token=릴레이와 동일
docker compose -f docker-compose.internal.yml --env-file ../.env up -d --build
docker logs findmypad-internal-frpc-1     # "start proxy success" 확인
```

## 3) NCP CDN 경로별 원본 연결
- `/FindMyPad/api/*` → 원본 = `http://<릴레이 공인 IP>:8080` (캐시 우회, POST 통과, X-Forwarded-For 전달)
- 그 외 `/FindMyPad/*` → 버킷 `ai-srt-corrector/FindMyPad/`

## 4) 검증 (단계별로 확인)
```bash
# 내부 서버에서 (frpc 통하지 않고 직접)
docker exec findmypad-internal-api-1 wget -qO- http://localhost:3000/FindMyPad/health   # {"status":"ok"}
# 릴레이 경유 (터널 동작 확인)
curl http://<릴레이 공인 IP>:8080/FindMyPad/health
# CDN 경유 (최종)
curl https://wjtools.wjthinkbig.com/FindMyPad/health
```

## 보안
- **frp 토큰**: frps/frpc 동일한 강력한 토큰. 없으면 아무나 터널에 붙음.
- **릴레이 방화벽**: 7000=내부서버 egress IP만, 8080=NCP CDN IP만. SSH=관리자 IP만.
- **터널 암호화**: `frpc.toml` 의 `transport.useEncryption=true`.
- **데이터**: DB는 내부 컨테이너에만. API 포트도 호스트에 publish 안 함 → 내부서버 인터넷 노출 0.
- **client IP**: CDN이 넣는 `X-Forwarded-For`가 HTTP 헤더로 터널을 그대로 통과 → API가 `TRUST_PROXY=true`로 실 IP를 읽어 사내/외부망 판정. (frp tcp 모드는 원본 바이트를 그대로 전달)

## 운영
- 릴레이·내부 서버 상시 ON. frpc는 릴레이 끊기면 자동 재연결(restart: unless-stopped).
- **DB 백업**: 내부 서버에서 `pg_dump` 크론.
- 대안: frp 대신 SSH 리버스 터널(`autossh -R 8080:api:3000 relay`)도 가능하나, frp가 재연결·다중 프록시·토큰인증 면에서 운영이 편함.

## 비용/난이도
- 릴레이는 소형 NCP 서버 1대(저렴). 내부는 기존 서버 활용.
- 이 방식의 장점: **데이터 완전 내부 + 내부서버 인바운드 개방 불필요**(아웃바운드만). Cloudflare Tunnel과 같은 원리를 NCP에서 self-host.

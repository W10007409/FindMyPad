# API 원본 호스트 셋업 (공인 IP:포트)

CDN+ 경로별 원본이 `/FindMyPad/api/*` 를 당겨갈 **공인 접근 가능한 호스트**가 필요하다.
내부망 서버는 CDN이 못 당기므로, 아래 요건의 **공인 IP 호스트**에 API(+DB 컨테이너)를 올린다.

## 어떤 호스트?
- **NCP Server(Cloud Server)** 에 **공인 IP** 부여가 가장 간단. (또는 공인 IP를 가진 DMZ 리눅스 박스)
- 사양(소규모): **2 vCPU / 2~4GB RAM / 디스크 30~50GB**.
- OS: Linux (Ubuntu 22.04 / Rocky 9 등).

## 설치 소프트웨어
- **Docker Engine + Docker Compose v2** (그 외 불필요 — API·PostgreSQL 모두 컨테이너).
- (배포 파일 전송용) git 또는 scp.

## 네트워크 / 방화벽 (중요)
| 방향 | 포트 | 대상 | 비고 |
|---|---|---|---|
| **인바운드** | `ORIGIN_PORT`(예 8080/tcp) | **NCP CDN egress IP 대역으로 제한** | CDN만 당기게. 전체개방 지양 |
| 인바운드 | 22/tcp(SSH) | 관리자 IP만 | 운영 접속 |
| **DB 5432** | — | **공개 안 함** | 컨테이너 내부 네트워크에만. 인터넷 노출 금지 |
| 아웃바운드 | 443/tcp | Firebase(FCM)·googleapis, 도커/패키지 | 벨/위치요청·이미지 pull |

> DB는 compose에서 포트를 publish하지 않으므로(내부 네트워크만) **공인 노출되지 않는다**. 개인정보(사번·이름·자산대장)는 DB에 남고, API(JWT)로만 접근된다.

## "로컬 DB" 위치 — 두 가지
1. **권장(소규모)**: PostgreSQL을 **이 공인 호스트의 컨테이너**로 운영(= self-hosted 로컬 DB, 매니지드 아님). 볼륨으로 영속. → `deploy/ncp/docker-compose.yml` 그대로.
2. **DB를 내부망에 유지해야 하면**: 이 공인 호스트는 API만 돌리고 `DATABASE_URL`을 내부 DB로 향하게. 단 **공인 호스트 → 내부 DB:5432 경로**(사내 방화벽 허용 또는 site-to-site VPN)가 필요 — 네트워크팀 협의 필요.

## 배포 절차 (권장 1번 기준)
```bash
# 공인 호스트에서
git clone https://github.com/W10007409/FindMyPad.git && cd FindMyPad/deploy/ncp
cp .env.example .env            # ORIGIN_PORT, BASE_PATH=/FindMyPad, DB비번, JWT 채우기
mkdir -p ../secrets && cp firebase-service-account.json ../secrets/
docker compose up -d --build
curl http://localhost:8080/FindMyPad/health     # {"status":"ok"}
curl http://<이 호스트 공인 IP>:8080/FindMyPad/health   # 외부(=CDN 경로)에서도 200 이어야 함
```

## CDN 연결
NCP CDN+ 경로별 원본: `/FindMyPad/api/*` → `http://<이 호스트 공인 IP>:ORIGIN_PORT` (캐시 우회, POST 통과, X-Forwarded-For 전달). 나머지 `/FindMyPad/*` → 버킷.

## 운영
- **백업**: `pg_dump` 야간 크론 → 안전한 위치(사내/오브젝트스토리지).
- **보안**: ORIGIN_PORT는 CDN IP 제한 필수. 원본이 HTTP면 CDN↔원본 구간 비암호화 → IP 제한으로 보완. JWT 인증 유지.
- **상시 ON**: 이 호스트가 꺼지면 패드 보고 중단.

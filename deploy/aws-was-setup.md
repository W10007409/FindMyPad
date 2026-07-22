# AWS EC2(WAS)에 API 서버 세팅

**전제**: AWS EC2를 API 원본(WAS)으로. NCP CDN이 `/FindMyPad/api/*` 를 이 EC2 **공인 IP(EIP)** 에서 당긴다.
EC2가 공인 IP라 **릴레이/터널 불필요**. (앞서의 relay 방식은 내부망만 있을 때의 대안)

```
패드(외부) → NCP CDN(wjtools.../FindMyPad)
          → /FindMyPad/api/*  →  EC2(EIP):8080  [API + Postgres(Docker)]
          → /FindMyPad/*      →  버킷 ai-srt-corrector/FindMyPad/ (정적)
```

## 1) EC2 준비
- 인스턴스: **t3.small~medium**(2 vCPU / 2~4GB), Amazon Linux 2023 또는 Ubuntu 22.04, EBS gp3 30~40GB.
- **Elastic IP(EIP)** 할당 → 고정 공인 IP. (NCP CDN 원본으로 지정)
- **보안 그룹(인바운드)**:
  | 포트 | 소스 | 용도 |
  |---|---|---|
  | 8080/tcp (ORIGIN_PORT) | **NCP CDN egress IP 대역만** | CDN이 API 당김 |
  | 22/tcp (SSH) | 관리자 IP만 | 운영 |
  | 5432 (DB) | **열지 않음** | DB는 컨테이너 내부만 |
- 아웃바운드: 443(Firebase/FCM, 도커 pull) 허용.

## 2) Docker 설치
```bash
# Amazon Linux 2023
sudo dnf -y install docker && sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user      # 재로그인
# Ubuntu 22.04
# sudo apt-get update && sudo apt-get -y install docker.io docker-compose-v2 && sudo systemctl enable --now docker
docker compose version
```

## 3) 배포
```bash
git clone https://github.com/W10007409/FindMyPad.git
cd FindMyPad/deploy/ncp
cp .env.example .env         # ORIGIN_PORT=8080, BASE_PATH=/FindMyPad, DB비번, JWT 채우기
mkdir -p secrets && cp firebase-service-account.json secrets/
docker compose up -d --build       # api + postgres 기동(마이그레이션 자동)
curl http://localhost:8080/FindMyPad/health        # {"status":"ok"}
curl http://<EC2 EIP>:8080/FindMyPad/health        # 외부(=CDN 경로)에서도 200 이어야
```
- 뜨는 것: `api`(8080 공개) + `postgres`(내부 전용). DB 포트는 공개 안 됨 → 개인정보 노출 0.

## 4) DB 위치 (선택)
- **같은 EC2 컨테이너**(compose의 `db`) = 가장 단순. self-host(RDS 아님), 볼륨 영속.
- **외부 DB**로 두려면 `.env` 의 `DATABASE_URL` 을 그쪽으로. (사내 내부망 DB면 EC2→내부 경로=VPN 필요)

## 5) NCP CDN 경로별 원본 연결
- `/FindMyPad/api/*` → 원본 `http://<EC2 EIP>:8080` (캐시 우회, POST 통과, X-Forwarded-For 전달)
- 그 외 `/FindMyPad/*` → 버킷.

## 6) 앱/대시보드
- 앱 출시 빌드(`assembleDevRelease`)는 이미 `https://wjtools.wjthinkbig.com/FindMyPad/` 를 봄 → 그대로 배포.
- 대시보드: `VITE_BASE_PATH=/FindMyPad/` 빌드 → 버킷 업로드.

## 7) (선택) Docker 없이 직접 Node로
사내 정책상 Docker 불가면:
```bash
# Node 22 + pnpm
curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash - && sudo dnf -y install nodejs
corepack enable && corepack prepare pnpm@10.8.1 --activate
# PostgreSQL 16 설치(또는 외부 DB)
git clone https://github.com/W10007409/FindMyPad.git && cd FindMyPad
pnpm install --frozen-lockfile && pnpm build
# .env 로드 후
export $(grep -v '^#' .env | xargs)   # DATABASE_URL/JWT_SECRET/BASE_PATH=/FindMyPad 등
node dist/db/migrate.js && node dist/server.js
# 운영은 systemd 서비스로 등록(ExecStart=node dist/server.js, EnvironmentFile=.env)
```

## 보안 요약
- ORIGIN_PORT(8080)는 **NCP CDN IP만**. DB 포트 비공개. SSH 제한. JWT 인증 유지.
- CDN↔EC2 가 HTTP면 IP 제한 필수. (원본 HTTPS 원하면 EC2에 ALB+ACM 또는 Caddy로 TLS)
- `.env`·`secrets/` 커밋 금지.

> 참고: AWS RDS/ALB 등 매니지드 풀스택을 원하면 `deploy/terraform/`(구성 B) 스캐폴드가 있음. 위는 EC2 한 대에 Docker로 올리는 최소 구성.

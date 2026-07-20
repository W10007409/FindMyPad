# syntax=docker/dockerfile:1
# FindMyPad API 서버 이미지 (Fastify/Node ESM).
# 빌드 컨텍스트는 레포 루트여야 한다:
#   docker build -f deploy/Dockerfile -t findmypad-api:latest .

# ---- build stage: 전체 의존성 설치 + tsc 컴파일 ----
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.8.1 --activate
# 의존성 캐시 레이어
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
# 소스 + 빌드 설정
COPY tsconfig.json drizzle.config.ts ./
COPY server ./server
RUN pnpm build          # tsc -p tsconfig.json → dist/

# ---- runtime stage: prod 의존성만 ----
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN corepack enable && corepack prepare pnpm@10.8.1 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
# 컴파일된 서버
COPY --from=build /app/dist ./dist
# 마이그레이션 SQL/JSON은 tsc가 컴파일하지 않으므로 런타임 경로에 그대로 복사
# (migrate.js가 './server/src/db/migrations' 를 참조 → cwd=/app 기준)
COPY server/src/db/migrations ./server/src/db/migrations
COPY deploy/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# 비루트 사용자로 실행
RUN chown -R node:node /app
USER node

EXPOSE 3000
# 컨테이너 헬스체크(ALB/compose와 별개의 도커 레벨 체크)
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]

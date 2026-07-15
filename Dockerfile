# ---- builder ----
FROM node:20-slim AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.8.1 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json drizzle.config.ts ./
COPY server ./server
RUN pnpm build

# ---- runtime ----
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@10.8.1 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
# 컴파일 산출물 + 마이그레이션 SQL(런타임 migrate.js가 상대경로로 참조)
COPY --from=builder /app/dist ./dist
COPY server/src/db/migrations ./server/src/db/migrations
EXPOSE 3000
USER node
# 시작 시 마이그레이션 후 서버 기동 (마이그레이터는 drizzle-orm prod 의존; tsx 불필요)
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/server.js"]

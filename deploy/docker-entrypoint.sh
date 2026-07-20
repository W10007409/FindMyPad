#!/bin/sh
set -e

# 단일 인스턴스(구성 A)는 시작 시 마이그레이션을 수행한다.
# ECS 등 멀티 태스크(구성 B)에서는 RUN_MIGRATIONS=false 로 두고 마이그레이션을
# 별도 1회성 태스크로 실행해 경쟁을 피한다.
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[entrypoint] running DB migrations..."
  node dist/db/migrate.js
fi

echo "[entrypoint] starting API server on :${PORT:-3000}..."
exec node dist/server.js

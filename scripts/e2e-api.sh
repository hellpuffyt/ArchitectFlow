#!/usr/bin/env bash
# Start the API for end-to-end tests against a FRESH real PostgreSQL database.
# Used by apps/web/playwright.config.ts. Requires PostgreSQL binaries (see scripts/dev-db.sh)
# unless ARCHITECTFLOW_E2E_DATABASE_URL points at an existing empty database (CI service).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${ARCHITECTFLOW_E2E_API_PORT:-8100}"
if [ -z "${ARCHITECTFLOW_E2E_DATABASE_URL:-}" ]; then
  "$ROOT/scripts/dev-db.sh" start >/dev/null
  "$ROOT/scripts/dev-db.sh" createdb architectflow_e2e
  export ARCHITECTFLOW_DATABASE_URL="postgresql+psycopg://architectflow@127.0.0.1:${ARCHITECTFLOW_PG_PORT:-54329}/architectflow_e2e"
else
  export ARCHITECTFLOW_DATABASE_URL="$ARCHITECTFLOW_E2E_DATABASE_URL"
fi
export ARCHITECTFLOW_SECURE_COOKIES=false
export ARCHITECTFLOW_AI_PROVIDER="${ARCHITECTFLOW_AI_PROVIDER:-example}"
export ARCHITECTFLOW_AI_REQUESTS_PER_MINUTE=1000
export ARCHITECTFLOW_LOGIN_ATTEMPTS_PER_MINUTE=1000
cd "$ROOT/apps/api"
UV="${UV:-uv}"
"$UV" run --frozen alembic upgrade head
exec "$UV" run --frozen uvicorn architectflow.main:app --host 127.0.0.1 --port "$PORT"

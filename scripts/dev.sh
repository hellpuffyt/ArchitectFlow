#!/usr/bin/env bash
# One-command local development: PostgreSQL (throwaway cluster), API on :8000, web on :3000.
# Ports: ARCHITECTFLOW_API_PORT (8000), ARCHITECTFLOW_WEB_PORT (3000), ARCHITECTFLOW_PG_PORT (54329).
# Requires: uv, Node.js 20.9+ (24 recommended), PostgreSQL 15+ server binaries (see scripts/dev-db.sh).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UV="${UV:-uv}"
command -v "$UV" >/dev/null || { echo "error: uv not found (https://docs.astral.sh/uv/)" >&2; exit 1; }
command -v npm >/dev/null || { echo "error: npm not found (install Node.js 20.9+)" >&2; exit 1; }

API_PORT="${ARCHITECTFLOW_API_PORT:-8000}"
WEB_PORT="${ARCHITECTFLOW_WEB_PORT:-3000}"

"$ROOT/scripts/dev-db.sh" start
export ARCHITECTFLOW_DATABASE_URL="${ARCHITECTFLOW_DATABASE_URL:-postgresql+psycopg://architectflow@127.0.0.1:${ARCHITECTFLOW_PG_PORT:-54329}/architectflow}"
export ARCHITECTFLOW_SECURE_COOKIES="${ARCHITECTFLOW_SECURE_COOKIES:-false}"  # plain http on localhost

(cd "$ROOT/apps/api" && "$UV" sync --frozen && "$UV" run --frozen alembic upgrade head)
(cd "$ROOT/apps/web" && npm ci --no-audit --no-fund)

"$UV" --directory "$ROOT/apps/api" run --frozen uvicorn architectflow.main:app --host 127.0.0.1 --port "$API_PORT" &
API_PID=$!
trap 'kill $API_PID 2>/dev/null || true' EXIT INT TERM
echo "API: http://127.0.0.1:$API_PORT/api/docs   Web: http://localhost:$WEB_PORT"
cd "$ROOT/apps/web" && ARCHITECTFLOW_API_ORIGIN="http://127.0.0.1:$API_PORT" npx next dev -p "$WEB_PORT"

#!/usr/bin/env bash
# Throwaway local PostgreSQL cluster for development and tests.
#   scripts/dev-db.sh start|stop|status|reset|createdb <name>|dropdb <name>
# Data lives in .dev/pgdata (gitignored). Listens on 127.0.0.1:${ARCHITECTFLOW_PG_PORT:-54329}.
# Needs PostgreSQL 15+ server binaries: set PG_BIN, or have pg_ctl on PATH, or a Homebrew
# postgresql@17/@16 install.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="$ROOT/.dev/pgdata"
PORT="${ARCHITECTFLOW_PG_PORT:-54329}"
USER_NAME="architectflow"

find_bin() {
  if [ -n "${PG_BIN:-}" ]; then echo "$PG_BIN"; return; fi
  if command -v pg_ctl >/dev/null 2>&1; then dirname "$(command -v pg_ctl)"; return; fi
  for v in 17 16 15; do
    for prefix in /opt/homebrew/opt /usr/local/opt; do
      [ -x "$prefix/postgresql@$v/bin/pg_ctl" ] && { echo "$prefix/postgresql@$v/bin"; return; }
    done
    [ -x "/usr/lib/postgresql/$v/bin/pg_ctl" ] && { echo "/usr/lib/postgresql/$v/bin"; return; }
  done
  echo "error: PostgreSQL server binaries not found; install PostgreSQL 15+ or set PG_BIN" >&2
  exit 1
}
BIN="$(find_bin)"
psql_admin() { "$BIN/psql" -h 127.0.0.1 -p "$PORT" -U "$USER_NAME" -d postgres -v ON_ERROR_STOP=1 -qAt "$@"; }

start() {
  if [ ! -f "$DATA/PG_VERSION" ]; then
    mkdir -p "$ROOT/.dev"
    "$BIN/initdb" -D "$DATA" -U "$USER_NAME" --auth=trust --encoding=UTF8 --locale=C >/dev/null
  fi
  if "$BIN/pg_ctl" -D "$DATA" status >/dev/null 2>&1; then
    echo "postgres already running on 127.0.0.1:$PORT"
  else
    "$BIN/pg_ctl" -D "$DATA" -l "$ROOT/.dev/postgres.log" -w \
      -o "-p $PORT -k $ROOT/.dev -c listen_addresses=127.0.0.1" start >/dev/null
    echo "postgres started on 127.0.0.1:$PORT"
  fi
  psql_admin -c "SELECT 1 FROM pg_database WHERE datname='architectflow'" | grep -q 1 \
    || psql_admin -c "CREATE DATABASE architectflow"
}

case "${1:-start}" in
  start) start ;;
  stop) "$BIN/pg_ctl" -D "$DATA" -m fast stop ;;
  status) "$BIN/pg_ctl" -D "$DATA" status ;;
  reset) "$BIN/pg_ctl" -D "$DATA" -m fast stop 2>/dev/null || true; rm -rf "$DATA"; start ;;
  createdb) psql_admin -c "DROP DATABASE IF EXISTS \"$2\" WITH (FORCE)"; psql_admin -c "CREATE DATABASE \"$2\"" ;;
  dropdb) psql_admin -c "DROP DATABASE IF EXISTS \"$2\" WITH (FORCE)" ;;
  *) echo "usage: $0 start|stop|status|reset|createdb <name>|dropdb <name>" >&2; exit 2 ;;
esac

#!/usr/bin/env bash
# Regression test for scripts/dev-db.sh: start a throwaway cluster from a deliberately deep
# directory (longer than the Unix socket path limit) on a free port, connect over TCP, clean up.
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)"
BASE="$(mktemp -d)"
DEEP="$BASE/$(printf 'very-long-directory-name-%02d/' $(seq 1 6))ArchitectFlow"
mkdir -p "$DEEP/scripts"
cp "$SRC/dev-db.sh" "$DEEP/scripts/"
PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')"
echo "checkout path length: ${#DEEP} (socket limit ~103 bytes)"
cleanup() { ARCHITECTFLOW_PG_PORT=$PORT "$DEEP/scripts/dev-db.sh" stop >/dev/null 2>&1 || true; rm -rf "$BASE"; }
trap cleanup EXIT
ARCHITECTFLOW_PG_PORT=$PORT "$DEEP/scripts/dev-db.sh" start
ARCHITECTFLOW_PG_PORT=$PORT "$DEEP/scripts/dev-db.sh" createdb deep_path_check
if ls "$DEEP/.dev"/.s.PGSQL.* >/dev/null 2>&1; then echo "FAIL: a Unix socket was created in the checkout" >&2; exit 1; fi
echo "PASS: cluster started from a deep path over TCP only"

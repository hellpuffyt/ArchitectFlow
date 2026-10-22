# Configuration

Settings are read from environment variables (see `apps/api/architectflow/config.py`).

| Variable | Default | Meaning |
|---|---|---|
| `ARCHITECTFLOW_DATABASE_URL` | `postgresql+psycopg://architectflow@127.0.0.1:54329/architectflow` | SQLAlchemy URL (psycopg 3). |
| `ARCHITECTFLOW_SECURE_COOKIES` | `true` | `Secure` flag on the session cookie. Set `false` only for plain-HTTP local development. |
| `ARCHITECTFLOW_SESSION_TTL_HOURS` | `168` | Session lifetime (1–2160). |
| `ARCHITECTFLOW_AI_PROVIDER` | `example` | `example`, `openai` (OpenAI-compatible Chat Completions), `anthropic`. |
| `ARCHITECTFLOW_AI_API_KEY` | – | Required unless `example`. Missing → AI endpoints return 503; everything else works. |
| `ARCHITECTFLOW_AI_MODEL` | – | Required for `openai`; `anthropic` defaults to `claude-sonnet-5`. |
| `ARCHITECTFLOW_AI_BASE_URL` | provider default | e.g. a self-hosted OpenAI-compatible server. |
| `ARCHITECTFLOW_AI_TIMEOUT_SECONDS` | `60` | Provider timeout → HTTP 504. |
| `ARCHITECTFLOW_AI_REQUESTS_PER_MINUTE` | `10` | Per user, per API process. |
| `ARCHITECTFLOW_LOGIN_ATTEMPTS_PER_MINUTE` | `10` | Per client address + email, per process. |
| `ARCHITECTFLOW_EXPORTS_PER_MINUTE` | `60` | Per user, per process. |
| `ARCHITECTFLOW_MAX_REQUEST_BYTES` | `2000000` | Larger bodies get 413. |
| `ARCHITECTFLOW_API_ORIGIN` (web, **build time**) | `http://127.0.0.1:8000` | Where the Next.js server proxies `/api/*`. |
| `ARCHITECTFLOW_PG_PORT`, `PG_BIN` (scripts) | `54329`, auto | Port and binaries for `scripts/dev-db.sh`. |
| `ARCHITECTFLOW_TEST_ADMIN_URL` (tests) | dev cluster | Role allowed to create/drop test databases. |
| `ARCHITECTFLOW_E2E_DATABASE_URL` (E2E) | – | Use an existing empty database instead of the dev cluster (CI). |
| `ARCHITECTFLOW_E2E_BASE_URL` (E2E) | – | Test an already-running deployment (e.g. `http://localhost:3000` for Compose) instead of starting servers. |
| `ARCHITECTFLOW_E2E_IGNORE_HTTPS_ERRORS=1` (E2E) | – | Accept a local/self-signed certificate (Caddy example). |
| `ARCHITECTFLOW_E2E_STOP_DB=1` (E2E) | – | Enables the spec that stops and restarts the local cluster. |

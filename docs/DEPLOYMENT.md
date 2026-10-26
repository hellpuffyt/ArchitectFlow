# Deployment

ArchitectFlow is three processes: PostgreSQL, the FastAPI API (long-running Python) and the
Next.js server. On Vercel the web app and the API run as two projects, with PostgreSQL from a
managed provider (see [Vercel](#vercel)).

| Option | Status |
|---|---|
| `scripts/dev.sh` on one machine | **Verified** locally (macOS, PostgreSQL 17, Node 24, Python 3.12). |
| `docker compose up` on a VM behind a TLS reverse proxy (Caddy/nginx) | Compose stack **built and run on arm64** (Colima): core-journey E2E 3/3 against the containers. amd64 verified under QEMU emulation (core journey 1/1); the TLS proxy example is described below. |
| Vercel (two projects) + Neon PostgreSQL | **Deployed** 2026-10-26: the core-journey, architecture and authz E2E specs (7 tests) pass against the production URL. |
| Managed PostgreSQL + container host (Fly.io, Render, Railway…) for the API and web | **Untested.** Same images; set `ARCHITECTFLOW_DATABASE_URL` and build web with `ARCHITECTFLOW_API_ORIGIN`. |

## Docker Compose

```bash
export POSTGRES_PASSWORD=$(openssl rand -hex 24)
docker compose up --build -d     # web on 127.0.0.1:3000
```

Put HTTPS in front (cookies are `Secure` by default). The API image runs `alembic upgrade head`
before starting. Rate limits are counted in PostgreSQL, so several API workers or containers
share them (`ARCHITECTFLOW_RATE_LIMIT_BACKEND=database`, the default).

## HTTPS with Caddy (example, verified locally)

```bash
export POSTGRES_PASSWORD=$(openssl rand -hex 24)
docker compose -f docker-compose.yml -f docker-compose.tls.yml up -d
open https://localhost:8443        # http://localhost:8080 redirects (308) to HTTPS
```

`deploy/caddy/Caddyfile` uses `tls internal`. Caddy creates a local CA and certificate at runtime
in the `caddy-data` volume, so no key is stored in the repository. Browsers warn until you trust
that CA. For a real domain, set `SITE_ADDRESS` to the domain and remove `tls internal` so Caddy
obtains a Let's Encrypt certificate. The override also:
- hides the web port, so the app is reachable only through the proxy;
- adds HSTS;
- sets `FORWARDED_ALLOW_IPS` on the API, which is reachable only inside the Compose network, so
  logs and rate limits see the real client address.

## Vercel

Two Vercel projects from this repository, plus a PostgreSQL database (Neon through the Vercel
Marketplace was used):

| Project | Root directory | Framework preset | Environment |
|---|---|---|---|
| API | `apps/api` | FastAPI (entrypoint `apps/api/index.py`) | `ARCHITECTFLOW_DATABASE_URL` (sensitive): the provider's **pooled** URL with the scheme changed to `postgresql+psycopg://` |
| Web | `apps/web` | Next.js | `ARCHITECTFLOW_API_ORIGIN`: the API project's production URL, read at build time |

Run migrations from a trusted machine before the first deploy and after every schema change,
using the provider's direct (unpooled) URL:

```bash
cd apps/api
ARCHITECTFLOW_DATABASE_URL='postgresql+psycopg://…' uv run alembic upgrade head
```

The browser only talks to the web project; it proxies `/api/*` to the API, so the session cookie
stays first-party. Rate limits (login, AI requests, exports, share-link lookups) are counted in
the PostgreSQL table `rate_limit_hits`, so every function instance enforces the same limit; no
Redis or other service is needed. Each rate-limited request costs one extra statement on its own
short transaction. The table must exist: run the migrations (above) **before** deploying a
version that includes migration `0002`. If it is missing or unreachable, requests are allowed
and the function logs `rate limiter ... hit a database error; request allowed without a limit
check`; watch the API project's logs for that message. Keep `ARCHITECTFLOW_RATE_LIMIT_BACKEND`
unset (or `database`) on Vercel; `memory` brings back per-instance counting. The share-link
lookup limit is keyed by client address as seen by the API.

## Checklist
- HTTPS everywhere; keep `ARCHITECTFLOW_SECURE_COOKIES=true`.
- Back up PostgreSQL (revisions are the only copy of designs).
- Set provider keys only on the API container; review provider data-processing terms.
- `ARCHITECTFLOW_API_ORIGIN` is baked into the web build; rebuild when it changes.

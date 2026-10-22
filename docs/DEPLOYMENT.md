# Deployment

ArchitectFlow is three processes: PostgreSQL, the FastAPI API (long-running Python) and the
Next.js server. A static or serverless host alone (e.g. Vercel) can host the web app but **not**
the API and database as-is.

| Option | Status |
|---|---|
| `scripts/dev.sh` on one machine | **Verified** locally (macOS, PostgreSQL 17, Node 24, Python 3.12). |
| `docker compose up` on a VM behind a TLS reverse proxy (Caddy/nginx) | Compose stack **built and run on arm64** (Colima): core-journey E2E 3/3 against the containers. amd64 verified under QEMU emulation (core journey 1/1); the TLS proxy example is described below. |
| Managed PostgreSQL + container host (Fly.io, Render, Railway…) for the API and web | **Untested.** Same images; set `ARCHITECTFLOW_DATABASE_URL` and build web with `ARCHITECTFLOW_API_ORIGIN`. |

## Docker Compose

```bash
export POSTGRES_PASSWORD=$(openssl rand -hex 24)
docker compose up --build -d     # web on 127.0.0.1:3000
```

Put HTTPS in front (cookies are `Secure` by default). The API image runs `alembic upgrade head`
before starting. Run **one API worker per container**: rate limits are per process.

## Checklist
- HTTPS everywhere; keep `ARCHITECTFLOW_SECURE_COOKIES=true`.
- Back up PostgreSQL (revisions are the only copy of designs).
- Set provider keys only on the API container; review provider data-processing terms.
- `ARCHITECTFLOW_API_ORIGIN` is baked into the web build; rebuild when it changes.

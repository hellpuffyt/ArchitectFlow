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

## Checklist
- HTTPS everywhere; keep `ARCHITECTFLOW_SECURE_COOKIES=true`.
- Back up PostgreSQL (revisions are the only copy of designs).
- Set provider keys only on the API container; review provider data-processing terms.
- `ARCHITECTFLOW_API_ORIGIN` is baked into the web build; rebuild when it changes.

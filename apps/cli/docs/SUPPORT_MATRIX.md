# Supported languages & frameworks

"Verified extraction" = the engine has specific, tested logic. Other languages are still
discovered and counted, and their imports traced where the syntax matches.

## Agent environments
| Environment | Status |
|---|---|
| Claude Code | ✅ supported (`.claude/skills/architectflow/SKILL.md`) |
| Codex | 🔎 detected, installer not yet available |
| Cursor | 🔎 detected, installer not yet available |

Compatibility is not claimed for an environment until its installer is implemented and tested.

## Languages (detection + imports)
TypeScript/JavaScript, Python, Go, Rust, Java, Kotlin, Ruby, PHP, C#, Swift, C/C++, Scala.

## Frameworks (declared-dependency detection)
Next.js, React, Vue, Svelte, Angular, Remix, Astro · Express, Fastify, NestJS, Koa, Hapi ·
FastAPI, Django, Flask, Starlette, Celery, aiohttp.

## HTTP routes (verified extraction)
FastAPI / APIRouter · Flask · Django `urls.py` · Express/Koa · NestJS controllers ·
Next.js app-router route handlers.

## Database schema (verified extraction)
Prisma · SQLAlchemy (Column / `mapped_column`) · Django models · TypeORM · raw SQL `CREATE TABLE`.
Migrations: Alembic, Prisma, Django, Knex.

## Infrastructure (verified extraction)
Dockerfile · Docker Compose services · GitHub Actions · Vercel · Netlify · Kubernetes manifests ·
Caddy · nginx.

## Known limits
- Test files that contain route-like string literals may surface as routes.
- Controller-prefix composition (NestJS) and dynamically registered routes are approximate.
- Non-verified languages get structure + imports but not framework-specific routes/entities.

# Contributing to ArchitectFlow

Thanks for helping! Good places to start are listed in
[docs/good-first-issues.md](docs/good-first-issues.md).

## Setup

Prerequisites: [uv](https://docs.astral.sh/uv/), Node.js 20.9+ (24 recommended), and
PostgreSQL 15+ server binaries (`initdb`, `pg_ctl`; e.g. Homebrew `postgresql@17` or the
`postgresql` package on Linux). Docker is optional.

```bash
scripts/dev.sh            # throwaway PostgreSQL + API on :8000 + web on :3000
```

## Checks (CI runs the same)

```bash
# API
cd apps/api && uv run ruff format --check . && uv run ruff check . && uv run mypy architectflow
uv run pytest             # needs PostgreSQL: scripts/dev-db.sh start
# Web
cd apps/web && npm run lint && npm run typecheck && npm test && npx next build
npx playwright test       # starts a fresh API + database automatically
bash scripts/test-dev-db.sh
```

## Ground rules

- The architecture document schema lives in `apps/api/architectflow/schema/`. If you change it,
  mirror it in `apps/web/lib/types.ts` / `design-types.ts` and re-export the JSON:
  `cd apps/api && uv run python -m architectflow.schema.export` — a test fails otherwise.
- Never trust model output or imported files: route them through `parse_operations` /
  `parse_document`.
- Every bug fix comes with a regression test. Don't skip or delete failing tests.
- Don't commit secrets, `.env` files or real customer designs.
- Be precise in docs: say what is implemented, experimental or planned.

By contributing you agree your work is dual-licensed under MIT OR Apache-2.0.

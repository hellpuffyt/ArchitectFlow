# ArchitectFlow API. Validated in CI (docker build job); not built on the author's machine.
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY --from=ghcr.io/astral-sh/uv:0.12 /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY architectflow ./architectflow
COPY migrations ./migrations
COPY alembic.ini ./
RUN useradd --system --uid 10001 app && chown -R app /app
USER app
EXPOSE 8000
# Run migrations, then serve. Use one worker per container (rate limits are per process).
CMD ["sh", "-c", "uv run --frozen --no-dev alembic upgrade head && uv run --frozen --no-dev uvicorn architectflow.main:app --host 0.0.0.0 --port 8000 --proxy-headers"]

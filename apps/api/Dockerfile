# ArchitectFlow API image (built and run with Docker Compose on arm64; amd64 via CI).
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
# Run the virtualenv built at image time directly: `uv run` would need a writable cache
# directory, and the unprivileged user has no home directory.
ENV PATH="/app/.venv/bin:$PATH"
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn architectflow.main:app --host 0.0.0.0 --port 8000 --proxy-headers"]

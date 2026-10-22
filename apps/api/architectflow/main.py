"""FastAPI application factory."""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy.exc import OperationalError, SQLAlchemyError

from . import __version__
from .config import get_settings
from .routes import account, ai, auth, design, exports, projects, prompts, share


def create_app() -> FastAPI:
    app = FastAPI(
        title="ArchitectFlow API",
        version=__version__,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        redoc_url=None,
    )
    max_bytes = get_settings().max_request_bytes

    @app.middleware("http")
    async def limit_body(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        length = request.headers.get("content-length")
        if length is not None and length.isdigit() and int(length) > max_bytes:
            return JSONResponse(
                {"detail": f"Request body exceeds {max_bytes} bytes."}, status_code=413
            )
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "same-origin")
        response.headers.setdefault("Cache-Control", "no-store")
        return response

    @app.exception_handler(OperationalError)
    async def db_unavailable(_: Request, exc: OperationalError) -> JSONResponse:
        return JSONResponse(
            {
                "detail": "The database is unavailable. Your last change was NOT saved; "
                "retry when the service is back."
            },
            status_code=503,
        )

    @app.exception_handler(SQLAlchemyError)
    async def db_error(_: Request, exc: SQLAlchemyError) -> JSONResponse:
        return JSONResponse(
            {"detail": "A database error occurred; nothing was saved."}, status_code=500
        )

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "version": __version__}

    for module in (auth, projects, ai, prompts, design, exports, share, account):
        app.include_router(module.router)
    return app


app = create_app()

"""FastAPI application factory."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DataError, OperationalError, SQLAlchemyError

from . import __version__
from .config import get_settings
from .routes import account, ai, auth, design, exports, projects, prompts, share

if TYPE_CHECKING:
    from starlette.types import ASGIApp, Message, Receive, Scope, Send


def create_app() -> FastAPI:
    app = FastAPI(
        title="ArchitectFlow API",
        version=__version__,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        redoc_url=None,
    )
    max_bytes = get_settings().max_request_bytes
    # Bounds bodies while they are read, including chunked ones without Content-Length.
    # Added first so it sits inside limit_body and raises within the request's own task.
    app.add_middleware(BodyLimit, max_bytes=max_bytes)

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

    @app.exception_handler(DataError)
    async def db_rejected_value(_: Request, exc: DataError) -> JSONResponse:
        # The database refused a submitted value (e.g. a NUL character in text or an
        # out-of-range number). That is the client's input, not a server fault.
        return JSONResponse(
            {
                "detail": "A submitted value cannot be stored (for example text containing a "
                "NUL character, or a number out of range); nothing was saved."
            },
            status_code=422,
        )

    @app.exception_handler(RequestValidationError)
    async def invalid_request(_: Request, exc: RequestValidationError) -> JSONResponse:
        # FastAPI's default echoes the offending input back, which fails (RecursionError)
        # on deeply nested bodies and can be very large; report location and reason only.
        errors = [
            {
                "type": str(e.get("type", "")),
                "loc": [_printable(p) for p in e.get("loc", ())][:20],
                "msg": _printable(e.get("msg", "invalid")),
            }
            for e in exc.errors()[:50]
        ]
        return JSONResponse({"detail": errors}, status_code=422)

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


class BodyLimit:
    """Reject request bodies larger than ``max_bytes`` while they are read (413)."""

    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        received = 0

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise HTTPException(413, f"Request body exceeds {self.max_bytes} bytes.")
            return message

        await self.app(scope, limited_receive, send)


def _printable(value: object) -> str | int:
    if isinstance(value, int):
        return value
    text = str(value)[:200]
    return text.encode("utf-8", "backslashreplace").decode("utf-8")


app = create_app()

"""Fixtures. API tests run against a REAL PostgreSQL server (no mocks, no SQLite).

Set ARCHITECTFLOW_TEST_ADMIN_URL to a role that may CREATE/DROP DATABASE; the default
matches scripts/dev-db.sh. Each test session gets a fresh, migrated database.
"""

from __future__ import annotations

import os
import secrets
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

ADMIN_URL = os.environ.get(
    "ARCHITECTFLOW_TEST_ADMIN_URL",
    "postgresql+psycopg://architectflow@127.0.0.1:54329/postgres",
)


@pytest.fixture(scope="session")
def database_url() -> Iterator[str]:
    name = f"af_test_{secrets.token_hex(4)}"
    admin = create_engine(ADMIN_URL, isolation_level="AUTOCOMMIT")
    try:
        with admin.connect() as conn:
            conn.execute(text(f'CREATE DATABASE "{name}"'))
    except Exception as exc:  # pragma: no cover - environment problem, report clearly
        pytest.fail(
            f"PostgreSQL is not reachable at {ADMIN_URL} ({exc}). "
            "Start it with scripts/dev-db.sh start or set ARCHITECTFLOW_TEST_ADMIN_URL."
        )
    url = make_url(ADMIN_URL).set(database=name).render_as_string(hide_password=False)
    try:
        yield url
    finally:
        with admin.connect() as conn:
            conn.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
        admin.dispose()


@pytest.fixture(scope="session")
def app(database_url: str):  # type: ignore[no-untyped-def]
    os.environ["ARCHITECTFLOW_DATABASE_URL"] = database_url
    os.environ["ARCHITECTFLOW_SECURE_COOKIES"] = "false"
    os.environ["ARCHITECTFLOW_AI_PROVIDER"] = "example"
    os.environ["ARCHITECTFLOW_AI_REQUESTS_PER_MINUTE"] = "1000"
    from alembic import command
    from alembic.config import Config

    from architectflow import config, db

    config.get_settings.cache_clear()
    db.get_engine.cache_clear()
    db._factory.cache_clear()
    here = os.path.dirname(os.path.dirname(__file__))
    cfg = Config(os.path.join(here, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(here, "migrations"))
    command.upgrade(cfg, "head")
    from architectflow.main import create_app

    return create_app()


class Api:
    """Thin client wrapper that tracks the CSRF token like the web app does."""

    def __init__(self, client: TestClient) -> None:
        self.c = client
        self.csrf = ""

    def signup(self, email: str, password: str = "correct horse battery") -> dict:  # noqa: S107
        r = self.c.post("/api/auth/signup", json={"email": email, "password": password})
        assert r.status_code == 201, r.text
        self.csrf = r.json()["csrf_token"]
        return r.json()

    def _h(self) -> dict[str, str]:
        return {"x-csrf-token": self.csrf}

    def get(self, url: str, **kw):  # type: ignore[no-untyped-def]
        return self.c.get(url, **kw)

    def post(self, url: str, json=None, **kw):  # type: ignore[no-untyped-def]
        return self.c.post(url, json=json, headers=self._h(), **kw)

    def put(self, url: str, json=None):  # type: ignore[no-untyped-def]
        return self.c.put(url, json=json, headers=self._h())

    def patch(self, url: str, json=None):  # type: ignore[no-untyped-def]
        return self.c.patch(url, json=json, headers=self._h())

    def delete(self, url: str, json=None):  # type: ignore[no-untyped-def]
        return self.c.request("DELETE", url, json=json, headers=self._h())


@pytest.fixture
def api(app) -> Api:  # type: ignore[no-untyped-def]
    return Api(TestClient(app))


@pytest.fixture
def make_api(app):  # type: ignore[no-untyped-def]
    return lambda: Api(TestClient(app))


@pytest.fixture
def email() -> str:
    return f"user-{secrets.token_hex(4)}@example.com"

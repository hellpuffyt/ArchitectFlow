"""Rate limiting shared through PostgreSQL (and the in-memory fallback).

The cross-instance property is tested with two separate SQLAlchemy engines, each standing in
for one API process / serverless instance.
"""

from __future__ import annotations

import hashlib
import logging
import secrets
import time
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor

import pytest
from pydantic import ValidationError
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import make_url

from architectflow.config import Settings, get_settings
from architectflow.ratelimit import DatabaseRateLimiter, RateLimiter

WINDOW = 60.0
T0 = 1_800_000_000.0  # a multiple of 60: the start of a window


class Clock:
    def __init__(self, now: float = T0) -> None:
        self.now = now

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def engines(app, database_url: str) -> Iterator[tuple[Engine, Engine]]:  # type: ignore[no-untyped-def]
    # `app` runs the migrations; each engine is one "instance" with its own connection pool.
    one, two = create_engine(database_url), create_engine(database_url)
    try:
        yield one, two
    finally:
        one.dispose()
        two.dispose()


@pytest.fixture
def limiter_log(caplog: pytest.LogCaptureFixture, monkeypatch: pytest.MonkeyPatch):  # type: ignore[no-untyped-def]
    # The migrations run by the `app` fixture call logging.config.fileConfig, which disables
    # loggers that already exist; re-enable ours for the duration of the test.
    monkeypatch.setattr(logging.getLogger("architectflow.ratelimit"), "disabled", False)
    with caplog.at_level(logging.ERROR, logger="architectflow.ratelimit"):
        yield caplog


def _away_from_window_edge() -> None:
    """Route tests use the real clock; start them well inside a 60 s window."""
    into = time.time() % WINDOW
    if into > WINDOW - 10:
        time.sleep(WINDOW - into + 0.1)


def _name() -> str:
    return f"test-{secrets.token_hex(4)}"


def _limiter(engine: Engine, name: str, limit: int, clock: Clock, **kw) -> DatabaseRateLimiter:  # type: ignore[no-untyped-def]
    kw.setdefault("cleanup_probability", 0.0)
    return DatabaseRateLimiter(name, limit, WINDOW, engine=lambda: engine, clock=clock, **kw)


def test_limit_is_enforced_per_key(engines: tuple[Engine, Engine]) -> None:
    limiter = _limiter(engines[0], _name(), 3, Clock())
    assert [limiter.allow("a") for _ in range(5)] == [True, True, True, False, False]
    assert limiter.allow("b") is True  # other keys are independent


def test_limiters_with_different_names_do_not_share_counts(
    engines: tuple[Engine, Engine],
) -> None:
    clock = Clock()
    ai, export = _limiter(engines[0], _name(), 1, clock), _limiter(engines[0], _name(), 1, clock)
    assert ai.allow("user-1") is True
    assert export.allow("user-1") is True
    assert ai.allow("user-1") is False


def test_window_slides_and_resets(engines: tuple[Engine, Engine]) -> None:
    clock = Clock()
    limiter = _limiter(engines[0], _name(), 4, clock)
    assert [limiter.allow("k") for _ in range(5)] == [True] * 4 + [False]
    # Start of the next window: the previous one still counts fully.
    clock.now = T0 + WINDOW
    assert limiter.allow("k") is False
    # Halfway through: the previous window weighs 4 * 0.5 = 2, so two more fit.
    clock.now = T0 + 1.5 * WINDOW
    assert [limiter.allow("k") for _ in range(3)] == [True, True, False]
    # Two windows later nothing overlaps any more: the full limit is available again.
    clock.now = T0 + 3 * WINDOW
    assert [limiter.allow("k") for _ in range(5)] == [True] * 4 + [False]


def test_two_instances_share_the_count(engines: tuple[Engine, Engine]) -> None:
    clock, name = Clock(), _name()
    first, second = _limiter(engines[0], name, 4, clock), _limiter(engines[1], name, 4, clock)
    results = [(first if i % 2 else second).allow("shared") for i in range(8)]
    assert results == [True] * 4 + [False] * 4
    assert first.allow("shared") is False
    assert second.allow("shared") is False


def test_concurrent_requests_never_exceed_the_limit(engines: tuple[Engine, Engine]) -> None:
    clock, name = Clock(), _name()
    limiters = [_limiter(engines[i % 2], name, 10, clock) for i in range(2)]
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda i: limiters[i % 2].allow("burst"), range(60)))
    assert results.count(True) == 10


def test_keys_are_hashed_and_expired_rows_are_cleaned_up(
    engines: tuple[Engine, Engine],
) -> None:
    engine, name, clock = engines[0], _name(), Clock()
    limiter = _limiter(engine, name, 5, clock)
    limiter.allow("203.0.113.9|someone@example.com")
    hashed = hashlib.sha256(f"{name}\x00203.0.113.9|someone@example.com".encode()).hexdigest()
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT key, count FROM rate_limit_hits WHERE key = :k"), {"k": hashed}
        ).all()
        assert [tuple(r) for r in rows] == [(hashed, 1)]
        raw = conn.execute(
            text("SELECT count(*) FROM rate_limit_hits WHERE key LIKE '%example.com%'")
        ).scalar_one()
        assert raw == 0
    # Two windows later the row is expired; a call that runs the cleanup deletes it.
    clock.now = T0 + 2 * WINDOW + 1
    _limiter(engine, name, 5, clock, cleanup_probability=1.0).allow("other")
    with engine.connect() as conn:
        left = conn.execute(
            text("SELECT window_start FROM rate_limit_hits WHERE key = :k"), {"k": hashed}
        ).all()
    assert left == []


def test_database_error_allows_the_request_and_logs(limiter_log: pytest.LogCaptureFixture) -> None:
    unreachable = create_engine(
        "postgresql+psycopg://nobody@127.0.0.1:9/none", connect_args={"connect_timeout": 2}
    )
    limiter = DatabaseRateLimiter("login", 1, engine=lambda: unreachable)
    assert limiter.allow("k") is True
    assert limiter.allow("k") is True  # fails open every time, not just once
    assert "hit a database error; request allowed without a limit check" in limiter_log.text
    assert "'login'" in limiter_log.text
    assert len(limiter_log.records) == 2
    unreachable.dispose()


def test_missing_table_allows_the_request_and_logs(  # type: ignore[no-untyped-def]
    app, database_url: str, limiter_log: pytest.LogCaptureFixture
) -> None:
    # A database where the migration has not been applied (the cluster's `postgres` DB).
    url = make_url(database_url).set(database="postgres").render_as_string(hide_password=False)
    engine = create_engine(url)
    assert DatabaseRateLimiter("ai", 1, engine=lambda: engine).allow("k") is True
    assert "request allowed" in limiter_log.text
    assert "rate_limit_hits" in limiter_log.text  # the cause (missing table) is in the log
    engine.dispose()


def test_backend_setting(monkeypatch: pytest.MonkeyPatch, engines) -> None:  # type: ignore[no-untyped-def]
    assert Settings().rate_limit_backend == "database"
    monkeypatch.setenv("ARCHITECTFLOW_RATE_LIMIT_BACKEND", "memory")
    assert Settings().rate_limit_backend == "memory"
    monkeypatch.setenv("ARCHITECTFLOW_RATE_LIMIT_BACKEND", "redis")
    with pytest.raises(ValidationError):
        Settings()
    monkeypatch.delenv("ARCHITECTFLOW_RATE_LIMIT_BACKEND")

    limiter = RateLimiter(_name(), 2)
    limiter.database = _limiter(engines[0], limiter.name, 2, Clock())
    monkeypatch.setattr(get_settings(), "rate_limit_backend", "memory")
    assert [limiter.allow("k") for _ in range(3)] == [True, True, False]
    # The memory backend never touched the shared counter.
    monkeypatch.setattr(get_settings(), "rate_limit_backend", "database")
    assert [limiter.allow("k") for _ in range(3)] == [True, True, False]


def test_login_limit_is_shared_with_other_instances(make_api, engines, email: str) -> None:  # type: ignore[no-untyped-def]
    _away_from_window_edge()
    api = make_api()
    api.signup(email)
    limit = get_settings().login_attempts_per_minute
    # Another API instance (its own engine) already counted `limit` attempts for this
    # client address + email in the current window; TestClient's address is "testclient".
    other = DatabaseRateLimiter("login", limit, engine=lambda: engines[1], cleanup_probability=0)
    for _ in range(limit):
        assert other.allow(f"testclient|{email}") is True
    r = api.post("/api/auth/login", {"email": email, "password": "correct horse battery"})
    assert r.status_code == 429, r.text


def test_failed_logins_are_counted_and_then_refused(make_api, email: str) -> None:  # type: ignore[no-untyped-def]
    _away_from_window_edge()
    api = make_api()
    api.signup(email)
    limit = get_settings().login_attempts_per_minute
    for _ in range(limit):
        r = api.post("/api/auth/login", {"email": email, "password": "wrong password!"})
        assert r.status_code == 401, r.text
    r = api.post("/api/auth/login", {"email": email, "password": "correct horse battery"})
    assert r.status_code == 429

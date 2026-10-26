"""Rate limiting shared by every API process and serverless instance.

Routes use `RateLimiter(name, limit).allow(key)`. The backend is chosen per call from
`ARCHITECTFLOW_RATE_LIMIT_BACKEND`:

- `database` (default): counts live in the PostgreSQL table `rate_limit_hits`, so all API
  processes see the same count. One atomic `INSERT ... ON CONFLICT DO UPDATE` per call.
- `memory`: the per-process sliding window (tests, offline use, a single long-running worker).

The database limiter is a sliding-window *counter*: the current fixed window's count plus the
previous window's count weighted by how much of it still overlaps the last `window` seconds.
Requests that are refused are not counted, as with the in-memory limiter.

On a database error the database limiter **allows** the request and logs an error. Every
rate-limited route needs the database itself, so while it is unreachable the request fails
with 503 anyway; see docs/SECURITY_MODEL.md.
"""

from __future__ import annotations

import hashlib
import logging
import math
import random
import threading
import time
from collections import deque
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from sqlalchemy import Engine, text
from sqlalchemy.exc import SQLAlchemyError

from .config import get_settings
from .db import get_engine

log = logging.getLogger("architectflow.ratelimit")


class MemoryRateLimiter:
    """Sliding-window limiter keyed by an arbitrary string; state is per process."""

    def __init__(self, limit: int, window_seconds: float = 60.0) -> None:
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            hits = self._hits.setdefault(key, deque())
            while hits and now - hits[0] > self.window:
                hits.popleft()
            if len(hits) >= self.limit:
                return False
            hits.append(now)
            if len(self._hits) > 50_000:
                self._hits = {k: v for k, v in self._hits.items() if v}
            return True


# One statement, so the check and the increment are atomic across instances: concurrent
# callers for the same key serialize on the row lock taken by ON CONFLICT DO UPDATE, and the
# WHERE clause is evaluated against the latest committed count. No row returned = refused.
_HIT = text(
    """
    WITH prev AS (
        SELECT coalesce(max(count), 0) AS c
        FROM rate_limit_hits
        WHERE key = :key AND window_start = :prev_start
    )
    INSERT INTO rate_limit_hits AS r (key, window_start, count, expires_at)
    SELECT :key, :window_start, 1, :expires_at
    FROM prev
    WHERE prev.c * CAST(:weight AS double precision) < :limit
    ON CONFLICT (key, window_start) DO UPDATE SET count = r.count + 1
    WHERE r.count + (SELECT c FROM prev) * CAST(:weight AS double precision) < :limit
    RETURNING r.count
    """
)
_CLEANUP = text("DELETE FROM rate_limit_hits WHERE expires_at < :now")


class DatabaseRateLimiter:
    """Sliding-window counter in PostgreSQL, shared by every instance using the database."""

    def __init__(
        self,
        name: str,
        limit: int,
        window_seconds: float = 60.0,
        *,
        engine: Callable[[], Engine] = get_engine,
        clock: Callable[[], float] = time.time,
        cleanup_probability: float = 0.01,
    ) -> None:
        self.name = name
        self.limit = limit
        self.window = window_seconds
        self._engine = engine
        self._clock = clock
        self._cleanup_probability = cleanup_probability

    def _key(self, key: str) -> str:
        # Namespaced per limiter (AI and export limits are both keyed by user id) and hashed,
        # so client addresses and emails are not stored.
        return hashlib.sha256(f"{self.name}\x00{key}".encode()).hexdigest()

    def allow(self, key: str) -> bool:
        now = self._clock()
        start = math.floor(now / self.window) * self.window
        weight = 1.0 - (now - start) / self.window
        window_start = datetime.fromtimestamp(start, UTC)
        params = {
            "key": self._key(key),
            "window_start": window_start,
            "prev_start": window_start - timedelta(seconds=self.window),
            "expires_at": window_start + timedelta(seconds=2 * self.window),
            "weight": weight,
            "limit": self.limit,
        }
        try:
            with self._engine().begin() as conn:
                allowed = conn.execute(_HIT, params).first() is not None
                if random.random() < self._cleanup_probability:  # noqa: S311 - not security
                    conn.execute(_CLEANUP, {"now": datetime.fromtimestamp(now, UTC)})
        except SQLAlchemyError:
            # Fail open: see the module docstring and docs/SECURITY_MODEL.md.
            log.error(
                "rate limiter %r hit a database error; request allowed without a limit check",
                self.name,
                exc_info=True,
            )
            return True
        return allowed


class RateLimiter:
    """The limiter routes use; picks the backend from settings on every call."""

    def __init__(self, name: str, limit: int, window_seconds: float = 60.0) -> None:
        self.name = name
        self.memory = MemoryRateLimiter(limit, window_seconds)
        self.database = DatabaseRateLimiter(name, limit, window_seconds)

    def allow(self, key: str) -> bool:
        if get_settings().rate_limit_backend == "memory":
            return self.memory.allow(key)
        return self.database.allow(key)

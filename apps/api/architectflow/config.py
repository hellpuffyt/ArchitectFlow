"""Runtime configuration from environment variables (see docs/CONFIGURATION.md)."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ARCHITECTFLOW_", env_file=None)

    database_url: str = "postgresql+psycopg://architectflow@127.0.0.1:54329/architectflow"
    # Cookies get the Secure flag; set false only for plain-http local development.
    secure_cookies: bool = True
    session_ttl_hours: int = Field(default=24 * 7, ge=1, le=24 * 90)
    ai_provider: Literal["example", "openai", "anthropic"] = "example"
    ai_api_key: SecretStr | None = None
    ai_model: str = ""
    ai_base_url: str = ""
    ai_timeout_seconds: float = Field(default=60.0, gt=0, le=600)
    ai_requests_per_minute: int = Field(default=10, ge=1, le=1000)
    login_attempts_per_minute: int = Field(default=10, ge=1, le=1000)
    exports_per_minute: int = Field(default=60, ge=1, le=10000)
    # database: counts shared by every API instance (PostgreSQL); memory: per process.
    rate_limit_backend: Literal["database", "memory"] = "database"
    max_request_bytes: int = Field(default=2_000_000, ge=10_000)


@lru_cache
def get_settings() -> Settings:
    return Settings()

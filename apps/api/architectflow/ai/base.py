"""Provider-independent AI interface."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Protocol

from ..schema import ArchitectureDocument

EXAMPLE_MODE_NOTICE = "Example mode — no AI provider configured"


@dataclass
class ProviderResult:
    """Raw, untrusted provider output. ``operations`` is validated by the caller."""

    explanation: str
    operations: list[dict[str, Any]]
    questions: list[str] = field(default_factory=list)


class AIProvider(Protocol):
    name: str
    # "example" = deterministic local templates, "live" = a real model API.
    mode: Literal["example", "live"]

    async def propose_architecture(
        self, vision: str, current: ArchitectureDocument
    ) -> ProviderResult: ...

    async def propose_edit(self, request: str, current: ArchitectureDocument) -> ProviderResult: ...

    async def propose_design(
        self, request: str, current: ArchitectureDocument
    ) -> ProviderResult: ...


class ProviderError(RuntimeError):
    """The provider failed or returned something unusable.

    ``status`` is the HTTP status the API should answer with: 502 (bad/unreachable
    provider), 504 (timeout) or 429 (provider rate limit).
    """

    def __init__(self, message: str, status: int = 502) -> None:
        super().__init__(message)
        self.status = status

"""AI providers and structured change sets."""

from .base import EXAMPLE_MODE_NOTICE, AIProvider, ProviderError, ProviderResult
from .changes import (
    ChangeSetInvalid,
    ChangeSummary,
    Operation,
    apply_operations,
    parse_operations,
    summarize,
)
from .example import ExampleProvider
from .llm import AnthropicProvider, OpenAICompatibleProvider

__all__ = [
    "EXAMPLE_MODE_NOTICE",
    "AIProvider",
    "AnthropicProvider",
    "ChangeSetInvalid",
    "ChangeSummary",
    "ExampleProvider",
    "OpenAICompatibleProvider",
    "Operation",
    "ProviderError",
    "ProviderResult",
    "apply_operations",
    "parse_operations",
    "summarize",
]

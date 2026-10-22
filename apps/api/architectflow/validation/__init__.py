"""Deterministic architecture validation (independent of any LLM)."""

from .engine import run_validation
from .findings import Finding, Severity
from .integrity import DocumentInvalid, check_integrity, parse_document

__all__ = [
    "DocumentInvalid",
    "Finding",
    "Severity",
    "check_integrity",
    "parse_document",
    "run_validation",
]

"""Run integrity checks and recommendation rules over a saved document."""

from __future__ import annotations

from ..schema import ArchitectureDocument
from .context import GraphContext
from .findings import Finding
from .integrity import check_integrity
from .rules import ALL_RULES

_SEVERITY_ORDER = {"error": 0, "warning": 1, "info": 2}


def run_validation(doc: ArchitectureDocument) -> list[Finding]:
    """Return all findings, schema errors first, then by severity and rule."""
    findings = check_integrity(doc)
    ctx = GraphContext.build(doc)
    for rule in ALL_RULES:
        findings.extend(rule(ctx))
    unique = {f.id: f for f in findings}
    return sorted(
        unique.values(),
        key=lambda f: (f.kind != "schema_error", _SEVERITY_ORDER[f.severity], f.rule, f.id),
    )

"""Validation finding model."""

from __future__ import annotations

import hashlib
from typing import Literal

from pydantic import BaseModel, Field

Severity = Literal["error", "warning", "info"]
Kind = Literal["schema_error", "recommendation"]


class Finding(BaseModel):
    """One validation result.

    ``kind`` separates definite defects in the document (``schema_error``: the design
    is malformed) from architectural advice (``recommendation``: a judgement the
    team may reasonably overrule). Recommendations are never described as
    confirmed vulnerabilities.
    """

    id: str
    rule: str
    severity: Severity
    kind: Kind
    title: str
    explanation: str
    evidence: str
    remediation: str
    node_ids: list[str] = Field(default_factory=list)
    edge_ids: list[str] = Field(default_factory=list)
    # Where in the document to fix it: a dotted path in the same format as schema errors
    # (``edges.3.target``, ``design.pages.0.layout.children.2``). For findings about
    # something *absent*, it names the collection where the fix belongs (e.g. ``decisions``).
    path: str = ""


def make_finding(
    rule: str,
    severity: Severity,
    kind: Kind,
    title: str,
    explanation: str,
    evidence: str,
    remediation: str,
    node_ids: list[str] | None = None,
    edge_ids: list[str] | None = None,
    path: str = "",
) -> Finding:
    """Build a finding with a stable id derived from the rule and affected elements."""
    nodes = sorted(node_ids or [])
    edges = sorted(edge_ids or [])
    digest = hashlib.sha256(
        "|".join([rule, ",".join(nodes), ",".join(edges), evidence]).encode()
    ).hexdigest()[:12]
    return Finding(
        id=f"{rule}:{digest}",
        rule=rule,
        severity=severity,
        kind=kind,
        title=title,
        explanation=explanation,
        evidence=evidence,
        remediation=remediation,
        node_ids=nodes,
        edge_ids=edges,
        path=path,
    )

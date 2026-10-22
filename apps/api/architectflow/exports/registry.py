"""Export format registry."""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass

from ..schema import ArchitectureDocument
from . import design, diagrams, specs

Renderer = Callable[[ArchitectureDocument, str, int], str]


@dataclass(frozen=True)
class ExportFormat:
    key: str
    label: str
    media_type: str
    extension: str
    render: Renderer
    # Can the output be imported back into ArchitectFlow without losing information?
    round_trip: bool = False


def _bundle(doc: ArchitectureDocument, title: str, revision: int) -> str:
    return (
        json.dumps(
            {
                "format": "architectflow-bundle",
                "version": 1,
                "project": {"name": title},
                "source_revision": revision,
                "document": doc.model_dump(mode="json"),
            },
            indent=2,
        )
        + "\n"
    )


_MD, _TXT, _JSON = "text/markdown", "text/plain", "application/json"
FORMATS: dict[str, ExportFormat] = {
    f.key: f
    for f in [
        ExportFormat(
            "json",
            "Architecture JSON",
            _JSON,
            "architecture.json",
            lambda d, t, r: json.dumps(d.model_dump(mode="json"), indent=2) + "\n",
            True,
        ),
        ExportFormat("bundle", "Project bundle", _JSON, "bundle.json", _bundle, True),
        ExportFormat(
            "mermaid",
            "Architecture (Mermaid)",
            _TXT,
            "architecture.mmd",
            lambda d, t, r: diagrams.mermaid_flowchart(d),
        ),
        ExportFormat(
            "plantuml",
            "Components (PlantUML)",
            _TXT,
            "components.puml",
            lambda d, t, r: diagrams.plantuml(d),
        ),
        ExportFormat(
            "c4-context",
            "C4 system context (Mermaid)",
            _TXT,
            "c4-context.mmd",
            lambda d, t, r: diagrams.c4(d, "context", t),
        ),
        ExportFormat(
            "c4-container",
            "C4 containers (Mermaid)",
            _TXT,
            "c4-container.mmd",
            lambda d, t, r: diagrams.c4(d, "container", t),
        ),
        ExportFormat(
            "sequence",
            "Sequence diagrams (Mermaid)",
            _TXT,
            "sequence.mmd",
            lambda d, t, r: diagrams.sequence(d),
        ),
        ExportFormat(
            "erd",
            "Entity relationships (Mermaid)",
            _TXT,
            "erd.mmd",
            lambda d, t, r: diagrams.erd(d),
        ),
        ExportFormat(
            "dataflow",
            "Data flow (Mermaid)",
            _TXT,
            "dataflow.mmd",
            lambda d, t, r: diagrams.mermaid_flowchart(d, data_flow=True),
        ),
        ExportFormat(
            "dependencies",
            "Service dependencies (Mermaid)",
            _TXT,
            "dependencies.mmd",
            lambda d, t, r: diagrams.mermaid_flowchart(d, only_services=True),
        ),
        ExportFormat(
            "deployment",
            "Deployment (Mermaid)",
            _TXT,
            "deployment.mmd",
            lambda d, t, r: diagrams.mermaid_deployment(d),
        ),
        ExportFormat(
            "sql",
            "PostgreSQL DDL",
            "application/sql",
            "schema.sql",
            lambda d, t, r: specs.sql_ddl(d),
        ),
        ExportFormat("openapi", "OpenAPI 3.1", _JSON, "openapi.json", specs.openapi),
        ExportFormat("spec", "Technical spec (Markdown)", _MD, "spec.md", specs.tech_spec),
        ExportFormat(
            "tokens",
            "Theme tokens (JSON)",
            _JSON,
            "tokens.json",
            lambda d, t, r: design.tokens_json(d),
        ),
        ExportFormat(
            "css",
            "Theme tokens (CSS variables)",
            "text/css",
            "tokens.css",
            lambda d, t, r: design.tokens_css(d),
        ),
        ExportFormat(
            "design-spec", "Design spec (Markdown)", _MD, "design-spec.md", design.design_spec
        ),
        ExportFormat(
            "page-flow",
            "Page flow (Mermaid)",
            _TXT,
            "page-flow.mmd",
            lambda d, t, r: design.page_flow(d),
        ),
        ExportFormat(
            "routes", "Route map (JSON)", _JSON, "routes.json", lambda d, t, r: design.route_map(d)
        ),
        ExportFormat(
            "components",
            "Component inventory (Markdown)",
            _MD,
            "components.md",
            lambda d, t, r: design.component_inventory(d),
        ),
    ]
}


def render(key: str, doc: ArchitectureDocument, title: str, revision: int) -> str:
    return FORMATS[key].render(doc, title, revision)

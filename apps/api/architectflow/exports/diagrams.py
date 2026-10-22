"""Diagram exports derived from the architecture graph.

These are one-way views: they cannot be imported back (documented in
docs/EXPORTS.md). Node ids are remapped to n0, n1… so user-chosen ids can never
inject diagram syntax; labels are escaped.
"""

from __future__ import annotations

import itertools

from ..schema import NODE_TYPES, ArchitectureDocument
from .text import ident, mermaid_label, plantuml_label

_SHAPE = {
    "database": ("[(", ")]"),
    "cache": ("[(", ")]"),
    "search_index": ("[(", ")]"),
    "object_storage": ("[(", ")]"),
    "message_broker": ("[/", "/]"),
    "web_client": ("([", "])"),
    "mobile_client": ("([", "])"),
    "external_api": ("{{", "}}"),
}


def _ids(doc: ArchitectureDocument) -> dict[str, str]:
    return {n.id: ident(i) for i, n in enumerate(doc.nodes)}


def _node_line(doc: ArchitectureDocument, nid: str, ids: dict[str, str]) -> str:
    n = next(x for x in doc.nodes if x.id == nid)
    left, right = _SHAPE.get(n.type, ("[", "]"))
    label = n.label + (f" · {n.technology}" if n.technology else "")
    return f'    {ids[n.id]}{left}"{mermaid_label(label)}"{right}'


def mermaid_flowchart(
    doc: ArchitectureDocument, *, data_flow: bool = False, only_services: bool = False
) -> str:
    keep = {
        n.id
        for n in doc.nodes
        if not only_services or n.type in {"service", "worker", "api_gateway", "auth_service"}
    }
    ids = _ids(doc)
    lines = ["flowchart LR"]
    grouped: set[str] = set()
    for gi, g in enumerate(doc.groups):
        members = [m for m in g.node_ids if m in keep]
        if not members:
            continue
        lines.append(f'  subgraph {ident(gi, "g")}["{mermaid_label(g.label)}"]')
        lines += [_node_line(doc, m, ids) for m in members]
        lines.append("  end")
        grouped |= set(members)
    lines += [_node_line(doc, n.id, ids) for n in doc.nodes if n.id in keep - grouped]
    for e in doc.edges:
        if e.source not in keep or e.target not in keep:
            continue
        text = e.data if data_flow and e.data else " ".join(filter(None, [e.label, e.protocol]))
        arrow = "<-->" if e.direction == "two_way" else ("-.->" if not e.synchronous else "-->")
        lines.append(
            f'  {ids[e.source]} {arrow}|"{mermaid_label(text)}"| {ids[e.target]}'
            if text
            else f"  {ids[e.source]} {arrow} {ids[e.target]}"
        )
    return "\n".join(lines) + "\n"


def mermaid_deployment(doc: ArchitectureDocument) -> str:
    """Deployment view: groups as boundaries, replicas and infrastructure noted."""
    ids = _ids(doc)
    lines = ["flowchart TB"]
    grouped: set[str] = set()
    for gi, g in enumerate(doc.groups):
        lines.append(f'  subgraph {ident(gi, "g")}["{mermaid_label(g.label)} ({g.kind})"]')
        for m in g.node_ids:
            n = next(x for x in doc.nodes if x.id == m)
            lines.append(f'    {ids[m]}["{mermaid_label(f"{n.label} x{n.replicas}")}"]')
        lines.append("  end")
        grouped |= set(g.node_ids)
    for n in doc.nodes:
        if n.id not in grouped:
            lines.append(f'  {ids[n.id]}["{mermaid_label(f"{n.label} x{n.replicas}")}"]')
    for e in doc.edges:
        lines.append(f"  {ids[e.source]} --> {ids[e.target]}")
    return "\n".join(lines) + "\n"


def c4(doc: ArchitectureDocument, level: str, title: str) -> str:
    """Mermaid C4 (context or container) diagram."""
    ids = _ids(doc)
    lines = [
        "C4Context" if level == "context" else "C4Container",
        f'  title "{mermaid_label(title)}"',
    ]
    for a in doc.actors:
        lines.append(
            f'  Person({ident(doc.actors.index(a), "p")}, "{mermaid_label(a.name)}", '
            f'"{mermaid_label(a.description)}")'
        )
    internal = [
        n for n in doc.nodes if n.type not in {"external_api", "web_client", "mobile_client"}
    ]
    externals = [n for n in doc.nodes if n.type == "external_api"]
    if level == "context":
        lines.append('  System(sys, "System", "The system being designed")')
        for n in externals:
            lines.append(f'  System_Ext({ids[n.id]}, "{mermaid_label(n.label)}")')
        for i, _ in enumerate(doc.actors):
            lines.append(f'  Rel({ident(i, "p")}, sys, "Uses")')
        for n in externals:
            lines.append(f'  Rel(sys, {ids[n.id]}, "Calls")')
        return "\n".join(lines) + "\n"
    lines.append('  System_Boundary(b0, "System") {')
    for n in internal + [n for n in doc.nodes if n.type in {"web_client", "mobile_client"}]:
        kind = NODE_TYPES[n.type].c4_kind if n.type in NODE_TYPES else "container"
        macro = (
            "ContainerDb"
            if kind in {"container_db"}
            else ("ContainerQueue" if kind == "queue" else "Container")
        )
        lines.append(
            f'    {macro}({ids[n.id]}, "{mermaid_label(n.label)}", '
            f'"{mermaid_label(n.technology)}", "{mermaid_label(n.description)}")'
        )
    lines.append("  }")
    for n in externals:
        lines.append(f'  System_Ext({ids[n.id]}, "{mermaid_label(n.label)}")')
    for e in doc.edges:
        lines.append(
            f'  Rel({ids[e.source]}, {ids[e.target]}, "{mermaid_label(e.label or "")}", '
            f'"{mermaid_label(e.protocol)}")'
        )
    return "\n".join(lines) + "\n"


def sequence(doc: ArchitectureDocument) -> str:
    """One sequence per saved journey: consecutive steps become request messages."""
    if not doc.workflows:
        return "sequenceDiagram\n  Note over System: No journeys saved\n"
    ids = _ids(doc)
    labels = {n.id: n.label for n in doc.nodes}
    lines = ["sequenceDiagram"]
    used = {s for w in doc.workflows for s in w.steps if s in labels}
    lines += [
        f'  participant {ids[s]} as "{mermaid_label(labels[s])}"'
        for s in [n.id for n in doc.nodes if n.id in used]
    ]
    for w in doc.workflows:
        steps = [s for s in w.steps if s in labels]
        lines.append(f"  Note over {ids[steps[0]] if steps else 'System'}: {mermaid_label(w.name)}")
        for a, b in itertools.pairwise(steps):
            edge = next((e for e in doc.edges if e.source == a and e.target == b), None)
            msg = edge.label or edge.protocol if edge else "request"
            lines.append(f"  {ids[a]}->>{ids[b]}: {mermaid_label(msg)}")
    return "\n".join(lines) + "\n"


def erd(doc: ArchitectureDocument) -> str:
    ents = {e.id: e for e in doc.database.entities}
    lines = ["erDiagram"]
    for e in doc.database.entities:
        lines.append(f"  {e.name} {{")
        for f in e.fields:
            key = " PK" if f.primary_key else (" FK" if f.foreign_key else "")
            lines.append(f"    {f.type} {f.name}{key}")
        lines.append("  }")
    for e in doc.database.entities:
        for f in e.fields:
            if f.foreign_key and f.foreign_key.entity_id in ents:
                target = ents[f.foreign_key.entity_id].name
                lines.append(f'  {target} ||--o{{ {e.name} : "{mermaid_label(f.name)}"')
    return "\n".join(lines) + "\n"


def plantuml(doc: ArchitectureDocument) -> str:
    ids = _ids(doc)
    kinds = {
        "database": "database",
        "cache": "database",
        "search_index": "database",
        "object_storage": "storage",
        "message_broker": "queue",
        "web_client": "actor",
        "mobile_client": "actor",
        "external_api": "cloud",
    }
    lines = ["@startuml", "skinparam componentStyle rectangle"]
    for n in doc.nodes:
        label = n.label + (f"\\n{n.technology}" if n.technology else "")
        lines.append(f'{kinds.get(n.type, "component")} "{plantuml_label(label)}" as {ids[n.id]}')
    for e in doc.edges:
        arrow = "<-->" if e.direction == "two_way" else ("..>" if not e.synchronous else "-->")
        text = plantuml_label(" ".join(filter(None, [e.label, e.protocol])))
        lines.append(
            f"{ids[e.source]} {arrow} {ids[e.target]}" + (f" : {text}" if text.strip() else "")
        )
    lines.append("@enduml")
    return "\n".join(lines) + "\n"

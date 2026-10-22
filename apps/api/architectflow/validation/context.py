"""Pre-computed lookups shared by validation rules."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from ..schema import ArchitectureDocument, Edge, Node, NodeTypeSpec, node_type


@dataclass
class GraphContext:
    doc: ArchitectureDocument
    nodes: dict[str, Node] = field(default_factory=dict)
    specs: dict[str, NodeTypeSpec] = field(default_factory=dict)
    outgoing: dict[str, list[Edge]] = field(default_factory=dict)
    incoming: dict[str, list[Edge]] = field(default_factory=dict)
    requirement_text: str = ""

    @classmethod
    def build(cls, doc: ArchitectureDocument) -> GraphContext:
        ctx = cls(doc=doc)
        for node in doc.nodes:
            ctx.nodes[node.id] = node
            spec = node_type(node.type)
            if spec is not None:
                ctx.specs[node.id] = spec
            ctx.outgoing.setdefault(node.id, [])
            ctx.incoming.setdefault(node.id, [])
        for edge in doc.edges:
            if edge.source in ctx.nodes and edge.target in ctx.nodes:
                ctx.outgoing[edge.source].append(edge)
                ctx.incoming[edge.target].append(edge)
        texts = [doc.vision]
        texts += [r.text for r in doc.requirements.functional]
        texts += [r.text for r in doc.requirements.nonfunctional]
        texts += [c.text for c in doc.constraints]
        ctx.requirement_text = " ".join(texts).lower()
        return ctx

    def of_type(self, *keys: str) -> list[Node]:
        return [n for n in self.doc.nodes if n.type in keys]

    def category(self, node_id: str) -> str | None:
        spec = self.specs.get(node_id)
        return spec.category if spec else None

    def is_public(self, node: Node) -> bool:
        if node.public is not None:
            return node.public
        spec = self.specs.get(node.id)
        return bool(spec and spec.public_by_default)

    def mentions(self, *words: str) -> list[str]:
        """Return which of ``words`` appear as whole words in the requirement text."""
        return [w for w in words if re.search(rf"\b{re.escape(w)}", self.requirement_text)]

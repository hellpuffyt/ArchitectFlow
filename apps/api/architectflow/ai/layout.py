"""Deterministic placement for nodes added without a meaningful position."""

from __future__ import annotations

from ..schema import ArchitectureDocument, node_type

# Left-to-right columns roughly following request flow.
_COLUMN = {
    "client": 0,
    "edge": 1,
    "security": 1,
    "identity": 2,
    "compute": 2,
    "messaging": 3,
    "data": 4,
    "storage": 4,
    "external": 5,
    "operations": 5,
    "infrastructure": 5,
}
_DX, _DY = 260.0, 120.0


def place_new_nodes(doc: ArchitectureDocument, new_ids: set[str]) -> None:
    """Give nodes in ``new_ids`` that sit at the origin a free grid slot."""
    occupied = {
        (round(n.position.x), round(n.position.y)) for n in doc.nodes if n.id not in new_ids
    }
    for node in doc.nodes:
        if node.id not in new_ids or (node.position.x, node.position.y) != (0.0, 0.0):
            continue
        spec = node_type(node.type)
        col = _COLUMN.get(spec.category, 5) if spec else 5
        row = 0
        while (round(col * _DX), round(row * _DY)) in occupied:
            row += 1
        node.position.x, node.position.y = col * _DX, row * _DY
        occupied.add((round(node.position.x), round(node.position.y)))

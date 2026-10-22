"""Graph integrity, cycle policy and finding locations (unit, no database).

Every validation rule class must point at *where* to fix the problem: affected node/edge
ids and/or a document path that resolves inside the saved JSON. The corpus below triggers
every rule id defined in the validation package (checked by AST scan, so a new rule
without a trigger here fails the coverage assertion).
"""

from __future__ import annotations

import ast
import pathlib
from typing import Any

import pytest

from architectflow.schema import ArchitectureDocument
from architectflow.validation import DocumentInvalid, parse_document, run_validation
from architectflow.validation.findings import Finding


def node(i: str, t: str, **kw: Any) -> dict[str, Any]:
    return {"id": i, "type": t, "label": i.upper(), **kw}


def edge(i: str, s: str, t: str, **kw: Any) -> dict[str, Any]:
    return {"id": i, "source": s, "target": t, **kw}


def errors_of(raw: dict[str, Any]) -> list[dict[str, str]]:
    with pytest.raises(DocumentInvalid) as exc:
        parse_document(raw)
    return exc.value.errors


def resolve(doc: dict[str, Any], path: str) -> Any:
    cur: Any = doc
    for part in path.split("."):
        if isinstance(cur, list):
            cur = cur[int(part)]
        else:
            assert isinstance(cur, dict) and part in cur, (path, part)
            cur = cur[part]
    return cur


# --------------------------------------------------------------------------- corpus


def _layout(i: str, kind: str, **kw: Any) -> dict[str, Any]:
    return {"id": i, "kind": kind, **kw}


GRAPH = {
    "requirements": {
        "functional": [
            {"id": "r1", "text": "Track stock"},
            {"id": "r2", "text": "track stock"},
        ],
        "nonfunctional": [
            {"id": "n1", "text": "99.9% uptime with backups and zero downtime schema migration"},
            {"id": "n2", "text": "Must run on MySQL"},
        ],
    },
    "technology_preferences": ["MySQL 8"],
    "constraints": [
        {"id": "c1", "text": "Needs a cache", "kind": "requires_component", "value": "cache"},
        {"id": "c2", "text": "No MySQL", "kind": "forbids_technology", "value": "mysql"},
    ],
    "nodes": [
        node("web", "web_client"),
        node("gw", "api_gateway", description="entry"),
        node("s1", "service"),
        node("s2", "service", description="orders", technology="MySQL"),
        node("s3", "service", description="billing"),
        node("db", "database", public=True),
        node("db2", "database"),
        node("q", "message_broker"),
        node("ext", "external_api"),
    ],
    "edges": [
        edge("e1", "web", "db"),
        edge("e2", "db", "s1"),
        edge("e3", "web", "gw", encrypted=False),
        edge("e4", "gw", "ext", protocol="HTTP"),
        edge("e5", "s2", "s3"),
        edge("e6", "s3", "s2"),
        edge("e7", "s2", "db"),
        edge("e8", "s3", "db"),
        edge("e9", "s1", "q", properties={"retries": "unbounded"}),
        edge("e10", "gw", "s2"),
    ],
    "database": {"entities": [{"id": "t", "name": "t", "fields": []}]},
    "api": {"endpoints": [{"id": "x", "method": "GET", "path": "/x"}]},
}

UI = {
    "actors": [{"id": "admin", "name": "Admin"}],
    "database": {
        "entities": [
            {"id": "item", "name": "item", "fields": [{"id": "f1", "name": "sku"}]},
        ]
    },
    "api": {
        "endpoints": [
            {
                "id": "ep1",
                "method": "POST",
                "path": "/items",
                "request_fields": [{"name": "name"}, {"name": "qty", "type": "text"}],
            }
        ]
    },
    "design": {
        "themes": [
            {
                "id": "th",
                "name": "Bad",
                "light": {"text": "#777777", "background": "#888888"},
                "typography": {"base_size": 13},
                "layout": {"breakpoints": {"sm": 1000, "md": 900}},
                "motion": {"intensity": "standard", "respect_reduced_motion": False},
            }
        ],
        "pages": [
            {
                "id": "p1",
                "name": "One",
                "route": "/a",
                "roles": ["ghost"],
                "layout": _layout(
                    "root",
                    "stack",
                    children=[
                        _layout("b1", "button"),
                        _layout("t1", "table", endpoint_id="nope"),
                        _layout("s1", "stat", entity_id="nope"),
                        _layout("i1", "input", binding={"entity_id": "item", "entity_field": "x"}),
                        _layout(
                            "l1",
                            "button",
                            interaction={"action": "navigate", "target_page_id": "zz"},
                        ),
                        _layout("b2", "button", interaction={"action": "call_api"}),
                        _layout("g1", "grid"),
                        _layout("f1", "form", children=[_layout("fi1", "input")]),
                        _layout(
                            "f2",
                            "form",
                            endpoint_id="ep1",
                            children=[
                                _layout("fi2", "input", props={"name": "other"}),
                                _layout("fi3", "input", props={"name": "qty", "type": "number"}),
                            ],
                        ),
                    ],
                ),
            },
            {"id": "p2", "name": "Two", "route": "/a", "layout": _layout("root2", "stack")},
        ],
        "journeys": [{"id": "j1", "name": "J", "role_id": "ghost", "steps": [{"page_id": "p1"}]}],
    },
}

_P = {"name": "P", "route": "/p"}
BROKEN = [
    {"nodes": [node("a", "service"), node("a", "service")]},
    {"nodes": [node("a", "service")], "edges": [edge("e", "a", "a"), edge("e", "a", "ghost")]},
    {"nodes": [node("a", "nonsense", group_id="nog")], "groups": [{"id": "a", "label": "G"}]},
    {"groups": [{"id": "g", "label": "G", "node_ids": ["ghost"]}]},
    {"workflows": [{"id": "w", "name": "W", "actor_id": "nobody", "steps": ["ghost"]}]},
    {
        "nodes": [node("svc", "service"), node("db", "database")],
        "actors": [{"id": "admin", "name": "A"}],
        "database": {
            "entities": [
                {
                    "id": "e1",
                    "name": "t1",
                    "node_id": "svc",
                    "fields": [
                        {"id": "a", "name": "a"},
                        {"id": "b", "name": "a"},
                        {
                            "id": "c",
                            "name": "c",
                            "foreign_key": {"entity_id": "nope", "field": "x"},
                        },
                        {"id": "d", "name": "d", "foreign_key": {"entity_id": "e2", "field": "x"}},
                    ],
                    "indexes": [{"fields": ["zz"]}],
                },
                {"id": "e1", "name": "t1", "node_id": "ghost"},
                {"id": "e2", "name": "t2", "node_id": "db"},
            ]
        },
        "api": {
            "endpoints": [
                {"id": "x", "method": "GET", "path": "/x", "service_node_id": "ghost"},
                {"id": "x", "method": "GET", "path": "/x", "service_node_id": "db"},
                {
                    "id": "y",
                    "method": "GET",
                    "path": "/y",
                    "response_entity_id": "nope",
                    "roles": ["nobody"],
                    "request_fields": [
                        {"name": "a", "entity_id": "nope"},
                        {"name": "b", "entity_id": "e2", "entity_field": "zz"},
                    ],
                },
            ]
        },
    },
    {
        "design": {
            "themes": [{"id": "t", "name": "T"}, {"id": "t", "name": "T2"}],
            "active_theme_id": "missing",
            "pages": [
                {"id": "a", **_P, "parent_id": "b", "layout": _layout("x", "stack")},
                {"id": "b", **_P, "parent_id": "a", "layout": _layout("y", "stack")},
                {"id": "c", **_P, "parent_id": "nope", "layout": _layout("x", "stack")},
                {
                    "id": "c",
                    **_P,
                    "layout": _layout("leaf", "text", children=[_layout("k", "text")]),
                },
            ],
            "journeys": [{"id": "j", "name": "J", "steps": [{"page_id": "ghost"}]}],
        }
    },
]


DUPLICATES = {
    "nodes": [node("a", "service", group_id="g"), node("b", "service"), node("c", "service")],
    "groups": [
        {"id": "g", "label": "A", "node_ids": ["a", "b"]},
        {"id": "g", "label": "B", "node_ids": ["b"]},
    ],
    "actors": [{"id": "r", "name": "A"}, {"id": "r", "name": "B"}],
    "workflows": [{"id": "w", "name": "A"}, {"id": "w", "name": "B"}],
    "constraints": [{"id": "k", "text": "a"}, {"id": "k", "text": "b"}],
    "assumptions": [{"id": "s", "text": "a"}, {"id": "s", "text": "b"}],
    "decisions": [{"id": "d", "title": "a"}, {"id": "d", "title": "b"}],
    "requirements": {
        "functional": [{"id": "q", "text": "a"}],
        "nonfunctional": [{"id": "q", "text": "b"}],
        "acceptance_criteria": [{"id": "ac", "text": "a"}, {"id": "ac", "text": "b"}],
    },
    "database": {
        "entities": [
            {
                "id": "p",
                "name": "parent",
                "fields": [
                    {"id": "f", "name": "id", "type": "uuid", "primary_key": True},
                    {"id": "f", "name": "code"},
                ],
            },
            {
                "id": "c",
                "name": "child",
                "fields": [
                    {
                        "id": "1",
                        "name": "p_code",
                        "foreign_key": {"entity_id": "p", "field": "code"},
                    },
                    {
                        "id": "2",
                        "name": "p_id",
                        "type": "integer",
                        "foreign_key": {"entity_id": "p", "field": "id"},
                    },
                ],
            },
        ]
    },
}


def _deep_layout() -> dict[str, Any]:
    tree = _layout("bottom", "text")
    for i in range(14):
        tree = _layout(f"d{i}", "stack", children=[tree])
    return {"design": {"pages": [{"id": "p", **_P, "layout": tree}]}}


CORPUS: list[dict[str, Any]] = [GRAPH, UI, *BROKEN, DUPLICATES, _deep_layout()]


def _all_rule_ids() -> set[str]:
    root = pathlib.Path(__file__).parents[1] / "architectflow" / "validation"
    ids: set[str] = set()
    for f in root.glob("*.py"):
        for n in ast.walk(ast.parse(f.read_text())):
            if (
                isinstance(n, ast.Call)
                and isinstance(n.func, ast.Name)
                and n.func.id in {"make_finding", "err", "report"}
                and n.args
                and isinstance(n.args[0], ast.Constant)
                and isinstance(n.args[0].value, str)
            ):
                ids.add(n.args[0].value)
            if isinstance(n, ast.AnnAssign | ast.Assign) and "_ID_COLLECTIONS" in ast.unparse(n):
                for t in ast.walk(n.value) if n.value else []:
                    if isinstance(t, ast.Tuple) and t.elts and isinstance(t.elts[0], ast.Constant):
                        ids.add(t.elts[0].value)
    return ids


def _findings(raw: dict[str, Any]) -> tuple[dict[str, Any], list[Finding]]:
    doc = ArchitectureDocument.model_validate(raw)
    return doc.model_dump(mode="json"), run_validation(doc)


def test_corpus_triggers_every_rule_id() -> None:
    seen = {f.rule for raw in CORPUS for f in _findings(raw)[1]}
    missing = _all_rule_ids() - seen
    assert not missing, f"no trigger in the corpus for: {sorted(missing)}"


@pytest.mark.parametrize("index", range(len(CORPUS)))
def test_every_finding_carries_an_actionable_location(index: int) -> None:
    dumped, findings = _findings(CORPUS[index])
    node_ids = {n["id"] for n in dumped["nodes"]}
    edge_ids = {e["id"] for e in dumped["edges"]}
    for f in findings:
        assert f.path or f.node_ids or f.edge_ids, f"{f.rule} has no location"
        assert f.evidence and f.remediation and f.explanation, f.rule
        if f.path:
            resolve(dumped, f.path)  # the path points at a real place in the document
        # Ids are only reported when they exist (dangling references go in ``path``).
        if f.rule not in {"broken-edge-reference", "group-missing-member", "workflow-missing-step"}:
            assert set(f.node_ids) <= node_ids, f.rule
        assert set(f.edge_ids) <= edge_ids, f.rule


def test_parse_errors_name_the_field_and_the_rule() -> None:
    errs = errors_of(
        {"nodes": [node("a", "service")], "edges": [edge("e1", "a", "a"), edge("e2", "a", "x")]}
    )
    by_rule = {e["rule"]: e for e in errs}
    assert by_rule["self-loop"]["path"] == "edges.0"
    assert by_rule["broken-edge-reference"]["path"] == "edges.1.target"
    assert (
        "'x'" in by_rule["broken-edge-reference"]["message"]
        or "x" in (by_rule["broken-edge-reference"]["message"])
    )
    errs = errors_of({"nodes": [node("a", "service"), node("b", "service"), node("a", "worker")]})
    assert [e["path"] for e in errs if e["rule"] == "duplicate-node-id"] == ["nodes.2.id"]


@pytest.mark.parametrize(
    ("raw", "rule", "path"),
    [
        (
            {"groups": [{"id": "g", "label": "A"}, {"id": "g", "label": "B"}]},
            "duplicate-group-id",
            "groups.1.id",
        ),
        (
            {"actors": [{"id": "r", "name": "A"}, {"id": "r", "name": "B"}]},
            "duplicate-actor-id",
            "actors.1.id",
        ),
        (
            {
                "requirements": {
                    "functional": [{"id": "r", "text": "a"}],
                    "nonfunctional": [{"id": "r", "text": "b"}],
                }
            },
            "duplicate-requirement-id",
            "requirements.nonfunctional.0.id",
        ),
        (
            {"workflows": [{"id": "w", "name": "A"}, {"id": "w", "name": "B"}]},
            "duplicate-workflow-id",
            "workflows.1.id",
        ),
        (
            {
                "nodes": [node("a", "service"), node("b", "service")],
                "groups": [
                    {"id": "g1", "label": "A", "node_ids": ["a"]},
                    {"id": "g2", "label": "B", "node_ids": ["a", "b"]},
                ],
            },
            "node-in-several-groups",
            "groups.1.node_ids.0",
        ),
        (
            {
                "nodes": [node("a", "service", group_id="g2"), node("b", "service")],
                "groups": [
                    {"id": "g1", "label": "A", "node_ids": ["a"]},
                    {"id": "g2", "label": "B", "node_ids": ["b"]},
                ],
            },
            "group-membership-mismatch",
            "nodes.0.group_id",
        ),
        (
            {
                "api": {
                    "endpoints": [
                        {"id": "a", "method": "GET", "path": "/items/{id}"},
                        {"id": "b", "method": "GET", "path": "/items/{item_id}"},
                    ]
                }
            },
            "duplicate-endpoint",
            "api.endpoints.1.path",
        ),
    ],
)
def test_duplicate_and_contradictory_references_are_rejected(
    raw: dict[str, Any], rule: str, path: str
) -> None:
    errs = [e for e in errors_of(raw) if e["rule"] == rule]
    assert errs, errors_of(raw)
    assert errs[0]["path"] == path


def test_consistent_group_membership_is_accepted() -> None:
    parse_document(
        {
            "nodes": [node("a", "service", group_id="g1"), node("b", "service")],
            "groups": [{"id": "g1", "label": "A", "node_ids": ["a"]}, {"id": "g2", "label": "B"}],
        }
    )


# --------------------------------------------------------------------------- cycles


def _sync_cycles(nodes: list[str], pairs: list[tuple[str, str]], **kw: Any) -> list[Finding]:
    d = ArchitectureDocument.model_validate(
        {
            "nodes": [node(n, "service", description="d") for n in nodes],
            "edges": [edge(f"{a}-{b}", a, b, **kw) for a, b in pairs],
        }
    )
    return [f for f in run_validation(d) if f.rule == "sync-cycle"]


def test_every_service_on_a_sync_cycle_is_reported() -> None:
    # a<->b is found first by a DFS; c sits on a second cycle a->c->b->a through the same nodes.
    found = _sync_cycles(["a", "b", "c"], [("a", "b"), ("b", "a"), ("a", "c"), ("c", "b")])
    assert len(found) == 1
    assert found[0].node_ids == ["a", "b", "c"]
    assert set(found[0].edge_ids) == {"a-b", "b-a", "a-c", "c-b"}
    assert "→" in found[0].evidence  # a concrete cycle is quoted


def test_independent_cycles_get_separate_findings_and_dags_none() -> None:
    found = _sync_cycles(["a", "b", "c", "d"], [("a", "b"), ("b", "a"), ("c", "d"), ("d", "c")])
    assert sorted(tuple(f.node_ids) for f in found) == [("a", "b"), ("c", "d")]
    assert _sync_cycles(["a", "b", "c"], [("a", "b"), ("b", "c"), ("a", "c")]) == []


def test_long_cycle_is_detected_without_recursion() -> None:
    names = [f"s{i:03d}" for i in range(500)]
    pairs = list(zip(names, names[1:] + names[:1], strict=True))
    found = _sync_cycles(names, pairs)
    assert len(found) == 1 and len(found[0].node_ids) == 500


def test_cycle_policy_is_explicit() -> None:
    # Asynchronous cycles are allowed (event loops are normal); synchronous ones warn.
    assert _sync_cycles(["a", "b"], [("a", "b"), ("b", "a")], synchronous=False) == []
    # Self-loops and page-hierarchy cycles are definite defects and block saving.
    assert any(
        e["rule"] == "self-loop"
        for e in errors_of({"nodes": [node("a", "service")], "edges": [edge("e", "a", "a")]})
    )
    # Foreign-key cycles between entities are allowed (DDL adds FKs after all tables).
    parse_document(
        {
            "database": {
                "entities": [
                    {
                        "id": "a",
                        "name": "a",
                        "fields": [
                            {"id": "1", "name": "id", "type": "uuid", "primary_key": True},
                            {
                                "id": "2",
                                "name": "b_id",
                                "type": "uuid",
                                "foreign_key": {"entity_id": "b", "field": "id"},
                            },
                        ],
                    },
                    {
                        "id": "b",
                        "name": "b",
                        "fields": [
                            {"id": "1", "name": "id", "type": "uuid", "primary_key": True},
                            {
                                "id": "2",
                                "name": "a_id",
                                "type": "uuid",
                                "foreign_key": {"entity_id": "a", "field": "id"},
                            },
                        ],
                    },
                ]
            }
        }
    )


# --------------------------------------------------------------------------- relational


def _fk_doc(target_field: dict[str, Any], fk_type: str) -> ArchitectureDocument:
    return ArchitectureDocument.model_validate(
        {
            "database": {
                "entities": [
                    {"id": "p", "name": "parent", "fields": [{"id": "1", **target_field}]},
                    {
                        "id": "c",
                        "name": "child",
                        "fields": [
                            {
                                "id": "1",
                                "name": "parent_ref",
                                "type": fk_type,
                                "foreign_key": {"entity_id": "p", "field": target_field["name"]},
                            },
                        ],
                    },
                ]
            }
        }
    )


def test_foreign_keys_that_postgres_would_reject_are_reported() -> None:
    not_unique = run_validation(_fk_doc({"name": "code", "type": "text"}, "text"))
    hit = [f for f in not_unique if f.rule == "fk-target-not-unique"]
    assert hit and hit[0].path == "database.entities.1.fields.0.foreign_key.field"
    mismatch = run_validation(
        _fk_doc({"name": "id", "type": "uuid", "primary_key": True}, "integer")
    )
    hit = [f for f in mismatch if f.rule == "fk-type-mismatch"]
    assert hit and hit[0].path == "database.entities.1.fields.0.type"
    ok = run_validation(_fk_doc({"name": "id", "type": "uuid", "primary_key": True}, "uuid"))
    assert not {"fk-target-not-unique", "fk-type-mismatch"} & {f.rule for f in ok}

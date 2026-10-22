"""Unit tests for the deterministic validation engine (no database)."""

from __future__ import annotations

from typing import Any

import pytest

from architectflow.schema import ArchitectureDocument
from architectflow.validation import DocumentInvalid, parse_document, run_validation


def doc(
    nodes: list[dict[str, Any]], edges: list[dict[str, Any]] | None = None, **extra: Any
) -> ArchitectureDocument:
    return ArchitectureDocument.model_validate({"nodes": nodes, "edges": edges or [], **extra})


def rules(d: ArchitectureDocument) -> set[str]:
    return {f.rule for f in run_validation(d)}


N = {"id": "x", "type": "service", "label": "X"}


def node(i: str, t: str, **kw: Any) -> dict[str, Any]:
    return {"id": i, "type": t, "label": i.upper(), **kw}


def edge(i: str, s: str, t: str, **kw: Any) -> dict[str, Any]:
    return {"id": i, "source": s, "target": t, **kw}


def test_empty_document_has_no_findings() -> None:
    assert run_validation(ArchitectureDocument()) == []


@pytest.mark.parametrize(
    "raw,needle",
    [
        ({"nodes": [N, N]}, "duplicate-node-id"),
        ({"nodes": [N], "edges": [edge("e", "x", "nope")]}, "broken-edge-reference"),
        ({"nodes": [N], "edges": [edge("e", "x", "x")]}, "self-loop"),
        ({"nodes": [node("a", "quantum_thing")]}, "unknown-node-type"),
        ({"nodes": [node("a", "service", group_id="g")]}, "unknown-group"),
        (
            {"nodes": [N], "groups": [{"id": "g", "label": "G", "node_ids": ["zz"]}]},
            "group-missing-member",
        ),
        (
            {"database": {"entities": [{"id": "e", "name": "t", "node_id": "missing"}]}},
            "entity-missing-node",
        ),
        (
            {
                "database": {
                    "entities": [
                        {
                            "id": "e",
                            "name": "t",
                            "fields": [
                                {
                                    "id": "f",
                                    "name": "x",
                                    "foreign_key": {"entity_id": "nope", "field": "id"},
                                }
                            ],
                        }
                    ]
                }
            },
            "fk-missing-entity",
        ),
        (
            {
                "api": {
                    "endpoints": [
                        {"id": "a", "method": "GET", "path": "/x", "service_node_id": "ghost"}
                    ]
                }
            },
            "endpoint-missing-service",
        ),
        (
            {
                "api": {
                    "endpoints": [
                        {
                            "id": "a",
                            "method": "GET",
                            "path": "/x",
                            "auth": "roles",
                            "roles": ["nobody"],
                        }
                    ]
                }
            },
            "endpoint-missing-role",
        ),
        (
            {
                "api": {
                    "endpoints": [
                        {"id": "a", "method": "GET", "path": "/x"},
                        {"id": "b", "method": "GET", "path": "/x"},
                    ]
                }
            },
            "duplicate-endpoint",
        ),
    ],
)
def test_integrity_errors_block_parse(raw: dict[str, Any], needle: str) -> None:
    with pytest.raises(DocumentInvalid) as exc:
        parse_document(raw)
    assert any(needle in e["path"] for e in exc.value.errors), exc.value.errors


def test_unknown_fields_and_bad_ids_rejected() -> None:
    with pytest.raises(DocumentInvalid) as exc:
        parse_document({"nodes": [{"id": "a b", "type": "service", "label": "A"}]})
    assert exc.value.errors[0]["path"] == "nodes.0.id"
    with pytest.raises(DocumentInvalid):
        parse_document({"nodes": [{**N, "evil": "<script>"}]})
    with pytest.raises(DocumentInvalid):
        parse_document([1, 2, 3])


def test_client_to_database_and_public_db() -> None:
    d = doc([node("w", "web_client"), node("db", "database", public=True)], [edge("e", "w", "db")])
    r = rules(d)
    assert {"client-to-datastore", "public-internal-component"} <= r
    f = next(f for f in run_validation(d) if f.rule == "client-to-datastore")
    assert f.kind == "recommendation" and f.edge_ids == ["e"] and f.remediation


def test_passive_source_flagged() -> None:
    d = doc([node("db", "database"), node("s", "service")], [edge("e", "db", "s")])
    assert "passive-source" in rules(d)


def test_missing_auth_only_when_clients_reach_services() -> None:
    base = [node("w", "web_client"), node("s", "service")]
    assert "missing-auth" in rules(doc(base, [edge("e", "w", "s")]))
    with_auth = doc([*base, node("a", "auth_service")], [edge("e", "w", "s")])
    assert "missing-auth" not in rules(with_auth)
    assert "missing-auth" not in rules(doc([node("s", "service")]))


def test_encryption_rules() -> None:
    d = doc(
        [node("w", "web_client"), node("g", "api_gateway")], [edge("e", "w", "g", encrypted=False)]
    )
    assert "unencrypted-boundary" in rules(d)
    d = doc(
        [node("w", "web_client"), node("g", "api_gateway")], [edge("e", "w", "g", protocol="HTTP")]
    )
    assert "plaintext-protocol" in rules(d)
    d = doc(
        [node("w", "web_client"), node("g", "api_gateway")],
        [edge("e", "w", "g", protocol="HTTPS", encrypted=True)],
    )
    assert not {"plaintext-protocol", "unencrypted-boundary"} & rules(d)
    d = doc([node("db", "database")])
    assert {"encryption-at-rest-unstated", "missing-secrets-management"} <= rules(d)
    d = doc(
        [
            node("db", "database", properties={"encryption_at_rest": True}),
            node("k", "secrets_manager"),
        ]
    )
    assert not {"encryption-at-rest-unstated", "missing-secrets-management"} & rules(d)


def test_sync_cycle_detected_but_async_cycle_ignored() -> None:
    nodes = [node("a", "service"), node("b", "service"), node("c", "service")]
    cyc = doc(nodes, [edge("1", "a", "b"), edge("2", "b", "c"), edge("3", "c", "a")])
    found = [f for f in run_validation(cyc) if f.rule == "sync-cycle"]
    assert len(found) == 1 and sorted(found[0].edge_ids) == ["1", "2", "3"]
    acyc = doc(
        nodes, [edge("1", "a", "b"), edge("2", "b", "c"), edge("3", "c", "a", synchronous=False)]
    )
    assert "sync-cycle" not in rules(acyc)


def test_shared_database_needs_owner() -> None:
    nodes = [
        node("a", "service", description="x"),
        node("b", "service", description="y"),
        node("db", "database"),
    ]
    d = doc(nodes, [edge("1", "a", "db"), edge("2", "b", "db")])
    assert "shared-database" in rules(d)
    nodes[2]["owner"] = "orders team"
    assert "shared-database" not in rules(doc(nodes, [edge("1", "a", "db"), edge("2", "b", "db")]))


def test_spof_only_with_availability_requirement() -> None:
    nodes = [node("s", "service", description="d"), node("db", "database")]
    edges = [edge("1", "s", "db")]
    assert "single-point-of-failure" not in rules(doc(nodes, edges))
    d = doc(nodes, edges, vision="Must be highly available with 99.9% uptime")
    f = [x for x in run_validation(d) if x.rule == "single-point-of-failure"]
    assert {x.node_ids[0] for x in f} == {"s", "db"}
    assert "availability" in f[0].explanation or "uptime" in f[0].explanation


def test_unbounded_queue_and_retries() -> None:
    d = doc(
        [node("q", "message_broker"), node("s", "service")],
        [edge("1", "s", "q", properties={"retries": "unbounded"})],
    )
    assert {"unbounded-queue", "unbounded-retries"} <= rules(d)
    d = doc([node("q", "message_broker", properties={"max_length": 1000})])
    assert "unbounded-queue" not in rules(d)


def test_monitoring_backup_and_migration_rules() -> None:
    d = doc([node("a", "service"), node("b", "worker")])
    assert "missing-observability" in rules(d)
    d = doc([node("db", "database")], vision="We need disaster recovery and backups")
    assert "missing-backup-plan" in rules(d)
    d = doc([node("db", "database")], vision="Zero downtime schema migration is required")
    assert "missing-migration-plan" in rules(d)


def test_constraints() -> None:
    d = doc(
        [node("s", "service", technology="MongoDB Atlas")],
        constraints=[
            {"id": "c1", "text": "No MongoDB", "kind": "forbids_technology", "value": "mongodb"},
            {"id": "c2", "text": "Must have a WAF", "kind": "requires_component", "value": "waf"},
        ],
    )
    r = rules(d)
    assert {"constraint-contradiction", "missing-required-component"} <= r


def test_findings_are_deterministic_and_sorted() -> None:
    d = doc(
        [node("w", "web_client"), node("db", "database", public=True), node("s", "service")],
        [edge("e", "w", "db")],
    )
    a, b = run_validation(d), run_validation(d)
    assert [f.id for f in a] == [f.id for f in b]
    sev = [f.severity for f in a]
    order = {"error": 0, "warning": 1, "info": 2}
    assert sev == sorted(sev, key=order.__getitem__)

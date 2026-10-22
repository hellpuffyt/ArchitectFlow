"""Change sets, the example provider, and HTTP providers over a MOCKED transport.

The HTTP provider tests do not contact any real AI service: they use
httpx.MockTransport, so they prove request/response handling, not model quality.
"""

from __future__ import annotations

import asyncio
import json

import httpx
import pytest

from architectflow.ai import (
    AnthropicProvider,
    ChangeSetInvalid,
    ExampleProvider,
    OpenAICompatibleProvider,
    ProviderError,
    apply_operations,
    parse_operations,
    summarize,
)
from architectflow.schema import ArchitectureDocument

from .fixtures import JEWELLERY_VISION


def run(coro):  # type: ignore[no-untyped-def]
    return asyncio.run(coro)


def jewellery() -> ArchitectureDocument:
    r = run(ExampleProvider().propose_architecture(JEWELLERY_VISION, ArchitectureDocument()))
    return apply_operations(ArchitectureDocument(), parse_operations(r.operations))


def test_example_provider_is_deterministic_and_labeled() -> None:
    p = ExampleProvider()
    a = run(p.propose_architecture(JEWELLERY_VISION, ArchitectureDocument()))
    b = run(p.propose_architecture(JEWELLERY_VISION, ArchitectureDocument()))
    assert a.operations == b.operations
    assert a.explanation.startswith("Example mode — no AI provider configured")


def test_jewellery_design_contents() -> None:
    d = jewellery()
    assert [r.text for r in d.requirements.functional] == [
        "Inventory",
        "Billing",
        "Branch management",
        "Offline synchronization",
        "Role-based access",
        "Administrative dashboard",
    ]
    assert d.technology_preferences == ["PostgreSQL"]
    assert all(r.status == "assumption" for r in d.requirements.nonfunctional)
    ents = {e.name: e for e in d.database.entities}
    assert set(ents) == {"tenant", "item", "invoice", "branch"}
    item_fk = next(f for f in ents["item"].fields if f.name == "tenant_id").foreign_key
    assert item_fk is not None and item_fk.entity_id == "ent-tenant"
    paths = {(e.method, e.path) for e in d.api.endpoints}
    assert ("GET", "/api/items") in paths and ("POST", "/api/sync") in paths
    assert any(n.id == "sync-api" for n in d.nodes)
    assert any("conflicting offline" in q for q in d.open_questions)


@pytest.mark.parametrize(
    "request_,check",
    [
        ("add a redis cache for Core API", lambda d: any(n.type == "cache" for n in d.nodes)),
        ("remove Sync service", lambda d: not any(n.id == "sync-api" for n in d.nodes)),
        ("rename Core API to Ledger", lambda d: any(n.label == "Ledger" for n in d.nodes)),
        (
            "connect Sync service to Observability via OTLP",
            lambda d: any(e.source == "sync-api" and e.target == "observability" for e in d.edges),
        ),
        (
            "use Go for Core API",
            lambda d: next(n for n in d.nodes if n.id == "core-api").technology == "Go",
        ),
        (
            "make Primary database highly available",
            lambda d: next(n for n in d.nodes if n.id == "db").replicas == 3,
        ),
    ],
)
def test_example_edits(request_: str, check) -> None:  # type: ignore[no-untyped-def]
    base = jewellery()
    r = run(ExampleProvider().propose_edit(request_, base))
    assert r.operations, r.explanation
    assert check(apply_operations(base, parse_operations(r.operations)))


def test_remove_node_cascades_edges_and_detaches_design() -> None:
    base = jewellery()
    ops = parse_operations([{"op": "remove_node", "id": "db"}])
    new = apply_operations(base, ops)
    assert all("db" not in (e.source, e.target) for e in new.edges)
    # Entities survive, explicitly detached and reported.
    assert len(new.database.entities) == len(base.database.entities)
    assert all(e.node_id is None for e in new.database.entities)
    lines = summarize(base, ops).lines
    assert any("entity invoice kept" in line for line in lines)
    from architectflow.validation import run_validation

    assert "entity-unassigned" in {f.rule for f in run_validation(new)}


def test_invalid_operations_rejected() -> None:
    base = jewellery()
    with pytest.raises(ChangeSetInvalid):
        parse_operations([{"op": "drop_database"}])
    with pytest.raises(ChangeSetInvalid):
        parse_operations({"op": "add_node"})
    with pytest.raises(ChangeSetInvalid) as exc:
        apply_operations(
            base, parse_operations([{"op": "update_node", "id": "nope", "changes": {"label": "x"}}])
        )
    assert "unknown node" in str(exc.value)
    with pytest.raises(ChangeSetInvalid) as exc:  # dangling edge caught by integrity gate
        apply_operations(
            base,
            parse_operations(
                [{"op": "add_edge", "edge": {"id": "zz", "source": "db", "target": "ghost"}}]
            ),
        )
    assert "ghost" in str(exc.value)
    with pytest.raises(ChangeSetInvalid):
        apply_operations(
            base,
            parse_operations(
                [{"op": "add_node", "node": {"id": "db", "type": "database", "label": "dup"}}]
            ),
        )


def test_large_change_flag() -> None:
    base = jewellery()
    ops = parse_operations([{"op": "remove_node", "id": n.id} for n in base.nodes[:6]])
    assert summarize(base, ops).large is True
    one = parse_operations([{"op": "remove_node", "id": base.nodes[0].id}])
    assert summarize(base, one).large is False


def _openai_transport(content: str, status: int = 200) -> httpx.MockTransport:
    def handler(req: httpx.Request) -> httpx.Response:
        assert req.headers["authorization"] == "Bearer test-key"
        body = json.loads(req.content)
        assert body["messages"][0]["role"] == "system"
        return httpx.Response(status, json={"choices": [{"message": {"content": content}}]})

    return httpx.MockTransport(handler)


def _provider(transport: httpx.AsyncBaseTransport) -> OpenAICompatibleProvider:
    return OpenAICompatibleProvider(
        api_key="test-key", model="m", base_url="http://llm.test/v1", timeout=5, transport=transport
    )


def test_openai_provider_parses_operations() -> None:
    payload = json.dumps(
        {
            "explanation": "added cache",
            "questions": ["TTL?"],
            "operations": [
                {"op": "add_node", "node": {"id": "c", "type": "cache", "label": "Cache"}}
            ],
        }
    )
    r = run(_provider(_openai_transport(payload)).propose_edit("add cache", ArchitectureDocument()))
    assert r.questions == ["TTL?"]
    assert parse_operations(r.operations)[0].op == "add_node"


def test_openai_provider_malicious_output_is_rejected_by_validation() -> None:
    payload = json.dumps(
        {
            "explanation": "x",
            "operations": [
                {"op": "add_node", "node": {"id": "../../etc", "type": "service", "label": "x"}}
            ],
        }
    )
    r = run(_provider(_openai_transport(payload)).propose_edit("x", ArchitectureDocument()))
    with pytest.raises(ChangeSetInvalid):
        parse_operations(r.operations)


@pytest.mark.parametrize(
    "transport,needle",
    [
        (_openai_transport("not json at all"), "no JSON"),
        (_openai_transport("{bad json}"), "invalid JSON"),
        (_openai_transport("{}", status=500), "HTTP 500"),
    ],
)
def test_openai_provider_errors(transport, needle) -> None:  # type: ignore[no-untyped-def]
    with pytest.raises(ProviderError) as exc:
        run(_provider(transport).propose_edit("x", ArchitectureDocument()))
    assert needle in str(exc.value)


def test_unreachable_provider_raises_provider_error() -> None:
    def refuse(req: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=req)

    with pytest.raises(ProviderError) as exc:
        run(_provider(httpx.MockTransport(refuse)).propose_edit("x", ArchitectureDocument()))
    assert "ConnectError" in str(exc.value)


def test_anthropic_provider_request_shape() -> None:
    def handler(req: httpx.Request) -> httpx.Response:
        assert req.url.path == "/v1/messages"
        assert req.headers["x-api-key"] == "k" and "anthropic-version" in req.headers
        return httpx.Response(
            200,
            json={
                "content": [
                    {"type": "text", "text": json.dumps({"explanation": "ok", "operations": []})}
                ]
            },
        )

    p = AnthropicProvider(
        api_key="k",
        model="m",
        base_url="http://anthropic.test",
        timeout=5,
        transport=httpx.MockTransport(handler),
    )
    assert run(p.propose_architecture("vision text", ArchitectureDocument())).explanation == "ok"

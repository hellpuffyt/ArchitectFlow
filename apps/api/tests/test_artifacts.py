"""Generated artifacts: determinism and correspondence to the saved model.

Determinism definition used here: for one saved revision and one set of prompt settings,
every export format and every prompt is byte-identical across repeated calls, across
processes with different hash seeds, and across the API (stored JSONB round trip).
Inputs that are not part of the revision (wall clock, randomness, dict/set iteration order)
must not influence the output.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import subprocess
import sys
import typing
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url

from architectflow.exports import FORMATS, render
from architectflow.prompts import generate_prompt
from architectflow.schema import ArchitectureDocument, PromptSettings
from architectflow.validation import parse_document, run_validation

from .conftest import ADMIN_URL, Api
from .test_api_projects import new_project
from .test_design import jewellery_with_pages

MODES = typing.get_args(PromptSettings.model_fields["mode"].annotation)
PRESETS = typing.get_args(PromptSettings.model_fields["preset"].annotation)


def rich_doc() -> ArchitectureDocument:
    """The jewellery example plus groups, workflows and multi-key properties."""
    raw = jewellery_with_pages().model_dump(mode="json")
    ids = [n["id"] for n in raw["nodes"]]
    raw["groups"] = [{"id": "grp-core", "label": "Core", "node_ids": ids[1:3]}]
    for n in raw["nodes"]:
        if n["id"] in ids[1:3]:
            n["group_id"] = "grp-core"
    raw["nodes"][0]["properties"] = {"zeta": 1, "alpha": "two", "mid": True, "b": 2.5}
    raw["actors"] = [*raw["actors"], {"id": "auditor", "name": "Auditor"}]
    raw["workflows"] = [{"id": "wf", "name": "Checkout", "steps": ids[:4]}]
    return parse_document(raw)


def artifacts(doc: ArchitectureDocument) -> dict[str, str]:
    out = {f"export:{k}": render(k, doc, "Gems", 7) for k in FORMATS}
    for mode in MODES:
        for preset in PRESETS:
            settings = PromptSettings(mode=mode, preset=preset)
            out[f"prompt:{mode}:{preset}"] = generate_prompt(doc, 7, "Gems", settings)
    out["findings"] = json.dumps([f.model_dump() for f in run_validation(doc)])
    return out


def digests(doc: ArchitectureDocument) -> dict[str, str]:
    return {k: hashlib.sha256(v.encode()).hexdigest() for k, v in artifacts(doc).items()}


# ------------------------------------------------------------------------- determinism


def test_every_artifact_is_identical_when_generated_twice() -> None:
    first, second = artifacts(rich_doc()), artifacts(rich_doc())
    assert (
        first.keys() == second.keys() and len(first) == len(FORMATS) + len(MODES) * len(PRESETS) + 1
    )
    for key in first:
        assert first[key] == second[key], key


_CHILD = """
import json, sys
from tests.test_artifacts import digests, rich_doc
json.dump(digests(rich_doc()), sys.stdout)
"""


def test_artifacts_do_not_depend_on_the_process_hash_seed() -> None:
    """Set/dict iteration order varies with PYTHONHASHSEED; outputs must not."""
    root = Path(__file__).parents[1]
    runs = []
    for seed in ("0", "1", "4242"):
        env = {**os.environ, "PYTHONHASHSEED": seed}
        proc = subprocess.run(  # noqa: S603 - fixed argv: this interpreter + a constant
            [sys.executable, "-c", _CHILD], cwd=root, env=env, capture_output=True, check=True
        )
        runs.append(json.loads(proc.stdout))
    assert runs[0] == runs[1] == runs[2]
    assert runs[0] == digests(rich_doc())


def test_api_exports_and_prompts_are_byte_identical_for_one_revision(api: Api, email: str) -> None:
    api.signup(email)
    pid = new_project(api)["id"]
    doc = rich_doc().model_dump(mode="json")
    r = api.put(f"/api/projects/{pid}/document", json={"base_revision": 1, "document": doc})
    assert r.status_code == 200, r.text
    rev = r.json()["head_revision"]
    first = {k: api.get(f"/api/projects/{pid}/exports/{k}").content for k in FORMATS}
    settings = {"mode": "complete_app", "preset": "claude_code"}
    preview = api.post(f"/api/projects/{pid}/prompts/preview", json=settings).json()["content"]
    saved = api.post(f"/api/projects/{pid}/prompts", json=settings).json()
    assert saved["source_revision"] == rev and saved["content"] == preview
    # A later revision must not change what the pinned revision exports.
    later = {**doc, "vision": "changed later"}
    assert (
        api.put(
            f"/api/projects/{pid}/document", json={"base_revision": rev, "document": later}
        ).status_code
        == 200
    )
    for k in FORMATS:
        again = api.get(f"/api/projects/{pid}/exports/{k}?revision={rev}")
        assert again.headers["x-architectflow-revision"] == str(rev)
        assert again.content == first[k], k
    # The stored revision (JSONB) renders exactly like the in-memory model.
    stored = api.get(f"/api/projects/{pid}/revisions/{rev}").json()["document"]
    model = ArchitectureDocument.model_validate(stored)
    for k in FORMATS:
        if k not in {"json", "bundle"}:  # JSONB normalises user dict key order
            assert render(k, model, "Jewellery SaaS", rev).encode() == first[k], k


# ---------------------------------------------------------------------- correspondence


def _mermaid_node_ids(out: str) -> list[str]:
    return re.findall(r"^\s+(n\d+)[\[\(\{/]", out, flags=re.M)


def test_flowchart_and_plantuml_have_one_element_per_node_and_edge() -> None:
    d = rich_doc()
    mm = render("mermaid", d, "t", 1)
    assert sorted(_mermaid_node_ids(mm)) == sorted(f"n{i}" for i in range(len(d.nodes)))
    assert len(re.findall(r"^\s+n\d+ (-->|-\.->|<-->)", mm, flags=re.M)) == len(d.edges)
    subgraphs = re.findall(r"subgraph (\w+)", mm)
    assert len(subgraphs) == len(set(subgraphs)) == len(d.groups)
    puml = render("plantuml", d, "t", 1)
    assert len(re.findall(r" as n\d+$", puml, flags=re.M)) == len(d.nodes)
    assert len(re.findall(r"^n\d+ (-->|\.\.>|<-->) n\d+", puml, flags=re.M)) == len(d.edges)
    dep = render("deployment", d, "t", 1)
    assert len(re.findall(r"^\s+n\d+\[", dep, flags=re.M)) == len(d.nodes)


def test_mermaid_subgraph_ids_are_unique_per_group() -> None:
    d = parse_document(
        {
            "nodes": [
                {"id": "a", "type": "service", "label": "A", "group_id": "g1"},
                {"id": "a2", "type": "service", "label": "A2", "group_id": "g1"},
                {"id": "b", "type": "service", "label": "B", "group_id": "g2"},
                {"id": "b2", "type": "service", "label": "B2", "group_id": "g2"},
                {"id": "c", "type": "service", "label": "C", "group_id": "g3"},
            ],
            "groups": [
                {"id": "g1", "label": "One", "node_ids": ["a", "a2"]},
                {"id": "g2", "label": "Two", "node_ids": ["b", "b2"]},
                {"id": "g3", "label": "Three", "node_ids": ["c"]},
            ],
        }
    )
    ids = re.findall(r"subgraph (\w+)", render("mermaid", d, "t", 1))
    assert ids == ["g0", "g1", "g2"]


def test_mermaid_labels_are_truncated_before_escaping() -> None:
    d = parse_document(
        {"nodes": [{"id": "a", "type": "service", "label": "a" + "&" * 199, "technology": "x"}]}
    )
    line = next(x for x in render("mermaid", d, "t", 1).splitlines() if "n0" in x)
    label = line.split('"')[1]
    # every escape sequence is complete; nothing is cut in the middle of "#amp;"
    assert re.fullmatch(r"a(#amp;)+", label), label


def test_erd_and_openapi_match_the_data_and_api_model() -> None:
    d = rich_doc()
    erd = render("erd", d, "t", 1)
    for e in d.database.entities:
        assert f"  {e.name} {{" in erd
    fks = [f for e in d.database.entities for f in e.fields if f.foreign_key]
    assert len(re.findall(r"\|\|--o\{", erd)) == len(fks)
    spec = json.loads(render("openapi", d, "Gems", 1))
    ops = {(p, m.upper()) for p, item in spec["paths"].items() for m in item}
    assert ops == {(e.path, e.method) for e in d.api.endpoints}
    assert set(spec["components"]["schemas"]) == {e.name for e in d.database.entities}


def test_openapi_operation_ids_are_unique() -> None:
    d = parse_document(
        {
            "api": {
                "endpoints": [
                    {"id": "list-items", "method": "GET", "path": "/a"},
                    {"id": "list.items", "method": "GET", "path": "/b"},
                    {"id": "list_items", "method": "GET", "path": "/c"},
                ]
            }
        }
    )
    spec = json.loads(render("openapi", d, "t", 1))
    op_ids = [op["operationId"] for item in spec["paths"].values() for op in item.values()]
    assert len(op_ids) == len(set(op_ids)) == 3


def _execute_ddl(ddl: str) -> dict[str, typing.Any]:
    name = f"af_ddl_{secrets.token_hex(4)}"
    admin = create_engine(ADMIN_URL, isolation_level="AUTOCOMMIT")
    with admin.connect() as c:
        c.execute(text(f'CREATE DATABASE "{name}"'))
    try:
        eng = create_engine(make_url(ADMIN_URL).set(database=name))
        with eng.begin() as c:
            c.exec_driver_sql(ddl)
        insp = inspect(eng)
        out = {
            t: {
                "columns": {c["name"]: c["nullable"] for c in insp.get_columns(t)},
                "pk": insp.get_pk_constraint(t)["constrained_columns"],
                "fks": insp.get_foreign_keys(t),
                "indexes": insp.get_indexes(t),
            }
            for t in insp.get_table_names()
        }
        eng.dispose()
        return out
    finally:
        with admin.connect() as c:
            c.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
        admin.dispose()


def test_sql_ddl_on_postgres_matches_every_entity_field_fk_and_index() -> None:
    d = rich_doc()
    schema = _execute_ddl(render("sql", d, "t", 1))
    assert set(schema) == {e.name for e in d.database.entities}
    for e in d.database.entities:
        table = schema[e.name]
        assert list(table["columns"]) == [f.name for f in e.fields]
        for f in e.fields:
            assert table["columns"][f.name] == (f.nullable and not f.primary_key), (e.name, f.name)
        assert table["pk"] == [f.name for f in e.fields if f.primary_key]
        assert len(table["fks"]) == sum(1 for f in e.fields if f.foreign_key)
        named = [ix for ix in table["indexes"] if ix["name"].startswith("ix_")]
        assert len(named) == len(e.indexes)


def _entity(eid: str, name: str, fields: list[dict], indexes: list[list[str]]) -> dict:
    return {
        "id": eid,
        "name": name,
        "fields": [{"id": f"{eid}{i}", **f} for i, f in enumerate(fields)],
        "indexes": [{"fields": ix} for ix in indexes],
    }


def test_sql_ddl_generated_names_never_collide() -> None:
    long = "t" * 60
    d = parse_document(
        {
            "database": {
                "entities": [
                    _entity("e1", "a_b", [{"name": "c"}], [["c"]]),
                    _entity("e2", "a", [{"name": "b_c"}], [["b_c"]]),
                    _entity(
                        "e3",
                        long,
                        [
                            {"name": "id", "type": "uuid", "primary_key": True},
                            {
                                "name": "ref_aaaaaaaaaaaa1",
                                "type": "uuid",
                                "foreign_key": {"entity_id": "e3", "field": "id"},
                            },
                            {
                                "name": "ref_aaaaaaaaaaaa2",
                                "type": "uuid",
                                "foreign_key": {"entity_id": "e3", "field": "id"},
                            },
                        ],
                        [["ref_aaaaaaaaaaaa1"], ["ref_aaaaaaaaaaaa2"]],
                    ),
                ]
            }
        }
    )
    schema = _execute_ddl(render("sql", d, "t", 1))
    assert len(schema[long]["fks"]) == 2
    assert (
        len([ix for t in schema.values() for ix in t["indexes"] if ix["name"].startswith("ix_")])
        == 4
    )


def test_sql_ddl_handles_foreign_key_cycles() -> None:
    def ent(eid: str, other: str) -> dict:
        return _entity(
            eid,
            eid,
            [
                {"name": "id", "type": "uuid", "primary_key": True},
                {
                    "name": f"{other}_id",
                    "type": "uuid",
                    "foreign_key": {"entity_id": other, "field": "id"},
                },
            ],
            [],
        )

    d = parse_document({"database": {"entities": [ent("a", "b"), ent("b", "a")]}})
    schema = _execute_ddl(render("sql", d, "t", 1))
    assert schema["a"]["fks"][0]["referred_table"] == "b"
    assert schema["b"]["fks"][0]["referred_table"] == "a"


def test_prompt_component_table_has_one_row_per_node_even_with_markdown_in_text() -> None:
    d = parse_document(
        {
            "nodes": [
                {"id": "a", "type": "service", "label": "A | B", "description": "line1\nline2 | x"},
                {"id": "b", "type": "worker", "label": "B", "technology": "py|thon"},
            ]
        }
    )
    out = generate_prompt(d, 1, "t", PromptSettings())
    section = out.split("## Components")[1].split("\n## ")[0]
    rows = [ln for ln in section.strip().splitlines() if ln.startswith("| `")]
    assert len(rows) == 2
    for row in rows:
        assert len(re.findall(r"(?<!\\)\|", row)) == 7, row


def test_prompt_mentions_every_node_edge_entity_and_endpoint() -> None:
    d = rich_doc()
    out = generate_prompt(d, 1, "Gems", PromptSettings())
    for n in d.nodes:
        assert f"`{n.id}`" in out
    assert out.count("\n- [CONFIRMED] ") >= len(d.edges)
    for e in d.database.entities:
        assert f"### `{e.name}`" in out
    for ep in d.api.endpoints:
        assert f"### `{ep.method} {ep.path}`" in out

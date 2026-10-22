"""Export formats. SQL is executed on REAL PostgreSQL; OpenAPI is validated against 3.1."""

from __future__ import annotations

import json
import secrets

from openapi_spec_validator import validate
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url

from architectflow.exports import FORMATS, render
from architectflow.exports.text import mermaid_label
from architectflow.schema import ArchitectureDocument
from architectflow.validation import parse_document

from .conftest import ADMIN_URL
from .test_design import jewellery_with_pages


def test_every_format_renders_for_a_full_design() -> None:
    d = jewellery_with_pages()
    for key in FORMATS:
        out = render(key, d, "Gems <script>", 4)
        assert out.strip(), key


def test_every_format_renders_for_an_empty_design() -> None:
    for key in FORMATS:
        assert render(key, ArchitectureDocument(), "Empty", 1) is not None


def test_round_trip_formats_reimport_identically() -> None:
    d = jewellery_with_pages()
    assert parse_document(json.loads(render("json", d, "x", 1))) == d
    bundle = json.loads(render("bundle", d, "x", 1))
    assert bundle["format"] == "architectflow-bundle"
    assert parse_document(bundle["document"]) == d


def test_mermaid_escaping_blocks_injection() -> None:
    d = ArchitectureDocument.model_validate(
        {
            "nodes": [
                {"id": "a", "type": "service", "label": 'x"]; click a href "javascript:alert(1)"'}
            ]
        }
    )
    out = render("mermaid", d, "t", 1)
    assert 'javascript:alert(1)"' not in out and "#quot;" in out
    assert mermaid_label("a|b<c>") == "a#124;b#lt;c#gt;"


def test_openapi_is_valid_31() -> None:
    spec = json.loads(render("openapi", jewellery_with_pages(), "Gems", 4))
    validate(spec)
    assert spec["openapi"] == "3.1.0"
    get_items = spec["paths"]["/api/items"]["get"]
    assert get_items["responses"]["200"]["content"]["application/json"]["schema"]["type"] == "array"
    assert {p["name"] for p in get_items["parameters"]} >= {"limit", "cursor", "q"}
    assert "item" in spec["components"]["schemas"]


def test_sql_ddl_executes_on_real_postgres() -> None:
    ddl = render("sql", jewellery_with_pages(), "Gems", 4)
    name = f"af_ddl_{secrets.token_hex(4)}"
    admin = create_engine(ADMIN_URL, isolation_level="AUTOCOMMIT")
    with admin.connect() as c:
        c.execute(text(f'CREATE DATABASE "{name}"'))
    try:
        eng = create_engine(make_url(ADMIN_URL).set(database=name))
        with eng.begin() as c:
            c.exec_driver_sql(ddl)
        insp = inspect(eng)
        assert set(insp.get_table_names()) == {"tenant", "item", "invoice", "branch"}
        fks = insp.get_foreign_keys("item")
        assert fks[0]["referred_table"] == "tenant" and fks[0]["options"]["ondelete"] == "CASCADE"
        assert any(ix["column_names"] == ["tenant_id"] for ix in insp.get_indexes("item"))
        eng.dispose()
    finally:
        with admin.connect() as c:
            c.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
        admin.dispose()


def test_sql_quotes_reserved_words() -> None:
    d = ArchitectureDocument.model_validate(
        {
            "database": {
                "entities": [
                    {
                        "id": "o",
                        "name": "order",
                        "fields": [
                            {"id": "i", "name": "user", "type": "uuid", "primary_key": True}
                        ],
                    }
                ]
            }
        }
    )
    assert 'CREATE TABLE "order"' in render("sql", d, "t", 1)


def test_tokens_css_has_variables_and_reduced_motion() -> None:
    css = render("css", jewellery_with_pages(), "t", 1)
    assert "--color-primary:" in css and "prefers-reduced-motion" in css
    assert '[data-theme="dark"]' in css


def test_page_flow_marks_visual_only_links() -> None:
    d = jewellery_with_pages()
    flow = render("page-flow", d, "t", 1)
    assert "-->" in flow and "==>" in flow

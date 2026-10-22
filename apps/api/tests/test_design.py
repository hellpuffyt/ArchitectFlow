"""UI/UX design model: integrity, WCAG contrast, presets, UI validation rules (unit)."""

from __future__ import annotations

import asyncio
import copy
from typing import Any

import pytest

from architectflow.ai import ExampleProvider, apply_operations, parse_operations, summarize
from architectflow.ai.example_design import design_request, generate_pages, on_color
from architectflow.design import PRESETS, contrast_ratio, preset_theme
from architectflow.schema import ArchitectureDocument, Theme
from architectflow.validation import DocumentInvalid, parse_document, run_validation

from .fixtures import JEWELLERY_VISION


def jewellery_with_pages() -> ArchitectureDocument:
    gen = asyncio.run(
        ExampleProvider().propose_architecture(JEWELLERY_VISION, ArchitectureDocument())
    )
    d = apply_operations(ArchitectureDocument(), parse_operations(gen.operations))
    return apply_operations(d, parse_operations(generate_pages(d).operations))


def rules(d: ArchitectureDocument) -> set[str]:
    return {f.rule for f in run_validation(d)}


def test_contrast_reference_values() -> None:
    assert contrast_ratio("#000000", "#ffffff") == pytest.approx(21.0)
    assert contrast_ratio("#ffffff", "#ffffff") == pytest.approx(1.0)
    assert contrast_ratio("#777777", "#ffffff") == pytest.approx(4.478, abs=0.001)
    assert contrast_ratio("#ffffff", "#777777") == contrast_ratio("#777777", "#ffffff")


@pytest.mark.parametrize("key", PRESETS)
def test_every_preset_meets_wcag_aa(key: str) -> None:
    t = preset_theme(key, "t")
    for p in (
        (t.light, t.dark)
        if t.appearance == "system"
        else ((t.dark,) if t.appearance == "dark" else (t.light,))
    ):
        assert contrast_ratio(p.text, p.background) >= 4.5
        assert contrast_ratio(p.muted_text, p.background) >= 4.5
        assert contrast_ratio(p.on_primary, p.primary) >= 4.5, key


def test_default_theme_meets_aa() -> None:
    t = Theme(id="t", name="t")
    for p in (t.light, t.dark):
        assert contrast_ratio(p.on_primary, p.primary) >= 4.5
        assert contrast_ratio(p.text, p.background) >= 4.5


def test_on_color_picks_readable_text() -> None:
    for hexc in ("#047857", "#34d399", "#fbbf24", "#1d4ed8", "#ffffff", "#000000"):
        assert contrast_ratio(on_color(hexc), hexc) >= 4.5


def test_contrast_rule_reports_measured_ratio() -> None:
    d = ArchitectureDocument.model_validate(
        {
            "design": {
                "themes": [
                    {
                        "id": "t",
                        "name": "Bad",
                        "light": {"text": "#999999", "background": "#ffffff"},
                    }
                ],
                "active_theme_id": "t",
            }
        }
    )
    found = [f for f in run_validation(d) if f.rule == "contrast-too-low"]
    assert any("text #999999 on background #ffffff = 2.85:1" in f.evidence for f in found)
    assert any("on surface #f6f7f9 = 2.66:1" in f.evidence for f in found)


@pytest.mark.parametrize(
    "patch,needle",
    [
        ({"themes": [{"id": "t", "name": "a"}, {"id": "t", "name": "b"}]}, "duplicate-theme-id"),
        ({"active_theme_id": "nope"}, "missing-active-theme"),
        ({"themes": [{"id": "t", "name": "x", "light": {"primary": "red"}}]}, "light.primary"),
        (
            {
                "pages": [
                    {
                        "id": "p",
                        "name": "P",
                        "route": "no-slash",
                        "layout": {"id": "r", "kind": "container"},
                    }
                ]
            },
            "route",
        ),
        (
            {
                "pages": [
                    {
                        "id": "p",
                        "name": "P",
                        "route": "/",
                        "layout": {
                            "id": "r",
                            "kind": "button",
                            "children": [{"id": "c", "kind": "text"}],
                        },
                    }
                ]
            },
            "children-on-leaf",
        ),
        (
            {
                "pages": [
                    {"id": "a", "name": "A", "route": "/a", "layout": {"id": "x", "kind": "stack"}},
                    {"id": "b", "name": "B", "route": "/b", "layout": {"id": "x", "kind": "stack"}},
                ]
            },
            "duplicate-layout-id",
        ),
        (
            {
                "pages": [
                    {
                        "id": "a",
                        "name": "A",
                        "route": "/a",
                        "parent_id": "b",
                        "layout": {"id": "x", "kind": "stack"},
                    },
                    {
                        "id": "b",
                        "name": "B",
                        "route": "/b",
                        "parent_id": "a",
                        "layout": {"id": "y", "kind": "stack"},
                    },
                ]
            },
            "page-hierarchy-cycle",
        ),
        (
            {
                "pages": [
                    {
                        "id": "a",
                        "name": "A",
                        "route": "/a",
                        "layout": {"id": "x", "kind": "carousel"},
                    }
                ]
            },
            "layout.kind",
        ),
    ],
)
def test_design_integrity_rejects(patch: dict[str, Any], needle: str) -> None:
    with pytest.raises(DocumentInvalid) as exc:
        parse_document({"design": patch})
    assert any(
        needle in e["path"] or needle == e.get("rule") or needle in e["message"]
        for e in exc.value.errors
    ), exc.value.errors


def test_layout_depth_limit() -> None:
    node: dict[str, Any] = {"id": "leaf", "kind": "text"}
    for i in range(14):
        node = {"id": f"s{i}", "kind": "stack", "children": [node]}
    with pytest.raises(DocumentInvalid) as exc:
        parse_document(
            {"design": {"pages": [{"id": "p", "name": "P", "route": "/", "layout": node}]}}
        )
    assert any(e.get("rule") == "layout-too-deep" for e in exc.value.errors)
    assert any(e["path"].startswith("design.pages.0.layout.children.0") for e in exc.value.errors)


def test_generated_pages_come_from_saved_entities_and_endpoints() -> None:
    d = jewellery_with_pages()
    routes = {p.route for p in d.design.pages}
    assert {"/login", "/", "/items", "/items/new", "/invoices", "/branches"} <= routes
    form = next(p for p in d.design.pages if p.route == "/items/new")
    from architectflow.schema import walk

    names = {str(n.props.get("name")) for n, _ in walk(form.layout) if n.kind == "input"}
    ep = next(e for e in d.api.endpoints if e.id == "api-create-item")
    assert names == {f.name for f in ep.request_fields}
    assert d.design.active_theme_id is not None and len(d.design.journeys) == 3
    # Generated design has no broken references.
    assert not {r for r in rules(d) if r.startswith("ui-missing") or r == "ui-nav-missing-page"}


def test_ui_rules_detect_intentionally_broken_references() -> None:
    d = jewellery_with_pages()
    raw = d.model_dump(mode="json")
    page = next(p for p in raw["design"]["pages"] if p["route"] == "/items")
    table = next(c for c in page["layout"]["children"] if c["kind"] == "table")
    table["endpoint_id"] = "api-does-not-exist"
    table["entity_id"] = "ent-ghost"
    page["layout"]["children"].append(
        {"id": "orphan-btn", "kind": "button", "props": {"label": "Do nothing"}}
    )
    page["layout"]["children"].append(
        {
            "id": "bad-link",
            "kind": "button",
            "props": {"label": "Broken"},
            "interaction": {"action": "navigate", "target_page_id": "nowhere", "implemented": True},
        }
    )
    page["roles"] = []
    form_page = next(p for p in raw["design"]["pages"] if p["route"] == "/items/new")
    form = next(c for c in form_page["layout"]["children"] if c["kind"] == "form")
    form["children"][0]["props"]["name"] = "not_in_api"
    raw["design"]["pages"].append(
        {
            "id": "loose",
            "name": "Loose form",
            "route": "/loose",
            "roles": ["admin"],
            "layout": {
                "id": "lf",
                "kind": "form",
                "children": [{"id": "lf-i", "kind": "input", "props": {"name": "x"}}],
            },
        }
    )
    broken = parse_document(raw)  # soft references: saving is allowed
    found = rules(broken)
    assert {
        "ui-missing-endpoint",
        "ui-missing-entity",
        "ui-action-without-outcome",
        "ui-nav-missing-page",
        "ui-auth-without-rule",
        "ui-field-not-in-request",
        "ui-missing-required-field",
        "ui-field-without-destination",
    } <= found
    f = next(x for x in run_validation(broken) if x.rule == "ui-missing-endpoint")
    assert "api-does-not-exist" in f.evidence and f.kind == "recommendation"


def test_removing_an_endpoint_keeps_ui_and_reports_it() -> None:
    d = jewellery_with_pages()
    new = apply_operations(d, parse_operations([{"op": "remove_endpoint", "id": "api-list-item"}]))
    assert len(new.design.pages) == len(d.design.pages)
    assert "ui-missing-endpoint" in rules(new)


def test_design_requests_produce_reviewable_theme_diffs() -> None:
    d = jewellery_with_pages()
    r = design_request("premium dark SaaS dashboard with emerald accents", d)
    ops = parse_operations(r.operations)
    lines = summarize(d, ops).lines
    assert any("appearance: light → dark" in line for line in lines)
    new = apply_operations(d, ops)
    t = next(t for t in new.design.themes if t.id == new.design.active_theme_id)
    assert t.appearance == "dark" and t.dark.primary == "#34d399"
    assert contrast_ratio(t.dark.on_primary, t.dark.primary) >= 4.5
    assert "contrast-too-low" not in rules(new)


@pytest.mark.parametrize(
    "request_,check",
    [
        (
            "compact sidebar enterprise",
            lambda t, d: t.spacing.density == "compact" and t.components.navigation == "sidebar",
        ),
        (
            "rounded, subtle shadows, less clutter",
            lambda t, d: (
                t.radii.md == 14
                and t.elevation.shadow == "subtle"
                and t.spacing.density == "spacious"
            ),
        ),
        ("professional developer tool", lambda t, d: t.preset == "developer-dark"),
        (
            "onboarding flow with validation and helpful empty states",
            lambda t, d: any(p.route == "/onboarding/profile" for p in d.design.pages),
        ),
        ("replace cards with a dense data table", lambda t, d: True),
    ],
)
def test_example_design_vocabulary(request_: str, check) -> None:  # type: ignore[no-untyped-def]
    d = jewellery_with_pages()
    r = design_request(request_, d)
    assert r.operations, r.explanation
    new = apply_operations(d, parse_operations(r.operations))
    t = next(t for t in new.design.themes if t.id == new.design.active_theme_id)
    assert check(t, new)


def test_unknown_design_request_changes_nothing() -> None:
    r = design_request("make it pop", jewellery_with_pages())
    assert r.operations == [] and "Nothing was changed" in r.explanation


def test_remove_page_cleans_journeys_and_children() -> None:
    d = jewellery_with_pages()
    new = apply_operations(d, parse_operations([{"op": "remove_page", "id": "page-items"}]))
    assert all(s.page_id != "page-items" for j in new.design.journeys for s in j.steps)
    assert all(p.parent_id != "page-items" for p in new.design.pages)


def test_prompt_includes_design_and_pages() -> None:
    from architectflow.prompts import generate_prompt
    from architectflow.schema import PromptSettings

    d = jewellery_with_pages()
    out = generate_prompt(d, 3, "Gems", PromptSettings(mode="frontend"))
    t = next(t for t in d.design.themes if t.id == d.design.active_theme_id)
    assert f"`--color-primary`: {t.light.primary}" in out
    assert "### Route map" in out and "`/items/new`" in out
    assert "visual-only in prototype" in out and "implemented in prototype" in out
    one = generate_prompt(d, 3, "Gems", PromptSettings(mode="page", page_id="page-items"))
    assert "### Page: Inventory items (`/items`)" in one
    assert "### Page: Dashboard" not in one
    ds = generate_prompt(copy.deepcopy(d), 3, "Gems", PromptSettings(mode="design_system"))
    assert "## Visual design system" in ds and "## Data model" not in ds

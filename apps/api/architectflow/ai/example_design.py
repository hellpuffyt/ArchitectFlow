"""Deterministic example-mode design proposals (NOT an AI; always labeled).

* ``generate_pages`` derives pages, navigation, forms and journeys from the project's
  actual entities, endpoints, roles and requirements.
* ``design_request`` maps a small documented vocabulary of visual requests
  (colors, dark/light, compact, rounded, sidebar, mobile-first, data table,
  onboarding flow, developer tool…) onto structured theme/page operations.
"""

from __future__ import annotations

import re
from typing import Any

from ..design.contrast import contrast_ratio
from ..design.presets import preset_theme
from ..schema import ArchitectureDocument, Endpoint, Entity, Theme
from .base import EXAMPLE_MODE_NOTICE, ProviderResult

PAGE_GENERATOR_NOTICE = "Deterministic page generator — no AI provider is called"

COLORS = {
    "emerald": "#047857",
    "green": "#15803d",
    "teal": "#0f766e",
    "cyan": "#0e7490",
    "blue": "#1d4ed8",
    "indigo": "#4338ca",
    "violet": "#6d28d9",
    "purple": "#7e22ce",
    "rose": "#be123c",
    "pink": "#be185d",
    "red": "#b91c1c",
    "orange": "#c2410c",
    "amber": "#b45309",
    "slate": "#334155",
}
# Lighter variants keep contrast on dark backgrounds.
DARK_COLORS = {
    "emerald": "#34d399",
    "green": "#4ade80",
    "teal": "#2dd4bf",
    "cyan": "#22d3ee",
    "blue": "#60a5fa",
    "indigo": "#818cf8",
    "violet": "#a78bfa",
    "purple": "#c084fc",
    "rose": "#fb7185",
    "pink": "#f472b6",
    "red": "#f87171",
    "orange": "#fb923c",
    "amber": "#fbbf24",
    "slate": "#94a3b8",
}


def on_color(bg: str) -> str:
    """Pick near-white or near-black text, whichever contrasts more with ``bg``."""
    light, dark = "#ffffff", "#0b0f19"
    return light if contrast_ratio(light, bg) >= contrast_ratio(dark, bg) else dark


class _Ids:
    def __init__(self, taken: set[str]) -> None:
        self.taken = taken

    def __call__(self, base: str) -> str:
        base = re.sub(r"[^a-z0-9-]+", "-", base.lower()).strip("-")[:56] or "el"
        cand, n = base, 2
        while cand in self.taken:
            cand, n = f"{base}-{n}", n + 1
        self.taken.add(cand)
        return cand


def _taken(doc: ArchitectureDocument) -> set[str]:
    from ..schema import walk

    ids = {p.id for p in doc.design.pages} | {t.id for t in doc.design.themes}
    ids |= {j.id for j in doc.design.journeys}
    for p in doc.design.pages:
        ids |= {n.id for n, _ in walk(p.layout)}
    return ids


def _node(
    ids: _Ids, page: str, kind: str, children: list[dict[str, Any]] | None = None, **extra: Any
) -> dict[str, Any]:
    out: dict[str, Any] = {"id": ids(f"{page}-{kind}"), "kind": kind}
    if children:
        out["children"] = children
    out.update(extra)
    return out


def _plural(name: str) -> str:
    return name + ("es" if name.endswith(("s", "ch", "x")) else "s")


def _input_kind(t: str) -> dict[str, Any]:
    if t == "boolean":
        return {"kind": "checkbox"}
    if t in {"integer", "bigint", "numeric"}:
        return {"kind": "input", "type": "number"}
    if t in {"date", "timestamp"}:
        return {"kind": "input", "type": "date"}
    return {"kind": "input", "type": "text"}


def generate_pages(doc: ArchitectureDocument) -> ProviderResult:
    ids = _Ids(_taken(doc))
    ops: list[dict[str, Any]] = []
    roles = [a.id for a in doc.actors if a.is_role]
    entities = {e.id: e for e in doc.database.entities}
    list_eps = [
        e
        for e in doc.api.endpoints
        if e.method == "GET" and e.response_is_list and e.response_entity_id in entities
    ]
    create_eps = {
        e.response_entity_id: e
        for e in doc.api.endpoints
        if e.method == "POST" and e.response_entity_id in entities
    }
    text = doc.vision.lower()
    offline = "offline" in text

    if not doc.design.themes:
        ops.append(
            {"op": "put_theme", "theme": preset_theme("saas-light", ids("theme")).model_dump()}
        )
        ops.append(
            {"op": "set_active_theme", "id": next(i for i in ids.taken if i.startswith("theme"))}
        )

    nav_targets: list[tuple[str, str]] = []
    page_specs: list[dict[str, Any]] = []
    for ep in list_eps:
        ent = entities[ep.response_entity_id or ""]
        pid = ids(f"page-{_plural(ent.name)}")
        nav_targets.append((pid, ent.label or ent.name.title()))
        page_specs.append({"pid": pid, "entity": ent, "list": ep, "create": create_eps.get(ent.id)})

    def nav(page_id: str) -> dict[str, Any]:
        items = [
            _node(
                ids,
                page_id,
                "button",
                props={"label": "Dashboard", "variant": "ghost"},
                interaction={
                    "action": "navigate",
                    "target_page_id": "page-dashboard",
                    "implemented": True,
                },
            )
        ]
        items += [
            _node(
                ids,
                page_id,
                "button",
                props={"label": label, "variant": "ghost"},
                interaction={"action": "navigate", "target_page_id": target, "implemented": True},
            )
            for target, label in nav_targets
        ]
        return _node(ids, page_id, "nav", items, props={"label": "Main navigation"})

    has_auth = any(n.type == "auth_service" for n in doc.nodes)
    pages: list[dict[str, Any]] = []
    if has_auth:
        pid = "page-login"
        ids.taken.add(pid)
        form = _node(
            ids,
            pid,
            "form",
            [
                _node(
                    ids,
                    pid,
                    "input",
                    props={"label": "Email", "name": "email", "type": "email", "required": True},
                ),
                _node(
                    ids,
                    pid,
                    "input",
                    props={
                        "label": "Password",
                        "name": "password",
                        "type": "password",
                        "required": True,
                    },
                ),
                _node(
                    ids,
                    pid,
                    "button",
                    props={"label": "Sign in", "variant": "primary"},
                    interaction={
                        "action": "navigate",
                        "target_page_id": "page-dashboard",
                        "implemented": True,
                    },
                ),
            ],
            props={"label": "Sign in"},
        )
        pages.append(
            {
                "id": pid,
                "name": "Sign in",
                "route": "/login",
                "requires_auth": False,
                "states": [
                    {"kind": "validation_error", "message": "Email or password is incorrect."},
                    {"kind": "loading", "message": "Signing in…"},
                    {"kind": "error", "message": "Sign-in failed; try again."},
                ],
                "layout": _node(
                    ids,
                    pid,
                    "container",
                    [_node(ids, pid, "heading", props={"text": "Sign in", "level": 1}), form],
                    props={"align": "center", "max_width": 420},
                ),
            }
        )

    pid = "page-dashboard"
    ids.taken.add(pid)
    stats = [
        _node(
            ids,
            pid,
            "stat",
            props={"label": p["entity"].label or p["entity"].name, "value": "—"},
            endpoint_id=p["list"].id,
            entity_id=p["entity"].id,
        )
        for p in page_specs[:4]
    ]
    dash_children = [nav(pid), _node(ids, pid, "heading", props={"text": "Dashboard", "level": 1})]
    if offline:
        dash_children.append(
            _node(
                ids,
                pid,
                "alert",
                props={
                    "tone": "info",
                    "text": "You are offline. Changes are saved on this device and "
                    "sync when you reconnect.",
                },
            )
        )
    if stats:
        dash_children.append(
            _node(
                ids,
                pid,
                "grid",
                stats,
                props={"columns": min(4, len(stats))},
                responsive={"sm": {"columns": 1}, "md": {"columns": 2}},
            )
        )
    dash_children.append(_node(ids, pid, "chart", props={"label": "Activity (last 30 days)"}))
    pages.append(
        {
            "id": pid,
            "name": "Dashboard",
            "route": "/",
            "requires_auth": True,
            "roles": roles,
            "states": [
                {"kind": "loading", "message": "Loading…"},
                {"kind": "error", "message": "Could not load data."},
                {"kind": "empty", "message": "No activity yet."},
            ],
            "layout": _node(ids, pid, "container", dash_children),
        }
    )

    journeys: list[dict[str, Any]] = []
    for spec in page_specs:
        spec_ent: Entity = spec["entity"]
        list_ep: Endpoint = spec["list"]
        create_ep: Endpoint | None = spec["create"]
        lp = spec["pid"]
        ent = spec_ent
        label = ent.label or ent.name.title()
        form_pid = ids(f"page-{ent.name}-new") if create_ep else None
        header = [_node(ids, lp, "heading", props={"text": _plural(label), "level": 1})]
        if form_pid:
            header.append(
                _node(
                    ids,
                    lp,
                    "button",
                    props={"label": f"New {label.lower()}", "variant": "primary"},
                    interaction={
                        "action": "navigate",
                        "target_page_id": form_pid,
                        "implemented": True,
                    },
                )
            )
        cols = [f.name for f in list_ep.response_fields][:6]
        page_roles = list_ep.roles if list_ep.auth == "roles" else roles
        pages.append(
            {
                "id": lp,
                "name": _plural(label),
                "route": list_ep.path.removeprefix("/api") or "/",
                "parent_id": "page-dashboard",
                "requires_auth": list_ep.auth != "public",
                "roles": page_roles,
                "states": [
                    {"kind": "loading", "message": f"Loading {_plural(label).lower()}…"},
                    {"kind": "empty", "message": f"No {_plural(label).lower()} yet."},
                    {"kind": "error", "message": "Could not load the list. Retry."},
                    {"kind": "permission_denied", "message": "Your role cannot view this list."},
                ],
                "layout": _node(
                    ids,
                    lp,
                    "container",
                    [
                        nav(lp),
                        _node(
                            ids,
                            lp,
                            "stack",
                            header,
                            props={"direction": "row", "justify": "between"},
                            responsive={"sm": {"direction": "column"}},
                        ),
                        _node(
                            ids,
                            lp,
                            "input",
                            props={
                                "label": "Search",
                                "name": "q",
                                "placeholder": f"Search {_plural(label).lower()}",
                            },
                        ),
                        _node(
                            ids,
                            lp,
                            "table",
                            props={"columns": ", ".join(cols)},
                            endpoint_id=list_ep.id,
                            entity_id=ent.id,
                        ),
                    ],
                ),
            }
        )
        steps = [
            {"page_id": "page-dashboard", "action": "open navigation"},
            {"page_id": lp, "action": f"review {_plural(label).lower()}"},
        ]
        if form_pid and create_ep:
            inputs = []
            for f in create_ep.request_fields:
                kind = _input_kind(f.type)
                inputs.append(
                    _node(
                        ids,
                        form_pid,
                        kind["kind"],
                        props={
                            "label": f.name.replace("_", " ").capitalize(),
                            "name": f.name,
                            "required": f.required,
                            **({"type": kind["type"]} if "type" in kind else {}),
                        },
                        binding={"entity_id": f.entity_id, "entity_field": f.entity_field},
                    )
                )
            inputs.append(
                _node(
                    ids,
                    form_pid,
                    "button",
                    props={"label": "Save", "variant": "primary"},
                    interaction={
                        "trigger": "click",
                        "action": "call_api",
                        "endpoint_id": create_ep.id,
                        "implemented": False,
                    },
                )
            )
            pages.append(
                {
                    "id": form_pid,
                    "name": f"New {label.lower()}",
                    "route": f"{create_ep.path.removeprefix('/api')}/new",
                    "parent_id": lp,
                    "requires_auth": True,
                    "roles": create_ep.roles if create_ep.auth == "roles" else roles,
                    "states": [
                        {"kind": "loading", "message": "Saving…"},
                        {"kind": "validation_error", "message": "Fix the highlighted fields."},
                        {"kind": "error", "message": "Saving failed; nothing was stored."},
                        {"kind": "success", "message": f"{label} saved."},
                    ],
                    "layout": _node(
                        ids,
                        form_pid,
                        "container",
                        [
                            nav(form_pid),
                            _node(
                                ids,
                                form_pid,
                                "heading",
                                props={"text": f"New {label.lower()}", "level": 1},
                            ),
                            _node(
                                ids,
                                form_pid,
                                "form",
                                inputs,
                                endpoint_id=create_ep.id,
                                props={"label": f"New {label.lower()}"},
                                responsive={"sm": {"columns": 1}},
                            ),
                        ],
                    ),
                }
            )
            steps.append({"page_id": form_pid, "action": f"create {label.lower()}"})
        journeys.append(
            {
                "id": ids(f"journey-{ent.name}"),
                "name": f"Manage {_plural(label)}",
                "role_id": page_roles[0] if page_roles else None,
                "steps": steps,
            }
        )

    for page in pages:
        if any(p.id == page["id"] for p in doc.design.pages):
            continue
        ops.append({"op": "put_page", "page": page})
    for j in journeys:
        ops.append({"op": "put_ui_journey", "journey": j})
    explanation = (
        # Page generation never calls a provider, so it must not claim (in live mode)
        # that no provider is configured.
        f"{PAGE_GENERATOR_NOTICE}. Pages derived from your saved design: "
        f"{len(pages)} pages from {len(page_specs)} list endpoint(s), "
        f"{'a sign-in page (auth component present), ' if has_auth else ''}"
        f"navigation, forms bound to request fields, and {len(journeys)} journey(s)."
    )
    questions = (
        []
        if page_specs
        else [
            "No list endpoints with a response entity were found; "
            "add API endpoints first for richer pages."
        ]
    )
    return ProviderResult(explanation=explanation, operations=ops, questions=questions)


def _active(doc: ArchitectureDocument) -> Theme | None:
    return next(
        (t for t in doc.design.themes if t.id == doc.design.active_theme_id),
        doc.design.themes[0] if doc.design.themes else None,
    )


def design_request(request: str, doc: ArchitectureDocument) -> ProviderResult:
    low = request.lower()
    if re.search(r"\b(generate|create|derive)\b.*\bpages?\b|\bfrom (the )?requirements\b", low):
        return generate_pages(doc)
    ids = _Ids(_taken(doc))
    ops: list[dict[str, Any]] = []
    did: list[str] = []
    original = _active(doc)
    theme = original
    if re.search(r"developer tool|developer-tool|dev tool", low):
        theme = preset_theme("developer-dark", theme.id if theme else ids("theme"))
        did.append("developer-tool preset")
    if theme is None:
        theme = preset_theme("saas-light", ids("theme"))
        did.append("created a theme")
    t = theme.model_dump()
    if re.search(r"\bdark\b", low):
        t["appearance"] = "dark"
        did.append("dark appearance")
    elif re.search(r"\blight\b", low):
        t["appearance"] = "light"
        did.append("light appearance")
    color = next((c for c in COLORS if re.search(rf"\b{c}\b", low)), None)
    if color:
        t["light"]["primary"] = COLORS[color]
        t["light"]["on_primary"] = on_color(COLORS[color])
        t["dark"]["primary"] = DARK_COLORS[color]
        t["dark"]["on_primary"] = on_color(DARK_COLORS[color])
        t["light"]["accent"], t["dark"]["accent"] = COLORS[color], DARK_COLORS[color]
        did.append(f"{color} primary/accent")
    if re.search(r"\bpremium\b", low):
        t["elevation"]["shadow"] = "medium"
        t["typography"]["heading_weight"] = 700
        t["radii"].update({"md": 12, "lg": 18})
        did.append("premium elevation and type")
    if re.search(r"\b(compact|dense|enterprise)\b", low):
        t["spacing"]["density"] = "compact"
        t["components"]["table_density"] = "compact"
        t["typography"]["base_size"] = 14
        did.append("compact density")
    if re.search(r"\b(rounded|round|soft)\b", low):
        t["radii"].update({"sm": 8, "md": 14, "lg": 22})
        t["components"]["button_radius"] = "full"
        did.append("rounded corners")
    if re.search(r"\bsubtle shadows?\b", low):
        t["elevation"]["shadow"] = "subtle"
        did.append("subtle shadows")
    if re.search(r"less clutter|minimal|clean", low):
        t["spacing"]["density"] = "spacious"
        t["components"]["card"] = "flat"
        did.append("less clutter (spacious, flat cards)")
    if re.search(r"\bsidebar\b", low):
        t["components"]["navigation"] = "sidebar"
        did.append("sidebar navigation")
    mobile_first = bool(re.search(r"mobile[- ]first", low))
    if mobile_first or re.search(r"\b(top ?bar|top nav)\b", low):
        t["components"]["navigation"] = "topbar"
        did.append("top navigation")
    if original is None or t != original.model_dump():
        ops.append({"op": "put_theme", "theme": t})
        if doc.design.active_theme_id != theme.id:
            ops.append({"op": "set_active_theme", "id": theme.id})

    if mobile_first:
        for page in doc.design.pages:
            changed = _with_mobile_rules(page.model_dump())
            if changed is not None:
                ops.append({"op": "put_page", "page": changed})
        did.append("mobile rules for multi-column layouts")
    if re.search(r"(replace|swap).*cards?.*(table)|data table", low):
        for page in doc.design.pages:
            changed = _cards_to_table(page.model_dump(), doc, ids)
            if changed is not None:
                ops.append({"op": "put_page", "page": changed})
                did.append(f"table instead of cards on {page.name}")
    if re.search(r"onboarding", low):
        ops += _onboarding(ids, doc)
        did.append("onboarding flow with validation and empty states")
    if not ops:
        return ProviderResult(
            explanation=(
                f"{EXAMPLE_MODE_NOTICE}. The example design assistant understands: "
                "colors (emerald, blue, violet, rose, amber…), dark/light, premium, "
                "compact/dense, rounded, subtle shadows, less clutter, sidebar, "
                "mobile-first, 'replace cards with a data table', 'onboarding flow', "
                "'professional developer tool', 'generate pages from requirements'. "
                "Nothing was changed."
            ),
            operations=[],
            questions=["Which visual change do you want?"],
        )
    return ProviderResult(
        explanation=f"{EXAMPLE_MODE_NOTICE}. Applied: {', '.join(did)}.", operations=ops
    )


def _with_mobile_rules(page: dict[str, Any]) -> dict[str, Any] | None:
    changed = False

    def visit(n: dict[str, Any]) -> None:
        nonlocal changed
        resp = n.setdefault("responsive", {})
        if n["kind"] == "grid" and not resp.get("sm"):
            resp["sm"] = {"columns": 1}
            changed = True
        if (
            n["kind"] == "stack"
            and n.get("props", {}).get("direction") == "row"
            and not resp.get("sm")
        ):
            resp["sm"] = {"direction": "column"}
            changed = True
        for c in n.get("children", []):
            visit(c)

    visit(page["layout"])
    return page if changed else None


def _cards_to_table(
    page: dict[str, Any], doc: ArchitectureDocument, ids: _Ids
) -> dict[str, Any] | None:
    list_ep = next((e for e in doc.api.endpoints if e.method == "GET" and e.response_is_list), None)
    changed = False

    def visit(n: dict[str, Any]) -> None:
        nonlocal changed
        kids = n.get("children", [])
        for i, c in enumerate(kids):
            grand = c.get("children", [])
            if (
                c["kind"] in {"grid", "stack"}
                and grand
                and all(g["kind"] in {"card", "stat"} for g in grand)
            ):
                table: dict[str, Any] = {
                    "id": ids(f"{page['id']}-table"),
                    "kind": "table",
                    "props": {"density": "compact", "columns": "name, value"},
                }
                if list_ep:
                    table["endpoint_id"] = list_ep.id
                    table["entity_id"] = list_ep.response_entity_id
                kids[i] = table
                changed = True
            else:
                visit(c)

    visit(page["layout"])
    return page if changed else None


def _onboarding(ids: _Ids, doc: ArchitectureDocument) -> list[dict[str, Any]]:
    roles = [a.id for a in doc.actors if a.is_role]
    w, p, d = (
        ids("page-onboarding-welcome"),
        ids("page-onboarding-profile"),
        ids("page-onboarding-done"),
    )
    pages = [
        {
            "id": w,
            "name": "Welcome",
            "route": "/onboarding",
            "requires_auth": True,
            "roles": roles,
            "states": [{"kind": "loading", "message": "Preparing your workspace…"}],
            "layout": _node(
                ids,
                w,
                "container",
                [
                    _node(ids, w, "heading", props={"text": "Welcome", "level": 1}),
                    _node(
                        ids, w, "text", props={"text": "Set up your workspace in two short steps."}
                    ),
                    _node(
                        ids,
                        w,
                        "button",
                        props={"label": "Get started", "variant": "primary"},
                        interaction={
                            "action": "navigate",
                            "target_page_id": p,
                            "implemented": True,
                        },
                    ),
                ],
                props={"align": "center"},
            ),
        },
        {
            "id": p,
            "name": "Your profile",
            "route": "/onboarding/profile",
            "parent_id": w,
            "requires_auth": True,
            "roles": roles,
            "states": [
                {"kind": "validation_error", "message": "Organization name is required."},
                {"kind": "error", "message": "We could not save your profile. Retry."},
                {"kind": "loading", "message": "Saving…"},
            ],
            "layout": _node(
                ids,
                p,
                "container",
                [
                    _node(
                        ids,
                        p,
                        "heading",
                        props={"text": "Tell us about your organization", "level": 1},
                    ),
                    _node(
                        ids,
                        p,
                        "form",
                        [
                            _node(
                                ids,
                                p,
                                "input",
                                props={
                                    "label": "Organization name",
                                    "name": "name",
                                    "required": True,
                                    "help": "Shown to your team",
                                },
                            ),
                            _node(
                                ids,
                                p,
                                "select",
                                props={
                                    "label": "Team size",
                                    "name": "team_size",
                                    "options": "1-10, 11-50, 51-200, 200+",
                                },
                            ),
                            _node(
                                ids,
                                p,
                                "button",
                                props={"label": "Continue", "variant": "primary"},
                                interaction={
                                    "action": "navigate",
                                    "target_page_id": d,
                                    "implemented": True,
                                },
                            ),
                        ],
                        props={"label": "Organization"},
                    ),
                ],
            ),
        },
        {
            "id": d,
            "name": "All set",
            "route": "/onboarding/done",
            "parent_id": w,
            "requires_auth": True,
            "roles": roles,
            "states": [
                {"kind": "empty", "message": "Nothing here yet — create your first record."}
            ],
            "layout": _node(
                ids,
                d,
                "container",
                [
                    _node(
                        ids,
                        d,
                        "empty_state",
                        props={
                            "title": "You're all set",
                            "text": "Your workspace is ready. Create your first "
                            "record to see it here.",
                        },
                    ),
                    _node(
                        ids,
                        d,
                        "button",
                        props={"label": "Go to dashboard", "variant": "primary"},
                        interaction={
                            "action": "navigate",
                            "target_page_id": "page-dashboard",
                            "implemented": True,
                        },
                    ),
                ],
                props={"align": "center"},
            ),
        },
    ]
    ops: list[dict[str, Any]] = [{"op": "put_page", "page": pg} for pg in pages]
    ops.append(
        {
            "op": "put_ui_journey",
            "journey": {
                "id": ids("journey-onboarding"),
                "name": "Onboarding",
                "role_id": roles[0] if roles else None,
                "steps": [
                    {"page_id": w, "action": "start"},
                    {"page_id": p, "action": "fill profile"},
                    {"page_id": d, "action": "finish"},
                ],
            },
        }
    )
    return ops

"""UI/UX validation: UI ↔ API/data cross-references, accessibility and design consistency.

Broken UI references are reported, not blocked, so that an architecture change never
silently deletes UI design (and vice versa); each finding names the explicit
synchronization step to take.
"""

from __future__ import annotations

from collections import Counter

from ..design.contrast import contrast_ratio
from ..schema import LayoutNode, Page, walk
from .context import GraphContext
from .findings import Finding, make_finding

_INPUTS = {"input", "select", "checkbox"}
_DATA_VIEWS = {"table", "list", "stat", "chart"}


def _nodes(page: Page) -> list[LayoutNode]:
    return [n for n, _ in walk(page.layout)]


def _label(node: LayoutNode) -> str:
    text = node.props.get("label") or node.props.get("text") or node.props.get("name") or ""
    return f"{node.kind} '{text}'" if text else f"{node.kind} {node.id}"


def ui_references(ctx: GraphContext) -> list[Finding]:
    out: list[Finding] = []
    design = ctx.doc.design
    endpoints = {e.id: e for e in ctx.doc.api.endpoints}
    entities = {e.id: e for e in ctx.doc.database.entities}
    pages = {p.id: p for p in design.pages}
    for page in design.pages:
        where = f"page {page.name} ({page.route})"
        for node in _nodes(page):
            # 1. component calling a nonexistent API
            for ep_id in filter(
                None, [node.endpoint_id, node.interaction.endpoint_id if node.interaction else None]
            ):
                if ep_id not in endpoints:
                    out.append(
                        make_finding(
                            "ui-missing-endpoint",
                            "error",
                            "recommendation",
                            "Component calls an API that does not exist",
                            "The endpoint was removed or renamed in API design.",
                            f"{where}: {_label(node)} → endpoint '{ep_id}'",
                            "Re-link the component to an existing endpoint, or restore the "
                            "endpoint in API design.",
                        )
                    )
            # 5. screen referencing an entity absent from the architecture
            for ent_id in filter(
                None, [node.entity_id, node.binding.entity_id if node.binding else None]
            ):
                if ent_id not in entities:
                    out.append(
                        make_finding(
                            "ui-missing-entity",
                            "error",
                            "recommendation",
                            "Screen references a missing data entity",
                            "The entity does not exist in the database design.",
                            f"{where}: {_label(node)} → entity '{ent_id}'",
                            "Link to an existing entity or add it in Database design.",
                        )
                    )
            if node.binding and node.binding.entity_id in entities and node.binding.entity_field:
                cols = {f.name: f for f in entities[node.binding.entity_id].fields}
                if node.binding.entity_field not in cols:
                    out.append(
                        make_finding(
                            "ui-missing-column",
                            "error",
                            "recommendation",
                            "Input bound to a missing column",
                            "The bound column no longer exists.",
                            f"{where}: {_label(node)} → "
                            f"{entities[node.binding.entity_id].name}.{node.binding.entity_field}",
                            "Bind the input to an existing column.",
                        )
                    )
            inter = node.interaction
            # 6. navigation to a nonexistent route/page
            if (
                inter
                and inter.action == "navigate"
                and (inter.target_page_id is None or inter.target_page_id not in pages)
            ):
                out.append(
                    make_finding(
                        "ui-nav-missing-page",
                        "error",
                        "recommendation",
                        "Navigation to a page that does not exist",
                        "The navigation target is missing.",
                        f"{where}: {_label(node)} → '{inter.target_page_id}'",
                        "Point the link at an existing page or create the page.",
                    )
                )
            # 4. user action with no outcome
            if node.kind == "button" and (inter is None or inter.action == "none"):
                out.append(
                    make_finding(
                        "ui-action-without-outcome",
                        "warning",
                        "recommendation",
                        "Button has no defined behavior",
                        "A user action without an outcome is either missing behavior or a "
                        "decorative control.",
                        f"{where}: {_label(node)}",
                        "Give the button an interaction (navigate, call API, open/close modal).",
                    )
                )
            if inter and inter.action == "call_api" and inter.endpoint_id is None:
                out.append(
                    make_finding(
                        "ui-call-without-endpoint",
                        "error",
                        "recommendation",
                        "API action without an endpoint",
                        "The action says it calls an API but names none.",
                        f"{where}: {_label(node)}",
                        "Choose the endpoint.",
                    )
                )
            if node.kind == "form":
                out.extend(_form_checks(where, node, endpoints))
        # 3. page requiring auth with no access rule
        if page.requires_auth and not page.roles:
            out.append(
                make_finding(
                    "ui-auth-without-rule",
                    "warning",
                    "recommendation",
                    "Protected page without an access rule",
                    "The page requires sign-in but does not say which roles may open it.",
                    f"{where}",
                    "Select the roles allowed to view this page (or mark it public).",
                )
            )
        unknown_roles = [r for r in page.roles if r not in {a.id for a in ctx.doc.actors}]
        if unknown_roles:
            out.append(
                make_finding(
                    "ui-unknown-role",
                    "error",
                    "recommendation",
                    "Page allows an undefined role",
                    "Roles must exist in Requirements.",
                    f"{where}: {', '.join(unknown_roles)}",
                    "Define the role or remove it from the page.",
                )
            )
        calls = [
            n
            for n in _nodes(page)
            if n.endpoint_id or (n.interaction and n.interaction.endpoint_id)
        ]
        kinds = {s.kind for s in page.states}
        if calls and not {"loading", "error"} <= kinds:
            missing = sorted({"loading", "error"} - kinds)
            out.append(
                make_finding(
                    "ui-missing-states",
                    "warning",
                    "recommendation",
                    "API-backed page without loading/error states",
                    "The page calls the API but does not define what users see while waiting or "
                    "when the call fails.",
                    f"{where}: missing {', '.join(missing)}",
                    "Add the missing page states and their messages.",
                )
            )
        if any(n.kind in _DATA_VIEWS for n in _nodes(page)) and "empty" not in kinds:
            out.append(
                make_finding(
                    "ui-missing-empty-state",
                    "info",
                    "recommendation",
                    "Data view without an empty state",
                    "Lists and tables need an empty state.",
                    f"{where}",
                    "Add an 'empty' page state with a helpful message.",
                )
            )
        wide = [
            n
            for n in _nodes(page)
            if n.kind in {"grid", "table"}
            or (n.kind == "stack" and n.props.get("direction") == "row")
        ]
        if wide and not any(n.responsive.sm for n in _nodes(page)):
            out.append(
                make_finding(
                    "ui-missing-responsive",
                    "info",
                    "recommendation",
                    "No mobile layout rules",
                    "The page has multi-column layout but no small-screen rule.",
                    f"{where}: {', '.join(_label(n) for n in wide[:3])}",
                    "Add a mobile (sm) rule: fewer columns, column direction, or hide secondary "
                    "elements.",
                )
            )
    routes = Counter(p.route for p in design.pages)
    for route, count in routes.items():
        if count > 1:
            out.append(
                make_finding(
                    "ui-duplicate-route",
                    "error",
                    "recommendation",
                    "Two pages share a route",
                    "Each route must resolve to one page.",
                    f"route {route} used {count} times",
                    "Change one of the routes.",
                )
            )
    for journey in design.journeys:
        if journey.role_id and journey.role_id not in {a.id for a in ctx.doc.actors}:
            out.append(
                make_finding(
                    "ui-journey-unknown-role",
                    "warning",
                    "recommendation",
                    "Journey for an undefined role",
                    "The journey's role is not defined.",
                    f"journey {journey.name} → '{journey.role_id}'",
                    "Pick an existing role.",
                )
            )
    return out


def _form_checks(where: str, form: LayoutNode, endpoints: dict) -> list[Finding]:  # type: ignore[type-arg]
    out: list[Finding] = []
    inputs = [n for n, _ in walk(form) if n.kind in _INPUTS]
    submit = form.interaction if form.interaction and form.interaction.trigger == "submit" else None
    ep_id = form.endpoint_id or (submit.endpoint_id if submit else None)
    ep = endpoints.get(ep_id) if ep_id else None
    if ep_id is None:
        # 2. form field with no data destination
        for inp in inputs:
            if not (inp.binding and inp.binding.entity_id):
                out.append(
                    make_finding(
                        "ui-field-without-destination",
                        "warning",
                        "recommendation",
                        "Form field has no data destination",
                        "Neither the form nor the field says where the value is sent or stored.",
                        f"{where}: {_label(inp)} in form {form.id}",
                        "Link the form to an endpoint, or bind the field to an entity column.",
                    )
                )
        return out
    if ep is None:
        return out  # reported by ui-missing-endpoint
    req = {f.name: f for f in ep.request_fields}
    names = {str(i.props.get("name", "")) for i in inputs}
    for inp in inputs:
        name = str(inp.props.get("name", ""))
        if name not in req:
            out.append(
                make_finding(
                    "ui-field-not-in-request",
                    "warning",
                    "recommendation",
                    "Form field not accepted by the API",
                    f"{ep.method} {ep.path} has no request field named '{name}'.",
                    f"{where}: {_label(inp)}",
                    "Rename the field (props.name) or add it to the endpoint's request schema.",
                )
            )
        elif inp.props.get("type") in {"number"} and req[name].type in {"text", "varchar"}:
            out.append(
                make_finding(
                    "ui-field-type-mismatch",
                    "warning",
                    "recommendation",
                    "Form field type differs from the API schema",
                    "The input collects a number but the API expects text.",
                    f"{where}: {_label(inp)} vs {ep.method} {ep.path}.{name}:{req[name].type}",
                    "Align the input type with the request schema.",
                )
            )
    for name, f in req.items():
        if f.required and name not in names:
            out.append(
                make_finding(
                    "ui-missing-required-field",
                    "warning",
                    "recommendation",
                    "Required API field missing from form",
                    f"{ep.method} {ep.path} requires '{name}' but the form has no such input.",
                    f"{where}: form {form.id}",
                    "Add an input with props.name='" + name + "'.",
                )
            )
    return out


def design_tokens(ctx: GraphContext) -> list[Finding]:
    """Measurable WCAG contrast and token consistency for every theme."""
    out: list[Finding] = []
    for theme in ctx.doc.design.themes:
        modes = {"light": theme.light, "dark": theme.dark}
        used = ["light", "dark"] if theme.appearance == "system" else [theme.appearance]
        for mode in used:
            p = modes[mode]
            pairs = [
                ("text", p.text, "background", p.background, 4.5),
                ("text", p.text, "surface", p.surface, 4.5),
                ("muted text", p.muted_text, "background", p.background, 4.5),
                ("button text", p.on_primary, "primary", p.primary, 4.5),
                ("danger", p.danger, "background", p.background, 3.0),
            ]
            for fg_name, fg, bg_name, bg, minimum in pairs:
                ratio = contrast_ratio(fg, bg)
                if ratio < minimum:
                    out.append(
                        make_finding(
                            "contrast-too-low",
                            "error" if minimum >= 4.5 else "warning",
                            "recommendation",
                            "Insufficient color contrast",
                            f"WCAG 2.x requires at least {minimum}:1 here.",
                            f"theme {theme.name} ({mode}): {fg_name} {fg} on {bg_name} {bg} = "
                            f"{ratio:.2f}:1",
                            f"Darken/lighten {fg_name} or {bg_name} until the "
                            f"ratio is ≥ {minimum}:1.",
                        )
                    )
        bp = theme.layout.breakpoints
        if bp.sm >= bp.md:
            out.append(
                make_finding(
                    "breakpoints-inverted",
                    "error",
                    "recommendation",
                    "Breakpoints out of order",
                    "The small breakpoint must be narrower than the medium one.",
                    f"theme {theme.name}: sm={bp.sm} md={bp.md}",
                    "Set sm < md.",
                )
            )
        if theme.typography.base_size < 14:
            out.append(
                make_finding(
                    "small-body-text",
                    "info",
                    "recommendation",
                    "Small body text",
                    "Body text below 14px is hard to read for many users.",
                    f"theme {theme.name}: base_size={theme.typography.base_size}",
                    "Use at least 14px (16px is a common default).",
                )
            )
        if theme.motion.intensity != "none" and not theme.motion.respect_reduced_motion:
            out.append(
                make_finding(
                    "reduced-motion-ignored",
                    "warning",
                    "recommendation",
                    "Animations ignore reduced-motion preference",
                    "Users who ask the OS for reduced motion will still see animations.",
                    f"theme {theme.name}",
                    "Enable respect_reduced_motion.",
                )
            )
    return out


def accessibility_requirements(ctx: GraphContext) -> list[Finding]:
    if not ctx.doc.design.pages:
        return []
    nfr = [r for r in ctx.doc.requirements.nonfunctional if r.category == "accessibility"]
    text = ctx.requirement_text
    if nfr or "accessib" in text or "wcag" in text:
        return []
    return [
        make_finding(
            "missing-accessibility-requirement",
            "info",
            "recommendation",
            "No accessibility requirement",
            "The project has UI pages but no stated accessibility target.",
            f"{len(ctx.doc.design.pages)} page(s), no accessibility requirement",
            "Add a non-functional requirement such as 'WCAG 2.2 AA'.",
        )
    ]

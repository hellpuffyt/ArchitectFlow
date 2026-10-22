"""Prompt sections for the UI/UX design (theme tokens, pages, layouts, interactions)."""

from __future__ import annotations

from ..schema import ArchitectureDocument, LayoutNode, Page, Theme, walk

C, A, OPT, U = "[CONFIRMED]", "[ASSUMPTION]", "[OPTIONAL]", "[UNRESOLVED]"


def active_theme(doc: ArchitectureDocument) -> Theme | None:
    d = doc.design
    return next(
        (t for t in d.themes if t.id == d.active_theme_id), d.themes[0] if d.themes else None
    )


def design_section(doc: ArchitectureDocument) -> list[str]:
    theme = active_theme(doc)
    if theme is None:
        return ["## Visual design system", f"{U} No theme saved; choose a design system first."]
    t = theme
    out = [
        "## Visual design system",
        f"{C} Theme “{t.name}” (appearance: {t.appearance}). "
        "Implement these as design tokens (CSS custom properties + Tailwind theme), not as "
        "hard-coded values.",
    ]
    modes = ["light", "dark"] if t.appearance == "system" else [t.appearance]
    for mode in modes:
        p = t.light if mode == "light" else t.dark
        out.append(f"### Colors ({mode})")
        out += [f"- `--color-{k.replace('_', '-')}`: {v}" for k, v in p.model_dump().items()]
    ty = t.typography
    out += [
        "### Typography",
        f"- Heading font: {ty.heading_font}; body font: {ty.body_font}; mono: {ty.mono_font}",
        f"- Base size {ty.base_size}px, modular scale ratio {ty.scale_ratio}, line-height "
        f"{ty.line_height}, heading weight {ty.heading_weight}, body weight {ty.body_weight}",
        "### Spacing, shape and elevation",
        f"- Spacing unit {t.spacing.unit}px, density {t.spacing.density}",
        f"- Radii: sm {t.radii.sm}px, md {t.radii.md}px, lg {t.radii.lg}px",
        f"- Shadow level {t.elevation.shadow}; border width {t.elevation.border_width}px",
        "### Component variants",
        f"- Buttons: {t.components.button}, radius {t.components.button_radius}",
        f"- Inputs: {t.components.input}; cards: {t.components.card}; tables: "
        f"{t.components.table_density}",
        f"- Navigation: {t.components.navigation}; icon stroke {t.components.icon_stroke}",
        "### Layout and responsive behavior",
        f"- Max content width {t.layout.max_width}px, {t.layout.grid_columns}-column grid, "
        f"gutter {t.layout.gutter}px",
        f"- Breakpoints: `sm` rules apply below {t.layout.breakpoints.sm}px, `md` rules "
        f"below {t.layout.breakpoints.md}px (mobile-first CSS: base = mobile is also fine "
        "if the result is identical)",
        "### Motion and accessibility",
        f"- Motion intensity {t.motion.intensity}, {t.motion.duration_ms}ms transitions"
        + ("; honor prefers-reduced-motion" if t.motion.respect_reduced_motion else ""),
        f"- {C} Text/background pairs must meet WCAG 2.2 AA contrast; every interactive "
        "element must be keyboard reachable with a visible focus ring.",
        "### Framework guidance",
        f"- {OPT} Next.js App Router + React + TypeScript (strict) + Tailwind CSS; map the "
        "tokens above into `@theme` variables and build components from them.",
    ]
    return out


def _describe(
    node: LayoutNode, depth: int, pages: dict[str, Page], doc: ArchitectureDocument
) -> str:
    eps = {e.id: e for e in doc.api.endpoints}
    ents = {e.id: e for e in doc.database.entities}
    bits: list[str] = [node.kind]
    for key in ("label", "text", "title", "name", "placeholder", "columns", "variant", "type"):
        if key in node.props:
            bits.append(f"{key}={node.props[key]!s}")
    if node.endpoint_id:
        ep = eps.get(node.endpoint_id)
        bits.append(
            f"data: {ep.method} {ep.path}" if ep else f"{U} missing endpoint {node.endpoint_id}"
        )
    if node.entity_id:
        ent = ents.get(node.entity_id)
        bits.append(f"entity: {ent.name}" if ent else f"{U} missing entity {node.entity_id}")
    if node.binding and node.binding.entity_id:
        ent = ents.get(node.binding.entity_id)
        bits.append(f"stores → {ent.name if ent else '?'}.{node.binding.entity_field}")
    inter = node.interaction
    if inter and inter.action != "none":
        marker = "implemented in prototype" if inter.implemented else "visual-only in prototype"
        if inter.action == "navigate":
            target = pages.get(inter.target_page_id or "")
            what = f"navigate to {target.route}" if target else f"{U} navigate to missing page"
        elif inter.action == "call_api":
            ep = eps.get(inter.endpoint_id or "")
            what = f"call {ep.method} {ep.path}" if ep else f"{U} call missing endpoint"
        else:
            what = inter.action.replace("_", " ")
        bits.append(f"on {inter.trigger}: {what} ({marker})")
    rules = []
    for bp in ("sm", "md"):
        r = getattr(node.responsive, bp)
        if r:
            parts = [f"{k}={v}" for k, v in r.model_dump(exclude_none=True).items()]
            rules.append(f"{bp}: {', '.join(parts)}")
    if rules:
        bits.append(f"responsive [{'; '.join(rules)}]")
    return "  " * depth + "- " + " · ".join(bits)


def pages_section(doc: ArchitectureDocument, only_page: str | None = None) -> list[str]:
    design = doc.design
    if not design.pages:
        return ["## Pages and navigation", f"{U} No pages saved yet."]
    pages = {p.id: p for p in design.pages}
    roles = {a.id: a.name for a in doc.actors}
    out = ["## Pages and navigation", "### Route map"]
    for p in sorted(design.pages, key=lambda p: p.route):
        parent = pages.get(p.parent_id or "")
        access = (
            "public"
            if not p.requires_auth
            else "roles: " + ", ".join(roles.get(r, r) for r in p.roles)
            if p.roles
            else f"signed-in users {U} roles not specified"
        )
        out.append(
            f"- `{p.route}` — {p.name}"
            + (f" (under {parent.route})" if parent else "")
            + f" — {access}"
        )
    selected = [pages[only_page]] if only_page and only_page in pages else design.pages
    for p in selected:
        out.append(f"### Page: {p.name} (`{p.route}`)")
        if p.description:
            out.append(p.description)
        out += [_describe(n, d, pages, doc) for n, d in walk(p.layout)]
        if p.states:
            out.append("States: " + "; ".join(f"{s.kind} → “{s.message}”" for s in p.states))
        else:
            out.append(f"{U} No loading/empty/error states defined for this page.")
    if design.journeys:
        out.append("### UI journeys")
        for j in design.journeys:
            steps = " → ".join(
                f"{pages[s.page_id].route} ({s.action})"
                if s.page_id in pages
                else f"{U} missing page"
                for s in j.steps
            )
            out.append(
                f"- {C} {j.name}"
                + (f" [{roles.get(j.role_id, j.role_id)}]" if j.role_id else "")
                + f": {steps}"
            )
    out.append(
        f"{C} Interactions marked “visual-only in prototype” are intent, not behavior "
        "verified in ArchitectFlow; implement and test them."
    )
    return out

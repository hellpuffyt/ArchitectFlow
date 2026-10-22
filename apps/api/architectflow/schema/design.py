"""UI/UX design model: themes (design tokens), pages with typed layout trees, UI journeys.

Stored inside the same versioned project document as the architecture, so design and
architecture share revisions, undo, history, restore and prompt staleness.
Cross-references from the UI to API endpoints, entities and other pages are *soft*:
they may dangle after an architecture change (never silently deleted) and are
reported by validation instead of blocking the save.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Id = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$")]
ShortText = Annotated[str, StringConstraints(max_length=200)]
LongText = Annotated[str, StringConstraints(max_length=4000)]
Hex = Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")]
Font = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9 ,'\"-]{1,120}$")]
PropValue = str | int | float | bool

MAX_LAYOUT_DEPTH = 12


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)


class Palette(_Model):
    primary: Hex = "#3f5bf0"
    on_primary: Hex = "#ffffff"
    secondary: Hex = "#64748b"
    accent: Hex = "#14b8a6"
    background: Hex = "#ffffff"
    surface: Hex = "#f6f7f9"
    text: Hex = "#111827"
    muted_text: Hex = "#4b5563"
    border: Hex = "#d9dde5"
    success: Hex = "#15803d"
    warning: Hex = "#b45309"
    danger: Hex = "#b91c1c"
    info: Hex = "#1d4ed8"


def _dark() -> Palette:
    return Palette(
        primary="#6b84ff",
        on_primary="#0b1020",
        secondary="#94a3b8",
        accent="#2dd4bf",
        background="#0d1117",
        surface="#161b22",
        text="#e6edf3",
        muted_text="#9aa4b2",
        border="#2b3240",
        success="#3fb950",
        warning="#d29922",
        danger="#f85149",
        info="#58a6ff",
    )


class Typography(_Model):
    heading_font: Font = "Inter, system-ui, sans-serif"
    body_font: Font = "Inter, system-ui, sans-serif"
    mono_font: Font = "ui-monospace, Menlo, monospace"
    base_size: int = Field(default=15, ge=12, le=22)
    scale_ratio: float = Field(default=1.25, ge=1.05, le=1.62)
    heading_weight: int = Field(default=650, ge=300, le=900)
    body_weight: int = Field(default=400, ge=300, le=700)
    line_height: float = Field(default=1.55, ge=1.1, le=2.2)


class Spacing(_Model):
    unit: int = Field(default=4, ge=2, le=12)
    density: Literal["compact", "comfortable", "spacious"] = "comfortable"


class Radii(_Model):
    sm: int = Field(default=4, ge=0, le=40)
    md: int = Field(default=8, ge=0, le=40)
    lg: int = Field(default=14, ge=0, le=48)


class Elevation(_Model):
    shadow: Literal["none", "subtle", "medium", "strong"] = "subtle"
    border_width: int = Field(default=1, ge=0, le=4)


class ComponentStyles(_Model):
    button: Literal["solid", "outline", "soft"] = "solid"
    button_radius: Literal["sm", "md", "lg", "full"] = "md"
    input: Literal["outline", "filled", "underline"] = "outline"
    card: Literal["elevated", "outlined", "flat"] = "outlined"
    navigation: Literal["sidebar", "topbar"] = "sidebar"
    icon_stroke: float = Field(default=1.75, ge=1, le=3)
    table_density: Literal["compact", "comfortable"] = "comfortable"


class Breakpoints(_Model):
    """Widths (px) below which the ``sm``/``md`` responsive rules apply."""

    sm: int = Field(default=640, ge=320, le=1200)
    md: int = Field(default=1024, ge=480, le=1600)


class LayoutTokens(_Model):
    max_width: int = Field(default=1200, ge=480, le=2400)
    grid_columns: int = Field(default=12, ge=1, le=24)
    gutter: int = Field(default=16, ge=0, le=64)
    breakpoints: Breakpoints = Field(default_factory=Breakpoints)


class Motion(_Model):
    intensity: Literal["none", "subtle", "standard", "expressive"] = "subtle"
    duration_ms: int = Field(default=160, ge=0, le=1000)
    respect_reduced_motion: bool = True


class Theme(_Model):
    id: Id
    name: ShortText
    preset: ShortText = ""
    appearance: Literal["light", "dark", "system"] = "light"
    light: Palette = Field(default_factory=Palette)
    dark: Palette = Field(default_factory=_dark)
    typography: Typography = Field(default_factory=Typography)
    spacing: Spacing = Field(default_factory=Spacing)
    radii: Radii = Field(default_factory=Radii)
    elevation: Elevation = Field(default_factory=Elevation)
    components: ComponentStyles = Field(default_factory=ComponentStyles)
    layout: LayoutTokens = Field(default_factory=LayoutTokens)
    motion: Motion = Field(default_factory=Motion)


LayoutKind = Literal[
    "container",
    "stack",
    "grid",
    "nav",
    "tabs",
    "form",
    "card",
    "modal",
    "list",
    "heading",
    "text",
    "button",
    "input",
    "select",
    "checkbox",
    "table",
    "image",
    "icon",
    "chart",
    "stat",
    "alert",
    "badge",
    "divider",
    "empty_state",
]
CONTAINER_KINDS = frozenset(
    {"container", "stack", "grid", "nav", "tabs", "form", "card", "modal", "list"}
)


class ResponsiveRule(_Model):
    hidden: bool | None = None
    columns: int | None = Field(default=None, ge=1, le=12)
    direction: Literal["row", "column"] | None = None


class Responsive(_Model):
    sm: ResponsiveRule | None = None
    md: ResponsiveRule | None = None


class FieldBinding(_Model):
    """Where an input's value goes: an entity column (and the request field named ``name``)."""

    entity_id: Id | None = None
    entity_field: ShortText | None = None


class Interaction(_Model):
    trigger: Literal["click", "submit"] = "click"
    action: Literal["navigate", "call_api", "open_modal", "close_modal", "none"] = "none"
    target_page_id: Id | None = None
    endpoint_id: Id | None = None
    # True = the prototype performs this interaction; False = visual only (documented intent).
    implemented: bool = False


class LayoutNode(_Model):
    id: Id
    kind: LayoutKind
    props: dict[ShortText, PropValue] = Field(default_factory=dict, max_length=30)
    children: list[LayoutNode] = Field(default_factory=list, max_length=60)
    responsive: Responsive = Field(default_factory=Responsive)
    # Data shown by tables/lists/stats/charts, or submitted by forms.
    endpoint_id: Id | None = None
    entity_id: Id | None = None
    binding: FieldBinding | None = None
    interaction: Interaction | None = None


PageStateKind = Literal[
    "loading", "empty", "success", "error", "validation_error", "permission_denied"
]


class PageState(_Model):
    kind: PageStateKind
    message: ShortText = ""


class Page(_Model):
    id: Id
    name: ShortText
    route: Annotated[str, StringConstraints(pattern=r"^/[A-Za-z0-9_\-/{}:.\[\]]*$", max_length=200)]
    parent_id: Id | None = None
    description: LongText = ""
    requires_auth: bool = True
    roles: list[Id] = Field(default_factory=list, max_length=20)
    states: list[PageState] = Field(default_factory=list, max_length=6)
    layout: LayoutNode


class JourneyStep(_Model):
    page_id: Id
    action: ShortText = ""


class UiJourney(_Model):
    id: Id
    name: ShortText
    role_id: Id | None = None
    steps: list[JourneyStep] = Field(default_factory=list, max_length=30)


class DesignDocument(_Model):
    themes: list[Theme] = Field(default_factory=list, max_length=20)
    active_theme_id: Id | None = None
    pages: list[Page] = Field(default_factory=list, max_length=100)
    journeys: list[UiJourney] = Field(default_factory=list, max_length=50)


def walk(node: LayoutNode, depth: int = 0) -> list[tuple[LayoutNode, int]]:
    """Depth-first list of (node, depth) for a layout tree."""
    out = [(node, depth)]
    for child in node.children:
        out.extend(walk(child, depth + 1))
    return out


def walk_paths(root: LayoutNode, prefix: str) -> list[tuple[LayoutNode, int, str]]:
    """Depth-first ``(node, depth, path)`` for a layout tree (iterative)."""
    out: list[tuple[LayoutNode, int, str]] = []
    stack = [(root, 0, prefix)]
    while stack:
        node, depth, path = stack.pop()
        out.append((node, depth, path))
        stack.extend(
            (child, depth + 1, f"{path}.children.{i}")
            for i, child in reversed(list(enumerate(node.children)))
        )
    return out

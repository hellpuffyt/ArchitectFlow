"""Pydantic models for the versioned architecture document.

The document is stored whole in each immutable revision. Structural rules that a
model can express (types, lengths, enums, unknown fields) live here; graph-level
integrity (dangling edges, duplicate ids, unknown node types) is checked by
:mod:`architectflow.validation.integrity` so that both imported files and AI output
go through exactly the same gate before they touch saved state.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

CURRENT_SCHEMA_VERSION: Literal[1] = 1

MAX_NODES = 500
MAX_EDGES = 2000

Id = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$")]
ShortText = Annotated[str, StringConstraints(max_length=200)]
LongText = Annotated[str, StringConstraints(max_length=4000)]
PropValue = str | int | float | bool


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


RequirementCategory = Literal[
    "",
    "feature",
    "role",
    "business",
    "performance",
    "security",
    "availability",
    "retention",
    "deployment",
    "scalability",
    "durability",
    "accessibility",
    "compliance",
]


class Requirement(_Model):
    id: Id
    text: LongText
    priority: Literal["must", "should", "could"] = "must"
    category: RequirementCategory = ""
    # "assumption" = inferred, not stated by the user; the user must confirm it.
    status: Literal["confirmed", "assumption"] = "confirmed"


class Assumption(_Model):
    id: Id
    text: LongText
    confirmed: bool = False


class AcceptanceCriterion(_Model):
    id: Id
    text: LongText


class Requirements(_Model):
    functional: list[Requirement] = Field(default_factory=list, max_length=200)
    nonfunctional: list[Requirement] = Field(default_factory=list, max_length=200)
    acceptance_criteria: list[AcceptanceCriterion] = Field(default_factory=list, max_length=200)


class Actor(_Model):
    """A person or system role. ``is_role`` marks application roles used for access rules."""

    id: Id
    name: ShortText
    description: LongText = ""
    is_role: bool = True


class Workflow(_Model):
    id: Id
    name: ShortText
    actor_id: Id | None = None
    # Ordered node ids the workflow touches; used to derive sequence diagrams.
    steps: list[Id] = Field(default_factory=list, max_length=50)
    description: LongText = ""


class Constraint(_Model):
    """An explicit, machine-checkable project constraint."""

    id: Id
    text: LongText
    kind: Literal["requires_component", "forbids_technology", "note"] = "note"
    # For requires_component: a node type key. For forbids_technology: a technology name.
    value: ShortText = ""


class Decision(_Model):
    id: Id
    title: ShortText
    rationale: LongText = ""
    tradeoffs: LongText = ""
    status: Literal["proposed", "accepted", "superseded"] = "proposed"


class Position(_Model):
    x: float = 0.0
    y: float = 0.0


class Size(_Model):
    width: float = Field(default=180.0, ge=40, le=2000)
    height: float = Field(default=64.0, ge=24, le=2000)


class Node(_Model):
    id: Id
    type: ShortText
    label: ShortText
    description: LongText = ""
    technology: ShortText = ""
    position: Position = Field(default_factory=Position)
    size: Size | None = None
    group_id: Id | None = None
    # None = use the registry default for this node type.
    public: bool | None = None
    owner: ShortText = ""
    replicas: int = Field(default=1, ge=0, le=10_000)
    properties: dict[ShortText, PropValue] = Field(default_factory=dict, max_length=50)


class Edge(_Model):
    id: Id
    source: Id
    target: Id
    protocol: ShortText = "HTTPS"
    label: ShortText = ""
    direction: Literal["one_way", "two_way"] = "one_way"
    synchronous: bool = True
    # None = unknown; the validator recommends stating it.
    encrypted: bool | None = None
    data: ShortText = ""
    properties: dict[ShortText, PropValue] = Field(default_factory=dict, max_length=50)


class Group(_Model):
    id: Id
    label: ShortText
    kind: Literal["boundary", "deployment", "team"] = "boundary"
    node_ids: list[Id] = Field(default_factory=list, max_length=MAX_NODES)


FieldType = Literal[
    "uuid",
    "text",
    "varchar",
    "integer",
    "bigint",
    "numeric",
    "boolean",
    "date",
    "timestamp",
    "json",
    "bytes",
]


class ForeignKey(_Model):
    entity_id: Id
    field: ShortText
    on_delete: Literal["restrict", "cascade", "set_null"] = "restrict"


class EntityField(_Model):
    id: Id
    name: Annotated[str, StringConstraints(pattern=r"^[a-z_][a-z0-9_]{0,62}$")]
    type: FieldType = "text"
    primary_key: bool = False
    nullable: bool = True
    unique: bool = False
    foreign_key: ForeignKey | None = None
    description: ShortText = ""


class Index(_Model):
    fields: list[ShortText] = Field(min_length=1, max_length=8)
    unique: bool = False
    reason: ShortText = ""


class Entity(_Model):
    id: Id
    name: Annotated[str, StringConstraints(pattern=r"^[a-z_][a-z0-9_]{0,62}$")]
    label: ShortText = ""
    # The database node that stores this entity.
    node_id: Id | None = None
    fields: list[EntityField] = Field(default_factory=list, max_length=200)
    indexes: list[Index] = Field(default_factory=list, max_length=50)
    description: LongText = ""


class DatabaseDesign(_Model):
    entities: list[Entity] = Field(default_factory=list, max_length=300)


class ApiField(_Model):
    name: ShortText
    type: FieldType = "text"
    required: bool = True
    # Optional link to the entity field this value reads from / writes to.
    entity_id: Id | None = None
    entity_field: ShortText | None = None


class ApiError(_Model):
    status: int = Field(ge=400, le=599)
    description: ShortText


class Endpoint(_Model):
    id: Id
    method: Literal["GET", "POST", "PUT", "PATCH", "DELETE"]
    path: Annotated[str, StringConstraints(pattern=r"^/[A-Za-z0-9_\-/{}.:]*$", max_length=200)]
    summary: ShortText = ""
    # The service node that implements this endpoint.
    service_node_id: Id | None = None
    auth: Literal["public", "authenticated", "roles"] = "authenticated"
    roles: list[Id] = Field(default_factory=list, max_length=20)
    request_fields: list[ApiField] = Field(default_factory=list, max_length=100)
    response_entity_id: Id | None = None
    response_fields: list[ApiField] = Field(default_factory=list, max_length=100)
    response_is_list: bool = False
    paginated: bool = False
    filters: list[ShortText] = Field(default_factory=list, max_length=20)
    errors: list[ApiError] = Field(default_factory=list, max_length=20)


class ApiDesign(_Model):
    endpoints: list[Endpoint] = Field(default_factory=list, max_length=500)


class Viewport(_Model):
    x: float = 0.0
    y: float = 0.0
    zoom: float = Field(default=1.0, gt=0, le=10)


PromptMode = Literal[
    "complete_app",
    "frontend",
    "design_system",
    "page",
    "backend_api",
    "database",
    "architecture_docs",
    "testing_qa",
]
PromptPreset = Literal["claude_code", "openai_codex", "generic_agent"]
PromptSection = Literal[
    "overview",
    "requirements",
    "journeys",
    "components",
    "connections",
    "data",
    "api",
    "security",
    "deployment",
    "design",
    "pages",
    "testing",
    "decisions",
    "open_questions",
]
ALL_PROMPT_SECTIONS: tuple[PromptSection, ...] = (
    "overview",
    "requirements",
    "journeys",
    "components",
    "connections",
    "data",
    "api",
    "security",
    "deployment",
    "design",
    "pages",
    "testing",
    "decisions",
    "open_questions",
)


class PromptSettings(_Model):
    mode: PromptMode = "complete_app"
    preset: PromptPreset = "claude_code"
    sections: list[PromptSection] = Field(default_factory=lambda: list(ALL_PROMPT_SECTIONS))
    # For mode == "page": which page to focus on.
    page_id: Id | None = None


class ArchitectureDocument(_Model):
    """One complete, saved architecture design."""

    schema_version: Literal[1] = CURRENT_SCHEMA_VERSION
    vision: LongText = ""
    requirements: Requirements = Field(default_factory=Requirements)
    actors: list[Actor] = Field(default_factory=list, max_length=100)
    workflows: list[Workflow] = Field(default_factory=list, max_length=100)
    integrations: list[ShortText] = Field(default_factory=list, max_length=100)
    technology_preferences: list[ShortText] = Field(default_factory=list, max_length=100)
    constraints: list[Constraint] = Field(default_factory=list, max_length=100)
    assumptions: list[Assumption] = Field(default_factory=list, max_length=100)
    open_questions: list[LongText] = Field(default_factory=list, max_length=100)
    decisions: list[Decision] = Field(default_factory=list, max_length=100)
    nodes: list[Node] = Field(default_factory=list, max_length=MAX_NODES)
    edges: list[Edge] = Field(default_factory=list, max_length=MAX_EDGES)
    groups: list[Group] = Field(default_factory=list, max_length=100)
    viewport: Viewport = Field(default_factory=Viewport)
    database: DatabaseDesign = Field(default_factory=DatabaseDesign)
    api: ApiDesign = Field(default_factory=ApiDesign)
    prompt_settings: PromptSettings = Field(default_factory=PromptSettings)

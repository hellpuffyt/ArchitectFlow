"""Structured change sets.

Every AI result — initial generation or an edit — is expressed as a list of typed
operations against the current saved document. Operations are validated, applied
to a copy, and the result must pass :func:`parse_document` before the change set
can even be stored for review. Nothing here touches the database.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, ValidationError

from ..schema import (
    AcceptanceCriterion,
    Actor,
    ArchitectureDocument,
    Assumption,
    Constraint,
    Decision,
    Edge,
    Endpoint,
    Entity,
    Node,
    Page,
    Requirement,
    Theme,
    UiJourney,
    Workflow,
)
from ..schema.architecture import LongText, PropValue, ShortText
from ..validation import DocumentInvalid, parse_document
from .layout import place_new_nodes

MAX_OPERATIONS = 400
LARGE_CHANGE_MIN_REMOVALS = 3
LARGE_CHANGE_FRACTION = 0.4


class _Op(BaseModel):
    model_config = ConfigDict(extra="forbid")


class NodePatch(_Op):
    label: ShortText | None = None
    type: ShortText | None = None
    description: LongText | None = None
    technology: ShortText | None = None
    public: bool | None = None
    owner: ShortText | None = None
    replicas: int | None = Field(default=None, ge=0, le=10_000)
    properties: dict[ShortText, PropValue] | None = None


class EdgePatch(_Op):
    protocol: ShortText | None = None
    label: ShortText | None = None
    direction: Literal["one_way", "two_way"] | None = None
    synchronous: bool | None = None
    encrypted: bool | None = None
    data: ShortText | None = None
    properties: dict[ShortText, PropValue] | None = None


class AddNode(_Op):
    op: Literal["add_node"]
    node: Node


class UpdateNode(_Op):
    op: Literal["update_node"]
    id: str
    changes: NodePatch


class RemoveNode(_Op):
    op: Literal["remove_node"]
    id: str


class AddEdge(_Op):
    op: Literal["add_edge"]
    edge: Edge


class UpdateEdge(_Op):
    op: Literal["update_edge"]
    id: str
    changes: EdgePatch


class RemoveEdge(_Op):
    op: Literal["remove_edge"]
    id: str


class SetVision(_Op):
    op: Literal["set_vision"]
    vision: LongText


class AddRequirement(_Op):
    op: Literal["add_requirement"]
    kind: Literal["functional", "nonfunctional"]
    requirement: Requirement


class AddActor(_Op):
    op: Literal["add_actor"]
    actor: Actor


class AddWorkflow(_Op):
    op: Literal["add_workflow"]
    workflow: Workflow


class AddConstraint(_Op):
    op: Literal["add_constraint"]
    constraint: Constraint


class AddDecision(_Op):
    op: Literal["add_decision"]
    decision: Decision


class AddNote(_Op):
    op: Literal["add_open_question", "add_integration", "add_technology_preference"]
    text: LongText


class AddAssumption(_Op):
    op: Literal["add_assumption"]
    assumption: Assumption


class AddAcceptanceCriterion(_Op):
    op: Literal["add_acceptance_criterion"]
    criterion: AcceptanceCriterion


class PutEntity(_Op):
    """Add an entity, or replace the one with the same id."""

    op: Literal["put_entity"]
    entity: Entity


class RemoveEntity(_Op):
    op: Literal["remove_entity"]
    id: str


ClearableSection = Literal[
    "requirements",
    "actors",
    "workflows",
    "decisions",
    "assumptions",
    "open_questions",
    "integrations",
    "technology_preferences",
    "constraints",
    "database",
    "api",
]


class ClearSection(_Op):
    """Empty one section of the design (shown explicitly in the review)."""

    op: Literal["clear_section"]
    section: ClearableSection


class PutTheme(_Op):
    """Add a theme, or replace the one with the same id."""

    op: Literal["put_theme"]
    theme: Theme


class RemoveTheme(_Op):
    op: Literal["remove_theme"]
    id: str


class SetActiveTheme(_Op):
    op: Literal["set_active_theme"]
    id: str | None


class PutPage(_Op):
    """Add a page, or replace the one with the same id (including its layout tree)."""

    op: Literal["put_page"]
    page: Page


class RemovePage(_Op):
    op: Literal["remove_page"]
    id: str


class PutUiJourney(_Op):
    op: Literal["put_ui_journey"]
    journey: UiJourney


class RemoveUiJourney(_Op):
    op: Literal["remove_ui_journey"]
    id: str


class PutEndpoint(_Op):
    """Add an endpoint, or replace the one with the same id."""

    op: Literal["put_endpoint"]
    endpoint: Endpoint


class RemoveEndpoint(_Op):
    op: Literal["remove_endpoint"]
    id: str


Operation = Annotated[
    AddNode
    | UpdateNode
    | RemoveNode
    | AddEdge
    | UpdateEdge
    | RemoveEdge
    | SetVision
    | AddRequirement
    | AddActor
    | AddWorkflow
    | AddConstraint
    | AddDecision
    | AddNote
    | AddAssumption
    | AddAcceptanceCriterion
    | PutEntity
    | RemoveEntity
    | PutEndpoint
    | RemoveEndpoint
    | ClearSection
    | PutTheme
    | RemoveTheme
    | SetActiveTheme
    | PutPage
    | RemovePage
    | PutUiJourney
    | RemoveUiJourney,
    Field(discriminator="op"),
]
_OPS = TypeAdapter(list[Operation])


class ChangeSetInvalid(ValueError):
    """The proposed operations are malformed or cannot be applied."""

    def __init__(self, errors: list[dict[str, str]]) -> None:
        self.errors = errors
        super().__init__("; ".join(f"{e['path']}: {e['message']}" for e in errors[:5]))


def parse_operations(raw: Any) -> list[Operation]:
    """Validate untrusted operation JSON (e.g. model output)."""
    if not isinstance(raw, list):
        raise ChangeSetInvalid([{"path": "operations", "message": "must be a list"}])
    if len(raw) > MAX_OPERATIONS:
        raise ChangeSetInvalid(
            [{"path": "operations", "message": f"at most {MAX_OPERATIONS} operations allowed"}]
        )
    try:
        return _OPS.validate_python(raw)
    except ValidationError as exc:
        raise ChangeSetInvalid(
            [
                {"path": "operations." + ".".join(str(p) for p in e["loc"]), "message": e["msg"]}
                for e in exc.errors(include_url=False)
            ]
        ) from exc


def _index(items: list[Any], item_id: str, what: str, i: int) -> int:
    for pos, item in enumerate(items):
        if item.id == item_id:
            return pos
    raise ChangeSetInvalid([{"path": f"operations.{i}", "message": f"unknown {what} '{item_id}'"}])


def _put(items: list[Any], item: Any) -> None:
    pos = next((k for k, x in enumerate(items) if x.id == item.id), None)
    if pos is None:
        items.append(item)
    else:
        items[pos] = item


def apply_operations(doc: ArchitectureDocument, ops: list[Operation]) -> ArchitectureDocument:
    """Apply ``ops`` to a copy of ``doc`` and return the validated result."""
    new = doc.model_copy(deep=True)
    added_ids: list[str] = []
    for i, op in enumerate(ops):
        match op:
            case AddNode(node=node):
                if any(n.id == node.id for n in new.nodes):
                    raise ChangeSetInvalid(
                        [
                            {
                                "path": f"operations.{i}",
                                "message": f"node id '{node.id}' already exists",
                            }
                        ]
                    )
                new.nodes.append(node.model_copy(deep=True))
                added_ids.append(node.id)
            case UpdateNode(id=nid, changes=patch):
                pos = _index(new.nodes, nid, "node", i)
                data = new.nodes[pos].model_dump()
                data.update(patch.model_dump(exclude_none=True))
                new.nodes[pos] = Node.model_validate(data)
            case RemoveNode(id=nid):
                pos = _index(new.nodes, nid, "node", i)
                del new.nodes[pos]
                new.edges = [e for e in new.edges if nid not in (e.source, e.target)]
                for group in new.groups:
                    group.node_ids = [g for g in group.node_ids if g != nid]
                for wf in new.workflows:
                    wf.steps = [s for s in wf.steps if s != nid]
                # Keep the data/API design; only detach it (listed in the review summary).
                for ent in new.database.entities:
                    if ent.node_id == nid:
                        ent.node_id = None
                for ep in new.api.endpoints:
                    if ep.service_node_id == nid:
                        ep.service_node_id = None
            case AddEdge(edge=edge):
                if any(e.id == edge.id for e in new.edges):
                    raise ChangeSetInvalid(
                        [
                            {
                                "path": f"operations.{i}",
                                "message": f"edge id '{edge.id}' already exists",
                            }
                        ]
                    )
                new.edges.append(edge.model_copy(deep=True))
            case UpdateEdge(id=eid, changes=epatch):
                pos = _index(new.edges, eid, "edge", i)
                data = new.edges[pos].model_dump()
                data.update(epatch.model_dump(exclude_none=True))
                new.edges[pos] = Edge.model_validate(data)
            case RemoveEdge(id=eid):
                del new.edges[_index(new.edges, eid, "edge", i)]
            case SetVision(vision=vision):
                new.vision = vision
            case AddRequirement(kind=kind, requirement=req):
                target = getattr(new.requirements, kind)
                if any(r.id == req.id for r in target):
                    raise ChangeSetInvalid(
                        [{"path": f"operations.{i}", "message": f"requirement '{req.id}' exists"}]
                    )
                target.append(req)
            case AddActor(actor=actor):
                new.actors.append(actor)
            case AddWorkflow(workflow=wf):
                new.workflows.append(wf)
            case AddConstraint(constraint=constraint):
                new.constraints.append(constraint)
            case AddDecision(decision=decision):
                new.decisions.append(decision)
            case AddAssumption(assumption=assumption):
                if any(a.id == assumption.id for a in new.assumptions):
                    raise ChangeSetInvalid(
                        [
                            {
                                "path": f"operations.{i}",
                                "message": f"assumption '{assumption.id}' exists",
                            }
                        ]
                    )
                new.assumptions.append(assumption)
            case AddAcceptanceCriterion(criterion=criterion):
                new.requirements.acceptance_criteria.append(criterion)
            case PutEntity(entity=entity):
                ents = new.database.entities
                found = next((k for k, e in enumerate(ents) if e.id == entity.id), None)
                if found is None:
                    ents.append(entity)
                else:
                    ents[found] = entity
            case RemoveEntity(id=ent_id):
                del new.database.entities[_index(new.database.entities, ent_id, "entity", i)]
            case PutEndpoint(endpoint=endpoint):
                eps = new.api.endpoints
                found = next((k for k, e in enumerate(eps) if e.id == endpoint.id), None)
                if found is None:
                    eps.append(endpoint)
                else:
                    eps[found] = endpoint
            case RemoveEndpoint(id=ep_id):
                del new.api.endpoints[_index(new.api.endpoints, ep_id, "endpoint", i)]
            case PutTheme(theme=theme):
                _put(new.design.themes, theme)
            case RemoveTheme(id=tid):
                del new.design.themes[_index(new.design.themes, tid, "theme", i)]
                if new.design.active_theme_id == tid:
                    new.design.active_theme_id = (
                        new.design.themes[0].id if new.design.themes else None
                    )
            case SetActiveTheme(id=tid):
                if tid is not None:
                    _index(new.design.themes, tid, "theme", i)
                new.design.active_theme_id = tid
            case PutPage(page=page):
                _put(new.design.pages, page)
            case RemovePage(id=pid):
                del new.design.pages[_index(new.design.pages, pid, "page", i)]
                for other in new.design.pages:
                    if other.parent_id == pid:
                        other.parent_id = None
                for journey in new.design.journeys:
                    journey.steps = [st for st in journey.steps if st.page_id != pid]
            case PutUiJourney(journey=journey):
                _put(new.design.journeys, journey)
            case RemoveUiJourney(id=jid):
                del new.design.journeys[_index(new.design.journeys, jid, "journey", i)]
            case ClearSection(section=section):
                fresh = ArchitectureDocument()
                setattr(new, section, getattr(fresh, section))
            case AddNote(op=kind, text=text):
                {
                    "add_open_question": new.open_questions,
                    "add_integration": new.integrations,
                    "add_technology_preference": new.technology_preferences,
                }[kind].append(text)
    place_new_nodes(new, set(added_ids))
    try:
        return parse_document(new.model_dump(mode="json"))
    except DocumentInvalid as exc:
        raise ChangeSetInvalid(exc.errors) from exc


class ChangeSummary(BaseModel):
    """Human-reviewable description of a change set."""

    lines: list[str]
    added_nodes: int = 0
    removed_nodes: int = 0
    updated_nodes: int = 0
    added_edges: int = 0
    removed_edges: int = 0
    other: int = 0
    large: bool = False


def summarize(doc: ArchitectureDocument, ops: list[Operation]) -> ChangeSummary:
    """Describe ``ops`` relative to ``doc`` and flag destructive, large changes."""
    labels = {n.id: n.label for n in doc.nodes}
    s = ChangeSummary(lines=[])
    for op in ops:
        match op:
            case AddNode(node=n):
                s.added_nodes += 1
                labels[n.id] = n.label
                s.lines.append(
                    f"+ component {n.label} ({n.type}"
                    + (f", {n.technology}" if n.technology else "")
                    + ")"
                )
            case UpdateNode(id=nid, changes=p):
                s.updated_nodes += 1
                fields = ", ".join(f"{k}={v}" for k, v in p.model_dump(exclude_none=True).items())
                s.lines.append(f"~ component {labels.get(nid, nid)}: {fields}")
            case RemoveNode(id=nid):
                s.removed_nodes += 1
                s.lines.append(f"- component {labels.get(nid, nid)}")
                for ent in doc.database.entities:
                    if ent.node_id == nid:
                        s.lines.append(
                            f"  ! entity {ent.name} kept, no longer linked to a data store"
                        )
                for ep in doc.api.endpoints:
                    if ep.service_node_id == nid:
                        s.lines.append(
                            f"  ! endpoint {ep.method} {ep.path} kept, no longer "
                            "linked to a service"
                        )
            case AddEdge(edge=e):
                s.added_edges += 1
                s.lines.append(
                    f"+ connection {labels.get(e.source, e.source)} → "
                    f"{labels.get(e.target, e.target)} ({e.protocol})"
                )
            case UpdateEdge(id=eid, changes=ep):
                s.other += 1
                fields = ", ".join(f"{k}={v}" for k, v in ep.model_dump(exclude_none=True).items())
                s.lines.append(f"~ connection {eid}: {fields}")
            case RemoveEdge(id=eid):
                s.removed_edges += 1
                s.lines.append(f"- connection {eid}")
            case SetVision():
                s.other += 1
                s.lines.append("~ vision text")
            case AddRequirement(kind=k, requirement=r):
                s.other += 1
                s.lines.append(f"+ {k} requirement: {r.text}")
            case AddDecision(decision=d):
                s.other += 1
                s.lines.append(f"+ decision: {d.title}")
            case AddNote(op=k, text=t):
                s.other += 1
                s.lines.append(f"+ {k.removeprefix('add_').replace('_', ' ')}: {t}")
            case AddActor(actor=a):
                s.other += 1
                s.lines.append(f"+ actor: {a.name}")
            case AddWorkflow(workflow=w):
                s.other += 1
                s.lines.append(f"+ workflow: {w.name}")
            case AddConstraint(constraint=c):
                s.other += 1
                s.lines.append(f"+ constraint: {c.text}")
            case AddAssumption(assumption=a):
                s.other += 1
                s.lines.append(f"+ assumption (needs confirmation): {a.text}")
            case AddAcceptanceCriterion(criterion=ac):
                s.other += 1
                s.lines.append(f"+ acceptance criterion: {ac.text}")
            case PutEntity(entity=en):
                s.other += 1
                s.lines.append(f"+ entity {en.name} ({len(en.fields)} fields)")
            case RemoveEntity(id=en_id):
                s.other += 1
                s.lines.append(f"- entity {en_id}")
            case PutEndpoint(endpoint=ep):
                s.other += 1
                s.lines.append(f"+ endpoint {ep.method} {ep.path}")
            case RemoveEndpoint(id=ep_id):
                s.other += 1
                s.lines.append(f"- endpoint {ep_id}")
            case ClearSection(section=section):
                s.other += 1
                s.lines.append(f"- clear all {section.replace('_', ' ')}")
            case PutTheme(theme=theme):
                s.other += 1
                s.lines.extend(_theme_diff(doc, theme))
            case RemoveTheme(id=tid):
                s.other += 1
                s.lines.append(f"- theme {tid}")
            case SetActiveTheme(id=tid):
                s.other += 1
                s.lines.append(f"~ active theme → {tid}")
            case PutPage(page=page):
                s.other += 1
                prior_page = next((p for p in doc.design.pages if p.id == page.id), None)
                verb = "~ page" if prior_page else "+ page"
                count = _count_layout(page.layout)
                s.lines.append(f"{verb} {page.name} ({page.route}), {count} layout elements")
            case RemovePage(id=pid):
                s.other += 1
                s.lines.append(f"- page {pid} (journey steps to it are removed)")
            case PutUiJourney(journey=journey):
                s.other += 1
                s.lines.append(f"+ UI journey {journey.name} ({len(journey.steps)} steps)")
            case RemoveUiJourney(id=jid):
                s.other += 1
                s.lines.append(f"- UI journey {jid}")
    existing = len(doc.nodes)
    s.large = (
        s.removed_nodes >= LARGE_CHANGE_MIN_REMOVALS
        and existing > 0
        and s.removed_nodes / existing >= LARGE_CHANGE_FRACTION
    )
    return s


def _count_layout(node: Any) -> int:
    return 1 + sum(_count_layout(c) for c in node.children)


def _flatten(prefix: str, value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for k, v in value.items():
            out.update(_flatten(f"{prefix}.{k}" if prefix else k, v))
        return out
    return {prefix: value}


def _theme_diff(doc: ArchitectureDocument, theme: Theme) -> list[str]:
    old = next((t for t in doc.design.themes if t.id == theme.id), None)
    if old is None:
        return [f"+ theme {theme.name} (preset {theme.preset or 'custom'})"]
    before = _flatten("", old.model_dump())
    after = _flatten("", theme.model_dump())
    changed = [k for k in after if before.get(k) != after[k]]
    lines = [f"~ theme {theme.name}: {len(changed)} token(s) changed"]
    lines += [f"  ~ {k}: {before.get(k)} → {after[k]}" for k in changed[:25]]
    if len(changed) > 25:
        lines.append(f"  … {len(changed) - 25} more")
    return lines

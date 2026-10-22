"""Graph integrity: the gate every document passes before it is saved.

Applies to manual saves, JSON imports, AI change sets and restores alike.
"""

from __future__ import annotations

import re
from collections import Counter
from typing import Any

from pydantic import ValidationError

from ..schema import (
    CONTAINER_KINDS,
    ArchitectureDocument,
    SchemaMigrationError,
    migrate_document,
    node_type,
)
from ..schema.design import MAX_LAYOUT_DEPTH, walk_paths
from .findings import Finding, make_finding
from .untrusted import scan_untrusted


class DocumentInvalid(ValueError):
    """Raised when a document fails schema or integrity validation."""

    def __init__(self, errors: list[dict[str, str]]) -> None:
        self.errors = errors
        summary = "; ".join(f"{e['path']}: {e['message']}" for e in errors[:5])
        super().__init__(f"invalid architecture document: {summary}")


def _schema_errors(exc: ValidationError) -> list[dict[str, str]]:
    out = []
    for err in exc.errors(include_url=False):
        path = ".".join(str(p) for p in err["loc"]) or "(document)"
        out.append({"path": path, "message": str(err["msg"])})
    return out


def _duplicates(paths_and_ids: list[tuple[str, str]]) -> list[tuple[str, str, int]]:
    """``(id, path of the first repeat, count)`` for every id used more than once."""
    counts = Counter(i for _, i in paths_and_ids)
    first_repeat: dict[str, str] = {}
    seen: set[str] = set()
    for path, ident in paths_and_ids:
        if ident in seen:
            first_repeat.setdefault(ident, path)
        seen.add(ident)
    return [(i, first_repeat[i], counts[i]) for i in first_repeat]


def check_integrity(doc: ArchitectureDocument) -> list[Finding]:
    """Return definite structural defects (``kind=schema_error``) in ``doc``.

    Every finding carries ``path``: the dotted location of the offending field.
    """
    findings: list[Finding] = []
    node_ids = [n.id for n in doc.nodes]
    edge_ids = [e.id for e in doc.edges]

    for dup, path, count in _duplicates([(f"nodes.{i}.id", n) for i, n in enumerate(node_ids)]):
        findings.append(
            make_finding(
                "duplicate-node-id",
                "error",
                "schema_error",
                "Duplicate node id",
                "Node ids must be unique so edges and history can reference them.",
                f"id '{dup}' is used by {count} nodes",
                "Give each node a distinct id.",
                node_ids=[dup],
                path=path,
            )
        )
    for dup, path, count in _duplicates([(f"edges.{i}.id", e) for i, e in enumerate(edge_ids)]):
        findings.append(
            make_finding(
                "duplicate-edge-id",
                "error",
                "schema_error",
                "Duplicate edge id",
                "Edge ids must be unique.",
                f"id '{dup}' is used by {count} edges",
                "Give each edge a distinct id.",
                edge_ids=[dup],
                path=path,
            )
        )
    findings.extend(_duplicate_ids(doc))
    group_ids = [g.id for g in doc.groups]
    clash = set(group_ids) & set(node_ids)
    for gi, group in enumerate(doc.groups):
        if group.id not in clash:
            continue
        clash.discard(group.id)
        findings.append(
            make_finding(
                "group-id-clash",
                "error",
                "schema_error",
                "Group id collides with a node id",
                "Groups and nodes share one id space on the canvas.",
                f"'{group.id}' is both a group and a node",
                "Rename the group.",
                node_ids=[group.id],
                path=f"groups.{gi}.id",
            )
        )

    known = set(node_ids)
    for ni, node in enumerate(doc.nodes):
        if node_type(node.type) is None:
            findings.append(
                make_finding(
                    "unknown-node-type",
                    "error",
                    "schema_error",
                    "Unknown component type",
                    "Every node type must exist in the node registry so validation and exports "
                    "know how to treat it.",
                    f"node '{node.id}' has type '{node.type}'",
                    "Choose a registered type (see docs/NODE_REGISTRY.md) or register a new one.",
                    node_ids=[node.id],
                    path=f"nodes.{ni}.type",
                )
            )
        if node.group_id is not None and node.group_id not in set(group_ids):
            findings.append(
                make_finding(
                    "unknown-group",
                    "error",
                    "schema_error",
                    "Node references a missing group",
                    "group_id must point at an existing group.",
                    f"node '{node.id}' has group_id '{node.group_id}'",
                    "Remove group_id or create the group.",
                    node_ids=[node.id],
                    path=f"nodes.{ni}.group_id",
                )
            )
    findings.extend(_group_membership(doc))

    for ei, edge in enumerate(doc.edges):
        missing = [end for end in (edge.source, edge.target) if end not in known]
        if missing:
            end = "source" if edge.source not in known else "target"
            findings.append(
                make_finding(
                    "broken-edge-reference",
                    "error",
                    "schema_error",
                    "Connection points at nothing",
                    "An edge's source and target must both be existing nodes.",
                    f"edge '{edge.id}' references missing node(s): {', '.join(missing)}",
                    "Delete the edge or reconnect it to existing components.",
                    edge_ids=[edge.id],
                    path=f"edges.{ei}.{end}",
                )
            )
        elif edge.source == edge.target:
            findings.append(
                make_finding(
                    "self-loop",
                    "error",
                    "schema_error",
                    "Component connected to itself",
                    "Self-referencing edges carry no architectural meaning here.",
                    f"edge '{edge.id}' starts and ends at '{edge.source}'",
                    "Remove the edge.",
                    node_ids=[edge.source],
                    edge_ids=[edge.id],
                    path=f"edges.{ei}",
                )
            )

    for gi, group in enumerate(doc.groups):
        missing = [nid for nid in group.node_ids if nid not in known]
        if missing:
            first = group.node_ids.index(missing[0])
            findings.append(
                make_finding(
                    "group-missing-member",
                    "error",
                    "schema_error",
                    "Group lists missing nodes",
                    "Group membership must reference existing nodes.",
                    f"group '{group.id}' lists: {', '.join(missing)}",
                    "Remove the missing ids from the group.",
                    node_ids=missing,
                    path=f"groups.{gi}.node_ids.{first}",
                )
            )

    for wi, workflow in enumerate(doc.workflows):
        missing = [nid for nid in workflow.steps if nid not in known]
        if missing:
            first = workflow.steps.index(missing[0])
            findings.append(
                make_finding(
                    "workflow-missing-step",
                    "error",
                    "schema_error",
                    "Workflow step references a missing node",
                    "Workflow steps are node ids used to derive sequence diagrams.",
                    f"workflow '{workflow.id}' references: {', '.join(missing)}",
                    "Update the workflow steps.",
                    node_ids=missing,
                    path=f"workflows.{wi}.steps.{first}",
                )
            )
    actor_ids = {a.id for a in doc.actors}
    for wi, workflow in enumerate(doc.workflows):
        if workflow.actor_id is not None and workflow.actor_id not in actor_ids:
            findings.append(
                make_finding(
                    "workflow-missing-actor",
                    "error",
                    "schema_error",
                    "Workflow references a missing actor",
                    "actor_id must name an existing actor.",
                    f"workflow '{workflow.id}' has actor_id '{workflow.actor_id}'",
                    "Create the actor or clear actor_id.",
                    path=f"workflows.{wi}.actor_id",
                )
            )
    findings.extend(_check_database_and_api(doc, known, actor_ids))
    findings.extend(_check_design(doc))
    return findings


_ID_COLLECTIONS: tuple[tuple[str, str, str], ...] = (
    # (rule, document path of the list, what the ids name)
    ("duplicate-group-id", "groups", "group"),
    ("duplicate-actor-id", "actors", "actor/role"),
    ("duplicate-workflow-id", "workflows", "workflow"),
    ("duplicate-constraint-id", "constraints", "constraint"),
    ("duplicate-assumption-id", "assumptions", "assumption"),
    ("duplicate-decision-id", "decisions", "decision"),
)


def _duplicate_ids(doc: ArchitectureDocument) -> list[Finding]:
    """Ids other parts of the document (or the prompt) refer to must be unique."""
    findings: list[Finding] = []

    def report(rule: str, what: str, items: list[tuple[str, str]]) -> None:
        for dup, path, count in _duplicates(items):
            findings.append(
                make_finding(
                    rule,
                    "error",
                    "schema_error",
                    f"Duplicate {what} id",
                    f"{what.capitalize()} ids must be unique so references to them are "
                    "unambiguous.",
                    f"id '{dup}' is used by {count} {what}s",
                    "Give each one a distinct id.",
                    path=path,
                )
            )

    for rule, attr, what in _ID_COLLECTIONS:
        items = getattr(doc, attr)
        report(rule, what, [(f"{attr}.{i}.id", x.id) for i, x in enumerate(items)])
    reqs = [
        (f"requirements.{kind}.{i}.id", r.id)
        for kind in ("functional", "nonfunctional")
        for i, r in enumerate(getattr(doc.requirements, kind))
    ]
    report("duplicate-requirement-id", "requirement", reqs)
    report(
        "duplicate-acceptance-criterion-id",
        "acceptance criterion",
        [
            (f"requirements.acceptance_criteria.{i}.id", c.id)
            for i, c in enumerate(doc.requirements.acceptance_criteria)
        ],
    )
    for ei, entity in enumerate(doc.database.entities):
        report(
            "duplicate-field-id",
            "field",
            [
                (f"database.entities.{ei}.fields.{fi}.id", f.id)
                for fi, f in enumerate(entity.fields)
            ],
        )
    return findings


def _group_membership(doc: ArchitectureDocument) -> list[Finding]:
    """A node belongs to at most one group, and ``group_id`` agrees with the group's list."""
    findings: list[Finding] = []
    nodes = {n.id: (i, n) for i, n in enumerate(doc.nodes)}
    listed_in: dict[str, str] = {}
    for gi, group in enumerate(doc.groups):
        for mi, member in enumerate(group.node_ids):
            if member not in nodes:
                continue  # reported as group-missing-member
            if member in listed_in:
                findings.append(
                    make_finding(
                        "node-in-several-groups",
                        "error",
                        "schema_error",
                        "Component listed in more than one group",
                        "A component belongs to at most one group; diagrams and the canvas "
                        "would otherwise disagree about where it lives.",
                        f"node '{member}' is listed by group '{listed_in[member]}' and "
                        f"group '{group.id}'",
                        "Remove it from all but one group.",
                        node_ids=[member],
                        path=f"groups.{gi}.node_ids.{mi}",
                    )
                )
                continue
            listed_in[member] = group.id
    group_ids = {g.id for g in doc.groups}
    for nid, (ni, node) in nodes.items():
        listed = listed_in.get(nid)
        declared = node.group_id if node.group_id in group_ids else None
        if node.group_id is not None and declared is None:
            continue  # reported as unknown-group
        if listed != declared:
            findings.append(
                make_finding(
                    "group-membership-mismatch",
                    "error",
                    "schema_error",
                    "Component and group disagree about membership",
                    "A node's group_id must name the group whose node_ids lists it (and vice "
                    "versa).",
                    f"node '{nid}' has group_id {declared!r} but is listed by group {listed!r}",
                    "Set group_id to the group that lists the node, or fix the group's list.",
                    node_ids=[nid],
                    path=f"nodes.{ni}.group_id",
                )
            )
    return findings


def _check_design(doc: ArchitectureDocument) -> list[Finding]:
    """Structural design defects. Links to APIs/entities/pages are soft (see rules)."""
    findings: list[Finding] = []
    design = doc.design

    def err(rule: str, title: str, evidence: str, fix: str, path: str) -> None:
        findings.append(
            make_finding(
                rule,
                "error",
                "schema_error",
                title,
                "The design document is structurally invalid.",
                evidence,
                fix,
                path=path,
            )
        )

    theme_ids = [t.id for t in design.themes]
    for dup, path, count in _duplicates(
        [(f"design.themes.{i}.id", t) for i, t in enumerate(theme_ids)]
    ):
        err("duplicate-theme-id", "Duplicate theme id", f"'{dup}' x{count}", "Rename one.", path)
    if design.active_theme_id is not None and design.active_theme_id not in theme_ids:
        err(
            "missing-active-theme",
            "Active theme does not exist",
            f"active_theme_id '{design.active_theme_id}'",
            "Pick an existing theme.",
            "design.active_theme_id",
        )
    page_ids = [p.id for p in design.pages]
    for dup, path, count in _duplicates(
        [(f"design.pages.{i}.id", p) for i, p in enumerate(page_ids)]
    ):
        err("duplicate-page-id", "Duplicate page id", f"'{dup}' x{count}", "Rename one.", path)
    pages = {p.id: p for p in design.pages}
    for pi, page in enumerate(design.pages):
        if page.parent_id is not None:
            seen = {page.id}
            parent: str | None = page.parent_id
            while parent is not None:
                if parent not in pages:
                    err(
                        "missing-parent-page",
                        "Parent page does not exist",
                        f"page '{page.id}' parent '{parent}'",
                        "Pick an existing parent page.",
                        f"design.pages.{pi}.parent_id",
                    )
                    break
                if parent in seen:
                    err(
                        "page-hierarchy-cycle",
                        "Page hierarchy has a cycle",
                        f"page '{page.id}'",
                        "Break the parent chain.",
                        f"design.pages.{pi}.parent_id",
                    )
                    break
                seen.add(parent)
                parent = pages[parent].parent_id
    layout_ids: list[tuple[str, str]] = []
    for pi, page in enumerate(design.pages):
        for node, depth, path in walk_paths(page.layout, f"design.pages.{pi}.layout"):
            layout_ids.append((path, node.id))
            if depth > MAX_LAYOUT_DEPTH:
                err(
                    "layout-too-deep",
                    "Layout nesting too deep",
                    f"page '{page.id}' node '{node.id}' at depth {depth}",
                    f"Keep nesting at or below {MAX_LAYOUT_DEPTH} levels.",
                    path,
                )
            if node.children and node.kind not in CONTAINER_KINDS:
                err(
                    "children-on-leaf",
                    "Component cannot contain children",
                    f"page '{page.id}' node '{node.id}' ({node.kind})",
                    "Move the children into a container, stack, grid, form or card.",
                    f"{path}.children",
                )
    for dup, path, count in _duplicates(layout_ids):
        err(
            "duplicate-layout-id",
            "Duplicate layout element id",
            f"'{dup}' x{count}",
            "Layout element ids must be unique across all pages.",
            f"{path}.id",
        )
    for ji, journey in enumerate(design.journeys):
        for si, step in enumerate(journey.steps):
            if step.page_id not in pages:
                findings.append(
                    make_finding(
                        "journey-missing-page",
                        "error",
                        "schema_error",
                        "Journey step references a missing page",
                        "Journey steps must reference existing pages.",
                        f"journey '{journey.id}' → '{step.page_id}'",
                        "Remove the step or restore the page.",
                        path=f"design.journeys.{ji}.steps.{si}.page_id",
                    )
                )
    return findings


_DATASTORE_TYPES = {"database", "search_index", "cache", "object_storage"}


def _check_database_and_api(
    doc: ArchitectureDocument, node_ids: set[str], actor_ids: set[str]
) -> list[Finding]:
    findings: list[Finding] = []
    nodes = {n.id: n for n in doc.nodes}
    entities = {e.id: e for e in doc.database.entities}

    def err(
        rule: str,
        title: str,
        explanation: str,
        evidence: str,
        fix: str,
        path: str,
        node_list: list[str] | None = None,
    ) -> None:
        findings.append(
            make_finding(
                rule,
                "error",
                "schema_error",
                title,
                explanation,
                evidence,
                fix,
                node_ids=node_list,
                path=path,
            )
        )

    ents = doc.database.entities
    for dup, path, count in _duplicates(
        [(f"database.entities.{i}.id", e.id) for i, e in enumerate(ents)]
    ):
        err(
            "duplicate-entity-id",
            "Duplicate entity id",
            "Entity ids must be unique.",
            f"'{dup}' used {count} times",
            "Rename one of the entities.",
            path,
        )
    for dup, path, count in _duplicates(
        [(f"database.entities.{i}.name", e.name) for i, e in enumerate(ents)]
    ):
        err(
            "duplicate-entity-name",
            "Duplicate table name",
            "Two entities would create the same table.",
            f"'{dup}' used {count} times",
            "Rename one of the entities.",
            path,
        )
    for ei, entity in enumerate(ents):
        at = f"database.entities.{ei}"
        if entity.node_id is not None:
            node = nodes.get(entity.node_id)
            if node is None:
                err(
                    "entity-missing-node",
                    "Entity stored in a missing component",
                    "An entity's node_id must point at a data store on the canvas.",
                    f"entity '{entity.name}' → node '{entity.node_id}'",
                    "Pick an existing database node or clear node_id.",
                    f"{at}.node_id",
                )
            elif node.type not in _DATASTORE_TYPES:
                err(
                    "entity-node-not-datastore",
                    "Entity stored in a non-data component",
                    "Entities can only live in database, search, cache or storage nodes.",
                    f"entity '{entity.name}' → {node.label} ({node.type})",
                    "Move the entity to a data store.",
                    f"{at}.node_id",
                    [node.id],
                )
        for name, path, count in _duplicates(
            [(f"{at}.fields.{fi}.name", f.name) for fi, f in enumerate(entity.fields)]
        ):
            err(
                "duplicate-field",
                "Duplicate column",
                "Field names must be unique per entity.",
                f"{entity.name}.{name} appears {count} times",
                "Rename or remove the duplicate.",
                path,
            )
        field_names = {f.name for f in entity.fields}
        for ii, index in enumerate(entity.indexes):
            missing = [f for f in index.fields if f not in field_names]
            if missing:
                err(
                    "index-missing-field",
                    "Index on a missing column",
                    "Indexes must reference columns of the same entity.",
                    f"{entity.name} index on {', '.join(missing)}",
                    "Fix the index columns.",
                    f"{at}.indexes.{ii}.fields.{index.fields.index(missing[0])}",
                )
        for fi, fld in enumerate(entity.fields):
            fk = fld.foreign_key
            if fk is None:
                continue
            target = entities.get(fk.entity_id)
            if target is None:
                err(
                    "fk-missing-entity",
                    "Foreign key to a missing entity",
                    "Foreign keys must reference an existing entity.",
                    f"{entity.name}.{fld.name} → {fk.entity_id}.{fk.field}",
                    "Point the foreign key at an existing entity or remove it.",
                    f"{at}.fields.{fi}.foreign_key.entity_id",
                )
            elif fk.field not in {f.name for f in target.fields}:
                err(
                    "fk-missing-field",
                    "Foreign key to a missing column",
                    "The referenced column does not exist.",
                    f"{entity.name}.{fld.name} → {target.name}.{fk.field}",
                    "Reference an existing column (usually the primary key).",
                    f"{at}.fields.{fi}.foreign_key.field",
                )

    eps = doc.api.endpoints
    # Path parameters match any value, so /items/{id} and /items/{item_id} are one route.
    routes = [
        (f"api.endpoints.{i}.path", f"{e.method} {_route_shape(e.path)}") for i, e in enumerate(eps)
    ]
    for route, path, count in _duplicates(routes):
        err(
            "duplicate-endpoint",
            "Duplicate endpoint",
            "Two endpoints share the same method and path (path parameter names do not "
            "distinguish routes).",
            f"{route} x{count}",
            "Remove or change one of them.",
            path,
        )
    for dup, path, count in _duplicates(
        [(f"api.endpoints.{i}.id", e.id) for i, e in enumerate(eps)]
    ):
        err(
            "duplicate-endpoint-id",
            "Duplicate endpoint id",
            "Endpoint ids must be unique.",
            f"'{dup}' used {count} times",
            "Rename one of them.",
            path,
        )
    for xi, ep in enumerate(eps):
        at = f"api.endpoints.{xi}"
        label = f"{ep.method} {ep.path}"
        if ep.service_node_id is not None:
            node = nodes.get(ep.service_node_id)
            if node is None:
                err(
                    "endpoint-missing-service",
                    "Endpoint implemented by a missing component",
                    "service_node_id must reference a component on the canvas.",
                    f"{label} → '{ep.service_node_id}'",
                    "Pick an existing service.",
                    f"{at}.service_node_id",
                )
            elif node.type not in {"service", "api_gateway", "auth_service", "worker"}:
                err(
                    "endpoint-service-type",
                    "Endpoint implemented by a non-service component",
                    "Only services, gateways and auth services can implement endpoints.",
                    f"{label} → {node.label} ({node.type})",
                    "Assign a service.",
                    f"{at}.service_node_id",
                    [node.id],
                )
        if ep.response_entity_id is not None and ep.response_entity_id not in entities:
            err(
                "endpoint-missing-entity",
                "Endpoint returns a missing entity",
                "response_entity_id must reference an entity in the database design.",
                f"{label} → '{ep.response_entity_id}'",
                "Pick an existing entity.",
                f"{at}.response_entity_id",
            )
        for ri, role in enumerate(ep.roles):
            if role not in actor_ids:
                err(
                    "endpoint-missing-role",
                    "Endpoint requires an undefined role",
                    "Role ids must be defined as actors with is_role=true.",
                    f"{label} requires '{role}'",
                    "Define the role or remove it.",
                    f"{at}.roles.{ri}",
                )
        mapped = [(f"{at}.request_fields.{k}", f) for k, f in enumerate(ep.request_fields)]
        mapped += [(f"{at}.response_fields.{k}", f) for k, f in enumerate(ep.response_fields)]
        for fpath, af in mapped:
            if af.entity_id is None:
                continue
            target = entities.get(af.entity_id)
            if target is None:
                err(
                    "api-field-missing-entity",
                    "API field mapped to a missing entity",
                    "Field mappings must point at existing entities.",
                    f"{label} field '{af.name}' → '{af.entity_id}'",
                    "Fix the mapping.",
                    f"{fpath}.entity_id",
                )
            elif af.entity_field and af.entity_field not in {f.name for f in target.fields}:
                err(
                    "api-field-missing-column",
                    "API field mapped to a missing column",
                    "Field mappings must point at existing columns.",
                    f"{label} field '{af.name}' → {target.name}.{af.entity_field}",
                    "Fix the mapping.",
                    f"{fpath}.entity_field",
                )
    return findings


def _route_shape(path: str) -> str:
    return re.sub(r"{[^}]*}", "{}", path)


def parse_document(raw: Any) -> ArchitectureDocument:
    """Migrate, schema-validate and integrity-check ``raw``.

    Raises :class:`DocumentInvalid` with a list of ``{path, message}`` errors that a
    UI can show next to the offending field.
    """
    unsafe = scan_untrusted(raw)
    if unsafe:
        raise DocumentInvalid(unsafe)
    try:
        migrated = migrate_document(raw)
    except SchemaMigrationError as exc:
        raise DocumentInvalid([{"path": "schema_version", "message": str(exc)}]) from exc
    try:
        doc = ArchitectureDocument.model_validate(migrated)
    except ValidationError as exc:
        raise DocumentInvalid(_schema_errors(exc)) from exc
    defects = check_integrity(doc)
    if defects:
        raise DocumentInvalid(
            [
                {"path": f.path or f.rule, "rule": f.rule, "message": f"{f.title}: {f.evidence}"}
                for f in defects
            ]
        )
    return doc

"""Graph integrity: the gate every document passes before it is saved.

Applies to manual saves, JSON imports, AI change sets and restores alike.
"""

from __future__ import annotations

from collections import Counter
from typing import Any

from pydantic import ValidationError

from ..schema import ArchitectureDocument, SchemaMigrationError, migrate_document, node_type
from .findings import Finding, make_finding


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


def check_integrity(doc: ArchitectureDocument) -> list[Finding]:
    """Return definite structural defects (``kind=schema_error``) in ``doc``."""
    findings: list[Finding] = []
    node_ids = [n.id for n in doc.nodes]
    edge_ids = [e.id for e in doc.edges]

    for dup, count in Counter(node_ids).items():
        if count > 1:
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
                )
            )
    for dup, count in Counter(edge_ids).items():
        if count > 1:
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
                )
            )
    group_ids = [g.id for g in doc.groups]
    clash = set(group_ids) & set(node_ids)
    for gid in sorted(clash):
        findings.append(
            make_finding(
                "group-id-clash",
                "error",
                "schema_error",
                "Group id collides with a node id",
                "Groups and nodes share one id space on the canvas.",
                f"'{gid}' is both a group and a node",
                "Rename the group.",
                node_ids=[gid],
            )
        )

    known = set(node_ids)
    for node in doc.nodes:
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
                )
            )

    for edge in doc.edges:
        missing = [end for end in (edge.source, edge.target) if end not in known]
        if missing:
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
                )
            )

    for group in doc.groups:
        missing = [nid for nid in group.node_ids if nid not in known]
        if missing:
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
                )
            )

    for workflow in doc.workflows:
        missing = [nid for nid in workflow.steps if nid not in known]
        if missing:
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
                )
            )
    actor_ids = {a.id for a in doc.actors}
    for workflow in doc.workflows:
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
                )
            )
    findings.extend(_check_database_and_api(doc, known, actor_ids))
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
        node_list: list[str] | None = None,
    ) -> None:
        findings.append(
            make_finding(
                rule, "error", "schema_error", title, explanation, evidence, fix, node_ids=node_list
            )
        )

    for dup, count in Counter(e.id for e in doc.database.entities).items():
        if count > 1:
            err(
                "duplicate-entity-id",
                "Duplicate entity id",
                "Entity ids must be unique.",
                f"'{dup}' used {count} times",
                "Rename one of the entities.",
            )
    for dup, count in Counter(e.name for e in doc.database.entities).items():
        if count > 1:
            err(
                "duplicate-entity-name",
                "Duplicate table name",
                "Two entities would create the same table.",
                f"'{dup}' used {count} times",
                "Rename one of the entities.",
            )
    for entity in doc.database.entities:
        if entity.node_id is not None:
            node = nodes.get(entity.node_id)
            if node is None:
                err(
                    "entity-missing-node",
                    "Entity stored in a missing component",
                    "An entity's node_id must point at a data store on the canvas.",
                    f"entity '{entity.name}' → node '{entity.node_id}'",
                    "Pick an existing database node or clear node_id.",
                )
            elif node.type not in _DATASTORE_TYPES:
                err(
                    "entity-node-not-datastore",
                    "Entity stored in a non-data component",
                    "Entities can only live in database, search, cache or storage nodes.",
                    f"entity '{entity.name}' → {node.label} ({node.type})",
                    "Move the entity to a data store.",
                    [node.id],
                )
        names = Counter(f.name for f in entity.fields)
        for name, count in names.items():
            if count > 1:
                err(
                    "duplicate-field",
                    "Duplicate column",
                    "Field names must be unique per entity.",
                    f"{entity.name}.{name} appears {count} times",
                    "Rename or remove the duplicate.",
                )
        field_names = set(names)
        for index in entity.indexes:
            missing = [f for f in index.fields if f not in field_names]
            if missing:
                err(
                    "index-missing-field",
                    "Index on a missing column",
                    "Indexes must reference columns of the same entity.",
                    f"{entity.name} index on {', '.join(missing)}",
                    "Fix the index columns.",
                )
        for fld in entity.fields:
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
                )
            elif fk.field not in {f.name for f in target.fields}:
                err(
                    "fk-missing-field",
                    "Foreign key to a missing column",
                    "The referenced column does not exist.",
                    f"{entity.name}.{fld.name} → {target.name}.{fk.field}",
                    "Reference an existing column (usually the primary key).",
                )

    seen_routes: Counter[tuple[str, str]] = Counter((e.method, e.path) for e in doc.api.endpoints)
    for (method, path), count in seen_routes.items():
        if count > 1:
            err(
                "duplicate-endpoint",
                "Duplicate endpoint",
                "Two endpoints share the same method and path.",
                f"{method} {path} x{count}",
                "Remove or change one of them.",
            )
    for dup, count in Counter(e.id for e in doc.api.endpoints).items():
        if count > 1:
            err(
                "duplicate-endpoint-id",
                "Duplicate endpoint id",
                "Endpoint ids must be unique.",
                f"'{dup}' used {count} times",
                "Rename one of them.",
            )
    for ep in doc.api.endpoints:
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
                )
            elif node.type not in {"service", "api_gateway", "auth_service", "worker"}:
                err(
                    "endpoint-service-type",
                    "Endpoint implemented by a non-service component",
                    "Only services, gateways and auth services can implement endpoints.",
                    f"{label} → {node.label} ({node.type})",
                    "Assign a service.",
                    [node.id],
                )
        if ep.response_entity_id is not None and ep.response_entity_id not in entities:
            err(
                "endpoint-missing-entity",
                "Endpoint returns a missing entity",
                "response_entity_id must reference an entity in the database design.",
                f"{label} → '{ep.response_entity_id}'",
                "Pick an existing entity.",
            )
        for role in ep.roles:
            if role not in actor_ids:
                err(
                    "endpoint-missing-role",
                    "Endpoint requires an undefined role",
                    "Role ids must be defined as actors with is_role=true.",
                    f"{label} requires '{role}'",
                    "Define the role or remove it.",
                )
        for af in [*ep.request_fields, *ep.response_fields]:
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
                )
            elif af.entity_field and af.entity_field not in {f.name for f in target.fields}:
                err(
                    "api-field-missing-column",
                    "API field mapped to a missing column",
                    "Field mappings must point at existing columns.",
                    f"{label} field '{af.name}' → {target.name}.{af.entity_field}",
                    "Fix the mapping.",
                )
    return findings


def parse_document(raw: Any) -> ArchitectureDocument:
    """Migrate, schema-validate and integrity-check ``raw``.

    Raises :class:`DocumentInvalid` with a list of ``{path, message}`` errors that a
    UI can show next to the offending field.
    """
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
            [{"path": f.rule, "message": f"{f.title}: {f.evidence}"} for f in defects]
        )
    return doc

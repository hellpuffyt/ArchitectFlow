"""Architecture recommendation rules.

Each rule is a pure function ``(GraphContext) -> list[Finding]``. Rules only fire
on evidence present in the saved document and quote that evidence; when a rule
depends on an explicit requirement (e.g. "high availability"), it names the
requirement wording that triggered it.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from itertools import pairwise

from .context import GraphContext
from .findings import Finding, make_finding
from .ui_rules import accessibility_requirements, design_tokens, ui_references

Rule = Callable[[GraphContext], list[Finding]]

_INTERNAL_ONLY = {
    "database",
    "cache",
    "search_index",
    "message_broker",
    "worker",
    "secrets_manager",
    "object_storage",
}
_CLIENTS = {"web_client", "mobile_client"}


def incompatible_connections(ctx: GraphContext) -> list[Finding]:
    out = []
    for edge in ctx.doc.edges:
        src, dst = ctx.nodes.get(edge.source), ctx.nodes.get(edge.target)
        src_spec, dst_spec = ctx.specs.get(edge.source), ctx.specs.get(edge.target)
        if not (src and dst and src_spec and dst_spec):
            continue
        if not src_spec.initiates_calls and src.type != "message_broker":
            out.append(
                make_finding(
                    "passive-source",
                    "warning",
                    "recommendation",
                    f"{src_spec.label} shown initiating a call",
                    f"A {src_spec.label.lower()} normally does not call other components; the "
                    "arrow may be reversed.",
                    f"edge '{edge.id}': {src.label} → {dst.label} ({edge.protocol})",
                    "Reverse the edge so the caller is the source, or change the component type.",
                    node_ids=[src.id, dst.id],
                    edge_ids=[edge.id],
                )
            )
        if src.type in _CLIENTS and dst.type in {
            "database",
            "cache",
            "search_index",
            "message_broker",
            "secrets_manager",
        }:
            out.append(
                make_finding(
                    "client-to-datastore",
                    "error",
                    "recommendation",
                    "Client talks directly to a data store",
                    "Letting end-user devices reach a data store exposes it to the internet and "
                    "moves authorization into untrusted clients.",
                    f"edge '{edge.id}': {src.label} → {dst.label}",
                    "Route the client through an API gateway or backend service that enforces "
                    "authorization.",
                    node_ids=[src.id, dst.id],
                    edge_ids=[edge.id],
                )
            )
    return out


def public_exposure(ctx: GraphContext) -> list[Finding]:
    out = []
    for node in ctx.doc.nodes:
        if node.type in _INTERNAL_ONLY and ctx.is_public(node):
            out.append(
                make_finding(
                    "public-internal-component",
                    "error",
                    "recommendation",
                    "Internal component marked publicly reachable",
                    f"{node.label} ({node.type}) is marked public. Components of this type hold "
                    "data or jobs and are normally reachable only from inside the network.",
                    f"node '{node.id}' has public=true",
                    "Set public=false and expose it only through an authenticated service.",
                    node_ids=[node.id],
                )
            )
    return out


def auth_gaps(ctx: GraphContext) -> list[Finding]:
    clients = ctx.of_type(*_CLIENTS)
    services = ctx.of_type("service", "api_gateway")
    if not clients or not services or ctx.of_type("auth_service"):
        return []
    hints = ctx.mentions("login", "sign in", "signup", "sign up", "account", "user", "auth")
    evidence = (
        f"{len(clients)} client(s) and {len(services)} service(s), no identity/auth component"
    )
    if hints:
        evidence += f"; requirements mention: {', '.join(hints)}"
    return [
        make_finding(
            "missing-auth",
            "warning",
            "recommendation",
            "No authentication component",
            "Clients reach backend services but the design has no identity or authentication "
            "component, so it is unclear how users are authenticated and requests authorized.",
            evidence,
            "Add an Identity / auth component (or document that the gateway authenticates) and "
            "connect the entry point to it.",
            node_ids=[n.id for n in clients + services],
        )
    ]


def encryption_and_secrets(ctx: GraphContext) -> list[Finding]:
    out = []
    for edge in ctx.doc.edges:
        src, dst = ctx.nodes.get(edge.source), ctx.nodes.get(edge.target)
        if not src or not dst:
            continue
        crosses_boundary = src.type in _CLIENTS or dst.type == "external_api" or ctx.is_public(src)
        if edge.encrypted is False and crosses_boundary:
            out.append(
                make_finding(
                    "unencrypted-boundary",
                    "error",
                    "recommendation",
                    "Unencrypted traffic across a trust boundary",
                    "This connection crosses the public internet or a third-party boundary and is "
                    "explicitly marked unencrypted.",
                    f"edge '{edge.id}': {src.label} → {dst.label}, protocol {edge.protocol}, "
                    "encrypted=false",
                    "Use TLS (HTTPS, gRPC over TLS, TLS-enabled drivers).",
                    node_ids=[src.id, dst.id],
                    edge_ids=[edge.id],
                )
            )
        elif (
            edge.encrypted is None
            and crosses_boundary
            and edge.protocol.upper() in {"HTTP", "WS", "TCP"}
        ):
            out.append(
                make_finding(
                    "plaintext-protocol",
                    "warning",
                    "recommendation",
                    "Plain-text protocol at a trust boundary",
                    f"{edge.protocol} does not imply encryption.",
                    f"edge '{edge.id}': {src.label} → {dst.label} uses {edge.protocol}",
                    "Switch to the TLS variant (HTTPS/WSS) or mark the edge encrypted if it is.",
                    node_ids=[src.id, dst.id],
                    edge_ids=[edge.id],
                )
            )
    stateful = [
        n
        for n in ctx.doc.nodes
        if ctx.specs.get(n.id) and ctx.specs[n.id].stateful and n.type != "message_broker"
    ]
    for node in stateful:
        if "encryption_at_rest" not in node.properties:
            out.append(
                make_finding(
                    "encryption-at-rest-unstated",
                    "info",
                    "recommendation",
                    "Encryption at rest not stated",
                    f"{node.label} stores durable data but the design does not say whether it is "
                    "encrypted at rest.",
                    f"node '{node.id}' has no 'encryption_at_rest' property",
                    "Add property encryption_at_rest=true (or false with a reason).",
                    node_ids=[node.id],
                )
            )
    needs_secrets = ctx.of_type("external_api", "database")
    if needs_secrets and not ctx.of_type("secrets_manager"):
        out.append(
            make_finding(
                "missing-secrets-management",
                "warning",
                "recommendation",
                "No secret management",
                "The design uses credentials (databases or third-party APIs) but has no place to "
                "store them outside code and configuration.",
                f"{len(needs_secrets)} component(s) that need credentials, no secrets manager",
                "Add a Secrets manager component and document how services read credentials.",
                node_ids=[n.id for n in needs_secrets],
            )
        )
    return out


def circular_dependencies(ctx: GraphContext) -> list[Finding]:
    """Cycles of synchronous calls between services can deadlock or cascade failures."""
    callers = {"service", "api_gateway", "auth_service", "worker"}
    graph: dict[str, list[str]] = {nid: [] for nid, n in ctx.nodes.items() if n.type in callers}
    edge_by_pair: dict[tuple[str, str], str] = {}
    for edge in ctx.doc.edges:
        if edge.synchronous and edge.source in graph and edge.target in graph:
            graph[edge.source].append(edge.target)
            edge_by_pair[(edge.source, edge.target)] = edge.id
    seen_cycles: set[frozenset[str]] = set()
    out = []
    state: dict[str, int] = {}
    stack: list[str] = []

    def visit(nid: str) -> None:
        state[nid] = 1
        stack.append(nid)
        for nxt in sorted(graph[nid]):
            if state.get(nxt) == 1:
                cycle = stack[stack.index(nxt) :]
                key = frozenset(cycle)
                if key not in seen_cycles:
                    seen_cycles.add(key)
                    path = [*cycle, nxt]
                    edges = [edge_by_pair[(a, b)] for a, b in pairwise(path)]
                    labels = " → ".join(ctx.nodes[i].label for i in path)
                    out.append(
                        make_finding(
                            "sync-cycle",
                            "warning",
                            "recommendation",
                            "Circular synchronous dependency",
                            "Services that synchronously call each other in a loop can deadlock, "
                            "amplify latency and fail together.",
                            labels,
                            "Break the cycle with an asynchronous message, or merge the "
                            "responsibilities.",
                            node_ids=cycle,
                            edge_ids=edges,
                        )
                    )
            elif state.get(nxt) is None:
                visit(nxt)
        stack.pop()
        state[nid] = 2

    for nid in sorted(graph):
        if state.get(nid) is None:
            visit(nid)
    return out


def data_ownership(ctx: GraphContext) -> list[Finding]:
    out = []
    for node in ctx.of_type("database"):
        writers = sorted(
            {
                e.source
                for e in ctx.incoming[node.id]
                if ctx.nodes[e.source].type in {"service", "worker", "auth_service"}
            }
        )
        if len(writers) > 1 and not node.owner:
            labels = ", ".join(ctx.nodes[w].label for w in writers)
            out.append(
                make_finding(
                    "shared-database",
                    "warning",
                    "recommendation",
                    "Database without a clear owner",
                    "Several services access the same database and no owner is recorded, which "
                    "blurs responsibility for its schema and migrations.",
                    f"{node.label} is accessed by: {labels}",
                    "Set the database's owner, or give each service its own schema/database and "
                    "share data through APIs or events.",
                    node_ids=[node.id, *writers],
                )
            )
        if not ctx.incoming[node.id]:
            out.append(
                make_finding(
                    "orphan-datastore",
                    "info",
                    "recommendation",
                    "Data store nobody uses",
                    "No component connects to this database.",
                    f"node '{node.id}' has no inbound edges",
                    "Connect the services that read or write it, or remove it.",
                    node_ids=[node.id],
                )
            )
    for node in ctx.of_type("service", "worker"):
        if not node.description and not node.owner:
            out.append(
                make_finding(
                    "unclear-responsibility",
                    "info",
                    "recommendation",
                    "Service responsibility not described",
                    "A service with no description or owner makes the design hard to implement "
                    "and review.",
                    f"node '{node.id}' ({node.label}) has no description or owner",
                    "Describe what this service is responsible for and who owns it.",
                    node_ids=[node.id],
                )
            )
    return out


def single_points_of_failure(ctx: GraphContext) -> list[Finding]:
    hints = ctx.mentions(
        "high availability",
        "highly available",
        "availability",
        "uptime",
        "99.9",
        "failover",
        "fault tolerant",
        "redundan",
    )
    if not hints:
        return []
    out = []
    for node in ctx.doc.nodes:
        spec = ctx.specs.get(node.id)
        if spec is None or spec.category in {"client", "external", "operations"}:
            continue
        if node.type in {"cdn", "cloud_resource"}:
            continue
        if node.replicas <= 1 and (ctx.incoming[node.id] or ctx.outgoing[node.id]):
            out.append(
                make_finding(
                    "single-point-of-failure",
                    "warning",
                    "recommendation",
                    "Single instance under an availability requirement",
                    f"Requirements mention {', '.join(hints)}, but {node.label} runs as a single "
                    "instance.",
                    f"node '{node.id}' replicas={node.replicas}",
                    "Run at least two replicas (or a managed HA offering) and describe failover.",
                    node_ids=[node.id],
                )
            )
    return out


def unbounded_resources(ctx: GraphContext) -> list[Finding]:
    out = []
    for node in ctx.of_type("message_broker"):
        keys = {k.lower() for k in node.properties}
        if not keys & {"max_length", "retention", "max_size", "ttl"}:
            out.append(
                make_finding(
                    "unbounded-queue",
                    "warning",
                    "recommendation",
                    "Queue without a bound",
                    "No length, size, retention or TTL limit is recorded, so a slow consumer can "
                    "grow the backlog without limit.",
                    f"node '{node.id}' properties: {sorted(node.properties) or 'none'}",
                    "Set max_length/retention and decide what happens when the bound is reached "
                    "(reject, drop oldest, dead-letter).",
                    node_ids=[node.id],
                )
            )
    for edge in ctx.doc.edges:
        retries = str(edge.properties.get("retries", "")).lower()
        if retries in {"unbounded", "infinite", "unlimited", "-1"}:
            out.append(
                make_finding(
                    "unbounded-retries",
                    "warning",
                    "recommendation",
                    "Unbounded retries",
                    "Infinite retries turn a partial outage into a retry storm.",
                    f"edge '{edge.id}' retries={retries}",
                    "Cap retries and use exponential backoff with jitter.",
                    edge_ids=[edge.id],
                )
            )
    return out


def operations_coverage(ctx: GraphContext) -> list[Finding]:
    out = []
    services = ctx.of_type("service", "worker", "api_gateway")
    if len(services) >= 2 and not ctx.of_type("observability"):
        out.append(
            make_finding(
                "missing-observability",
                "warning",
                "recommendation",
                "No monitoring component",
                "Multiple runtime components and no logs/metrics/tracing destination makes "
                "incidents hard to detect and debug.",
                f"{len(services)} runtime component(s), no observability node",
                "Add an Observability component and connect services to it.",
                node_ids=[n.id for n in services],
            )
        )
    backup_hints = ctx.mentions("backup", "recovery", "durab", "disaster", "rpo", "rto")
    for node in ctx.of_type("database", "object_storage"):
        keys = {k.lower() for k in node.properties}
        if backup_hints and not keys & {"backup", "backups", "point_in_time_recovery"}:
            out.append(
                make_finding(
                    "missing-backup-plan",
                    "warning",
                    "recommendation",
                    "No backup plan recorded",
                    f"Requirements mention {', '.join(backup_hints)} but {node.label} has no "
                    "backup property.",
                    f"node '{node.id}'",
                    "Add a backup property describing schedule, retention and restore testing.",
                    node_ids=[node.id],
                )
            )
    if ctx.of_type("database") and ctx.mentions("migration", "schema change", "zero downtime"):
        decisions = " ".join(d.title.lower() + d.rationale.lower() for d in ctx.doc.decisions)
        if "migrat" not in decisions:
            out.append(
                make_finding(
                    "missing-migration-plan",
                    "info",
                    "recommendation",
                    "No schema migration decision",
                    "Requirements mention migrations or schema changes but no decision records "
                    "how they are performed.",
                    "no decision mentions 'migration'",
                    "Record a decision on the migration tool and rollout strategy.",
                )
            )
    return out


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def requirement_conflicts(ctx: GraphContext) -> list[Finding]:
    """Contradictions *between* stated requirements, preferences and constraints."""
    out: list[Finding] = []
    doc = ctx.doc
    reqs = [*doc.requirements.functional, *doc.requirements.nonfunctional]
    for constraint in doc.constraints:
        if constraint.kind != "forbids_technology" or not constraint.value.strip():
            continue
        banned = _norm(constraint.value)
        pattern = rf"\b{re.escape(banned)}\b"
        prefs = [p for p in doc.technology_preferences if re.search(pattern, _norm(p))]
        hits = [r for r in reqs if re.search(pattern, _norm(r.text))]
        if prefs or hits:
            where = [f"technology preference '{p}'" for p in prefs]
            where += [f"requirement {r.id} '{r.text}'" for r in hits]
            out.append(
                make_finding(
                    "requirement-conflict",
                    "error",
                    "recommendation",
                    "Conflicting requirements",
                    "A constraint forbids a technology that the requirements or technology "
                    "preferences ask for; both cannot be satisfied.",
                    f"constraint {constraint.id} ('{constraint.text}') vs " + "; ".join(where),
                    "Remove or change one of them, and record the decision.",
                )
            )
    seen: dict[str, str] = {}
    for r in reqs:
        key = _norm(r.text)
        if key and key in seen:
            out.append(
                make_finding(
                    "duplicate-requirement",
                    "warning",
                    "recommendation",
                    "Duplicate requirement",
                    "The same requirement is listed twice, which makes priorities ambiguous.",
                    f"{seen[key]} and {r.id}: '{r.text}'",
                    "Merge them into one requirement.",
                )
            )
        else:
            seen[key] = r.id
    return out


def constraint_checks(ctx: GraphContext) -> list[Finding]:
    out = []
    for constraint in ctx.doc.constraints:
        if (
            constraint.kind == "requires_component"
            and constraint.value
            and not ctx.of_type(constraint.value)
        ):
            out.append(
                make_finding(
                    "missing-required-component",
                    "error",
                    "recommendation",
                    "Required component missing",
                    "An explicit project constraint requires this component type.",
                    f"constraint '{constraint.id}': {constraint.text}",
                    f"Add a component of type '{constraint.value}'.",
                )
            )
        if constraint.kind == "forbids_technology" and constraint.value:
            banned = constraint.value.lower()
            offenders = [n for n in ctx.doc.nodes if banned in n.technology.lower()]
            if offenders:
                out.append(
                    make_finding(
                        "constraint-contradiction",
                        "error",
                        "recommendation",
                        "Design contradicts a constraint",
                        "A component uses a technology that a project constraint forbids.",
                        f"constraint '{constraint.id}' ({constraint.text}) vs "
                        + ", ".join(f"{n.label} uses {n.technology}" for n in offenders),
                        "Choose a different technology or revise the constraint.",
                        node_ids=[n.id for n in offenders],
                    )
                )
    return out


def unlinked_design(ctx: GraphContext) -> list[Finding]:
    """Entities/endpoints whose component was removed or never assigned."""
    out: list[Finding] = []
    if not ctx.doc.nodes:
        return out
    for ent in ctx.doc.database.entities:
        if ent.node_id is None:
            out.append(
                make_finding(
                    "entity-unassigned",
                    "warning",
                    "recommendation",
                    "Entity not stored anywhere",
                    "The entity is not linked to a data store, so its owner and storage are "
                    "unclear.",
                    f"entity '{ent.name}' has no node_id",
                    "Link it to a database component (Database Design workspace).",
                )
            )
    for ep in ctx.doc.api.endpoints:
        if ep.service_node_id is None:
            out.append(
                make_finding(
                    "endpoint-unassigned",
                    "warning",
                    "recommendation",
                    "Endpoint not implemented by any service",
                    "No component is responsible for this endpoint.",
                    f"{ep.method} {ep.path} has no service_node_id",
                    "Assign the service that implements it (API Design workspace).",
                )
            )
    return out


ALL_RULES: tuple[Rule, ...] = (
    incompatible_connections,
    public_exposure,
    auth_gaps,
    encryption_and_secrets,
    circular_dependencies,
    data_ownership,
    single_points_of_failure,
    unbounded_resources,
    operations_coverage,
    constraint_checks,
    requirement_conflicts,
    unlinked_design,
    ui_references,
    design_tokens,
    accessibility_requirements,
)

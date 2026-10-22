"""Node type registry.

Every node on the canvas has a ``type`` that must be a key of :data:`NODE_TYPES`.
To add a new component type, append a :class:`NodeTypeSpec` here, mirror it in
``apps/web/lib/registry.ts`` (a test checks that both lists agree), and give it an
icon in the web app. See ``docs/NODE_REGISTRY.md``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

Category = Literal[
    "client",
    "edge",
    "compute",
    "data",
    "messaging",
    "identity",
    "storage",
    "external",
    "operations",
    "security",
    "infrastructure",
]


@dataclass(frozen=True)
class NodeTypeSpec:
    """Static facts the validator and exporters rely on."""

    key: str
    label: str
    category: Category
    description: str
    # Holds durable state (backups, replication and data ownership rules apply).
    stateful: bool = False
    # Expected to be reachable from the public internet.
    public_by_default: bool = False
    # Initiates outbound calls to other components in normal operation.
    initiates_calls: bool = True
    # Mermaid/PlantUML shape hints.
    c4_kind: Literal["person", "system", "container", "container_db", "queue", "external"] = (
        "container"
    )
    default_properties: dict[str, str] = field(default_factory=dict)


_SPECS: tuple[NodeTypeSpec, ...] = (
    NodeTypeSpec(
        "web_client",
        "Web client",
        "client",
        "Browser application used by people.",
        public_by_default=True,
        c4_kind="person",
    ),
    NodeTypeSpec(
        "mobile_client",
        "Mobile client",
        "client",
        "iOS/Android application.",
        public_by_default=True,
        c4_kind="person",
    ),
    NodeTypeSpec(
        "api_gateway",
        "API gateway",
        "edge",
        "Single public entry point that routes, authenticates and rate-limits requests.",
        public_by_default=True,
    ),
    NodeTypeSpec(
        "load_balancer",
        "Load balancer",
        "edge",
        "Distributes traffic across replicas.",
        public_by_default=True,
    ),
    NodeTypeSpec(
        "service", "Backend service", "compute", "Stateless application service exposing an API."
    ),
    NodeTypeSpec(
        "worker", "Background worker", "compute", "Consumes jobs or messages asynchronously."
    ),
    NodeTypeSpec(
        "database",
        "Database",
        "data",
        "Durable system of record.",
        stateful=True,
        initiates_calls=False,
        c4_kind="container_db",
    ),
    NodeTypeSpec(
        "cache",
        "Cache",
        "data",
        "In-memory cache; data is reconstructible.",
        initiates_calls=False,
        c4_kind="container_db",
    ),
    NodeTypeSpec(
        "search_index",
        "Search index",
        "data",
        "Full-text or vector search index.",
        stateful=True,
        initiates_calls=False,
        c4_kind="container_db",
    ),
    NodeTypeSpec(
        "message_broker",
        "Message broker",
        "messaging",
        "Queue or log that decouples producers and consumers.",
        stateful=True,
        initiates_calls=False,
        c4_kind="queue",
    ),
    NodeTypeSpec(
        "auth_service",
        "Identity / auth",
        "identity",
        "Authentication and identity provider (OIDC, sessions, tokens).",
    ),
    NodeTypeSpec(
        "object_storage",
        "Object storage",
        "storage",
        "Blob/file storage such as S3-compatible buckets.",
        stateful=True,
        initiates_calls=False,
        c4_kind="container_db",
    ),
    NodeTypeSpec(
        "cdn", "CDN", "storage", "Edge cache for static and media content.", public_by_default=True
    ),
    NodeTypeSpec(
        "external_api",
        "External service",
        "external",
        "Third-party API outside your control (payments, email, maps...).",
        c4_kind="external",
    ),
    NodeTypeSpec(
        "observability",
        "Observability",
        "operations",
        "Logs, metrics, traces and alerting.",
        initiates_calls=False,
    ),
    NodeTypeSpec(
        "secrets_manager",
        "Secrets manager",
        "security",
        "Stores credentials and keys outside code and config.",
        initiates_calls=False,
    ),
    NodeTypeSpec(
        "waf",
        "WAF / firewall",
        "security",
        "Filters malicious traffic in front of public endpoints.",
        public_by_default=True,
    ),
    NodeTypeSpec(
        "cloud_resource",
        "Cloud resource",
        "infrastructure",
        "Infrastructure such as a cluster, VPC, region or serverless platform.",
        initiates_calls=False,
    ),
)

NODE_TYPES: dict[str, NodeTypeSpec] = {spec.key: spec for spec in _SPECS}


def node_type(key: str) -> NodeTypeSpec | None:
    """Return the spec for ``key`` or ``None`` when the type is unknown."""
    return NODE_TYPES.get(key)

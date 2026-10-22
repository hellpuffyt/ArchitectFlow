"""Deterministic example provider.

This is NOT an AI. It derives a plausible architecture from keywords in the vision
and understands a small, documented set of edit commands. Every response it
produces is labeled with :data:`EXAMPLE_MODE_NOTICE`, and the same input always
yields the same output, which is what the end-to-end tests rely on.
"""

from __future__ import annotations

import re
from typing import Any, Literal

from ..schema import ArchitectureDocument, node_type
from .base import EXAMPLE_MODE_NOTICE, ProviderResult
from .example_domain import ROLE_HINTS, entity_ops, features_from_vision

_TECH = {
    "postgres": "PostgreSQL",
    "postgresql": "PostgreSQL",
    "mysql": "MySQL",
    "mongodb": "MongoDB",
    "redis": "Redis",
    "kafka": "Apache Kafka",
    "rabbitmq": "RabbitMQ",
    "react": "React",
    "next.js": "Next.js",
    "nextjs": "Next.js",
    "python": "Python",
    "fastapi": "FastAPI",
    "django": "Django",
    "node": "Node.js",
    "go": "Go",
    "java": "Java",
    "kotlin": "Kotlin",
    "swift": "Swift",
    "flutter": "Flutter",
    "aws": "AWS",
    "gcp": "GCP",
    "azure": "Azure",
    "kubernetes": "Kubernetes",
    "elasticsearch": "Elasticsearch",
}
_ACTORS = [
    "customer",
    "user",
    "admin",
    "administrator",
    "seller",
    "buyer",
    "driver",
    "rider",
    "student",
    "teacher",
    "patient",
    "doctor",
    "employee",
    "manager",
    "guest",
    "member",
    "author",
    "reader",
    "host",
    "operator",
]
_INTEGRATIONS = {
    r"\b(payment|payments|checkout|stripe|billing|subscription)": ("payments", "Payment provider"),
    r"\b(email|newsletter)": ("email", "Email delivery"),
    r"\b(sms|text message)": ("sms", "SMS gateway"),
    r"\b(map|maps|geolocation|location)": ("maps", "Maps / geolocation API"),
    r"\b(oauth|google login|sign in with)": ("oauth", "OAuth identity provider"),
}


def _has(text: str, pattern: str) -> bool:
    return re.search(pattern, text) is not None


def _slug(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return (s or "item")[:40]


def _sentences(vision: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+|\n+", vision.strip())
    return [p.strip(" -•*") for p in parts if len(p.strip()) > 3]


class _Builder:
    def __init__(self) -> None:
        self.ops: list[dict[str, Any]] = []
        self.ids: set[str] = set()

    def uid(self, base: str) -> str:
        candidate, n = base, 2
        while candidate in self.ids:
            candidate, n = f"{base}-{n}", n + 1
        self.ids.add(candidate)
        return candidate

    def node(self, base: str, type_: str, label: str, **extra: Any) -> str:
        nid = self.uid(base)
        self.ops.append(
            {"op": "add_node", "node": {"id": nid, "type": type_, "label": label, **extra}}
        )
        return nid

    def edge(self, src: str, dst: str, protocol: str = "HTTPS", **extra: Any) -> str:
        eid = self.uid(f"e-{src}-{dst}")
        self.ops.append(
            {
                "op": "add_edge",
                "edge": {"id": eid, "source": src, "target": dst, "protocol": protocol, **extra},
            }
        )
        return eid


class ExampleProvider:
    name = "example"
    mode: Literal["example", "live"] = "example"

    async def propose_architecture(
        self, vision: str, current: ArchitectureDocument
    ) -> ProviderResult:
        text = vision.lower()
        b = _Builder()
        b.ids |= {n.id for n in current.nodes} | {e.id for e in current.edges}
        # Replacing a non-empty design is explicit: existing nodes are removed in the
        # change set, which the review screen flags as a large change.
        for node in current.nodes:
            b.ops.append({"op": "remove_node", "id": node.id})
        for section in (
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
        ):
            if getattr(current, section) != getattr(ArchitectureDocument(), section):
                b.ops.append({"op": "clear_section", "section": section})
        b.ops.append({"op": "set_vision", "vision": vision})

        prefs = sorted({v for k, v in _TECH.items() if re.search(rf"\b{re.escape(k)}\b", text)})
        for p in prefs:
            b.ops.append({"op": "add_technology_preference", "text": p})

        fr = 0
        features = features_from_vision(vision)
        features = [f for f in features if f.lower() not in _TECH]
        for feature in features:
            fr += 1
            b.ops.append(
                {
                    "op": "add_requirement",
                    "kind": "functional",
                    "requirement": {
                        "id": f"fr-{fr}",
                        "text": feature,
                        "category": "feature",
                        "priority": "must",
                        "status": "confirmed",
                    },
                }
            )
        for sentence in _sentences(vision):
            low = sentence.lower()
            if _has(low, r"\b(can|should|must|will|able to|allow|lets?|need to|want to)\b"):
                fr += 1
                b.ops.append(
                    {
                        "op": "add_requirement",
                        "kind": "functional",
                        "requirement": {
                            "id": f"fr-{fr}",
                            "text": sentence,
                            "priority": "must",
                            "status": "confirmed",
                        },
                    }
                )
        if fr == 0:
            b.ops.append(
                {
                    "op": "add_requirement",
                    "kind": "functional",
                    "requirement": {
                        "id": "fr-1",
                        "text": vision.strip()[:4000] or "Describe the core feature.",
                        "priority": "must",
                        "status": "confirmed",
                    },
                }
            )

        nfr_rules = [
            (
                r"\b(million|thousands|scale|scalab|high traffic|peak)",
                "scalability",
                "Handle the stated load with horizontal scaling of stateless services.",
            ),
            (
                r"\b(available|availability|uptime|99\.9|reliab)",
                "availability",
                "Target high availability; no single instance on the request path.",
            ),
            (
                r"\b(fast|latency|real-?time|instant|responsive)",
                "performance",
                "Interactive requests respond quickly (set a p95 latency budget).",
            ),
            (
                r"\b(secure|security|privacy|gdpr|hipaa|pci|compliance|encrypt)",
                "security",
                "Protect personal data in transit and at rest; follow stated compliance rules.",
            ),
            (
                r"\b(backup|recover|durab|disaster)",
                "durability",
                "Back up durable data and test restores.",
            ),
            (
                r"\boffline",
                "availability",
                "Clients keep working without connectivity and synchronize when back online.",
            ),
            (
                r"\b(role|permission|rbac)",
                "security",
                "Every API checks the caller's role; the UI hides actions a role cannot perform.",
            ),
            (
                r"\b(multi-?tenant|tenants?)",
                "security",
                "Tenant data is isolated: no query may return another tenant's rows.",
            ),
        ]
        nfr = 0
        for pattern, category, wording in nfr_rules:
            if _has(text, pattern):
                nfr += 1
                b.ops.append(
                    {
                        "op": "add_requirement",
                        "kind": "nonfunctional",
                        "requirement": {
                            "id": f"nfr-{nfr}",
                            "text": wording,
                            "category": category,
                            "priority": "should",
                            "status": "assumption",
                        },
                    }
                )

        roles = [(rid, name) for pattern, rid, name in ROLE_HINTS if _has(text, pattern)]
        roles_assumed = False
        if not roles and _has(text, r"\b(role|permission|rbac)"):
            roles = [("admin", "Administrator"), ("manager", "Manager"), ("staff", "Staff")]
            roles_assumed = True
        if not roles:
            roles = [("user", "User")]
            roles_assumed = True
        for rid, name in roles[:6]:
            b.ops.append({"op": "add_actor", "actor": {"id": rid, "name": name, "is_role": True}})
        role_ids = [rid for rid, _ in roles[:6]]
        multi_tenant = _has(text, r"\b(multi-?tenant|tenants?)")
        offline = _has(text, r"\boffline")

        mobile = _has(text, r"\b(mobile|ios|android|phone app|app store)")
        web = _has(text, r"\b(web|website|browser|dashboard|portal|site)") or not mobile
        realtime = _has(text, r"\b(real-?time|live|chat|instant|websocket|notification)")
        async_work = _has(
            text,
            r"\b(email|notif|background|queue|async|report|process|import|"
            r"export|video|transcod|schedul)",
        )
        media = _has(text, r"\b(upload|image|photo|video|file|media|document|attachment)")
        search = _has(text, r"\bsearch")
        cache = _has(text, r"\b(fast|cache|scale|million|latency|real-?time|high traffic)")
        db_tech = next((t for t in ("PostgreSQL", "MySQL", "MongoDB") if t in prefs), "PostgreSQL")
        lang = next(
            (
                t
                for t in ("FastAPI", "Django", "Node.js", "Go", "Java", "Kotlin", "Python")
                if t in prefs
            ),
            "",
        )

        clients = []
        if web:
            clients.append(
                b.node(
                    "web",
                    "web_client",
                    "Web app",
                    technology="Next.js"
                    if "Next.js" in prefs
                    else ("React" if "React" in prefs else ""),
                )
            )
        if mobile:
            clients.append(
                b.node(
                    "mobile",
                    "mobile_client",
                    "Mobile app",
                    technology="Flutter" if "Flutter" in prefs else "",
                )
            )
        gw = b.node(
            "gateway",
            "api_gateway",
            "API gateway",
            description="Public entry point: TLS termination, routing, rate limiting.",
        )
        for c in clients:
            b.edge(c, gw, "HTTPS", encrypted=True, label="API calls")
        auth = b.node(
            "auth",
            "auth_service",
            "Auth service",
            description="Sign-up, login, sessions/tokens.",
            technology="OIDC",
        )
        b.edge(gw, auth, "HTTPS", label="verify session", encrypted=True)
        api = b.node(
            "core-api",
            "service",
            "Core API",
            technology=lang,
            description="Business logic for the core workflows.",
            owner="core team",
        )
        b.edge(gw, api, "HTTPS", encrypted=True)
        db = b.node(
            "db",
            "database",
            "Primary database",
            technology=db_tech,
            owner="core team",
            properties={"encryption_at_rest": True, "backup": "daily snapshots + PITR"},
            replicas=2 if _has(text, r"\b(available|availability|uptime)") else 1,
        )
        b.edge(
            api,
            db,
            "SQL/TLS" if db_tech != "MongoDB" else "MongoDB wire/TLS",
            encrypted=True,
            label="read/write",
        )
        b.edge(auth, db, "SQL/TLS", encrypted=True, label="users & sessions")
        if cache:
            rc = b.node("cache", "cache", "Cache", technology="Redis")
            b.edge(api, rc, "RESP/TLS", encrypted=True)
        if async_work or realtime:
            mq = b.node(
                "queue",
                "message_broker",
                "Job queue",
                technology="Apache Kafka"
                if "Apache Kafka" in prefs
                else ("RabbitMQ" if "RabbitMQ" in prefs else "Redis Streams"),
                properties={"max_length": 100000, "retention": "7d"},
            )
            wk = b.node(
                "worker",
                "worker",
                "Background worker",
                technology=lang,
                description="Processes async jobs (notifications, media, reports).",
                owner="core team",
            )
            b.edge(api, mq, "AMQP/TLS", synchronous=False, encrypted=True, label="enqueue jobs")
            b.edge(wk, mq, "AMQP/TLS", synchronous=False, encrypted=True, label="consume jobs")
            b.edge(wk, db, "SQL/TLS", encrypted=True)
        if media:
            st = b.node(
                "storage",
                "object_storage",
                "Object storage",
                technology="S3-compatible",
                properties={"encryption_at_rest": True, "backup": "versioned bucket"},
            )
            cdn = b.node("cdn", "cdn", "CDN")
            b.edge(api, st, "HTTPS", encrypted=True, label="signed uploads")
            b.edge(cdn, st, "HTTPS", encrypted=True, label="origin fetch")
            for c in clients:
                b.edge(c, cdn, "HTTPS", encrypted=True, label="media")
        if search:
            si = b.node(
                "search",
                "search_index",
                "Search index",
                technology="Elasticsearch" if "Elasticsearch" in prefs else "OpenSearch",
                properties={"encryption_at_rest": True},
            )
            b.edge(api, si, "HTTPS", encrypted=True)
        domain_ops = entity_ops(
            text, db_node=db, service_node=api, multi_tenant=multi_tenant, role_ids=role_ids
        )
        b.ops += domain_ops
        if offline:
            sync = b.node(
                "sync-api",
                "service",
                "Sync service",
                technology=lang,
                owner="core team",
                description="Accepts batched offline changes and returns server "
                "updates since a client cursor.",
            )
            b.edge(gw, sync, "HTTPS", encrypted=True, label="sync batches")
            b.edge(sync, db, "SQL/TLS", encrypted=True)
            b.ops.append(
                {
                    "op": "put_endpoint",
                    "endpoint": {
                        "id": "api-sync",
                        "method": "POST",
                        "path": "/api/sync",
                        "summary": "Push offline changes and pull updates since a cursor",
                        "service_node_id": sync,
                        "auth": "authenticated",
                        "request_fields": [
                            {"name": "cursor", "type": "text", "required": False},
                            {"name": "changes", "type": "json", "required": True},
                        ],
                        "response_fields": [
                            {"name": "cursor", "type": "text"},
                            {"name": "updates", "type": "json"},
                        ],
                        "errors": [
                            {"status": 401, "description": "not signed in"},
                            {"status": 409, "description": "conflicting change rejected"},
                        ],
                    },
                }
            )

        integrations = []
        for pattern, (key, label) in _INTEGRATIONS.items():
            if _has(text, pattern):
                integrations.append(label)
                ext = b.node(f"ext-{key}", "external_api", label)
                src = "worker" if key in {"email", "sms"} and (async_work or realtime) else api
                b.edge(src, ext, "HTTPS", encrypted=True)
                b.ops.append({"op": "add_integration", "text": label})
        sec = b.node("secrets", "secrets_manager", "Secrets manager")
        b.edge(api, sec, "HTTPS", encrypted=True, label="read credentials")
        obs = b.node("observability", "observability", "Observability", technology="OpenTelemetry")
        b.edge(api, obs, "OTLP", synchronous=False, encrypted=True, label="traces & metrics")

        decisions = [
            (
                "API gateway as the single public entry point",
                "Keeps internal services private and centralizes TLS, auth checks and rate limits.",
                "Adds a hop and a component to operate.",
            ),
            (
                f"{db_tech} as the system of record",
                "Relational integrity and transactions for core data."
                if db_tech != "MongoDB"
                else "Document model matches the stated preference.",
                "Requires schema migrations; scale reads with replicas before sharding.",
            ),
        ]
        if async_work or realtime:
            decisions.append(
                (
                    "Asynchronous jobs through a queue",
                    "Slow or failure-prone work (email, media, reports) does not "
                    "block user requests.",
                    "Eventual consistency; needs idempotent consumers and a dead-letter strategy.",
                )
            )
        if multi_tenant:
            decisions.append(
                (
                    "Shared database, tenant_id on every row",
                    "Simplest multi-tenant model to operate; isolation is enforced by "
                    "tenant-scoped queries (optionally Postgres row-level security).",
                    "A missing tenant filter leaks data; noisy tenants share capacity.",
                )
            )
        if offline:
            decisions.append(
                (
                    "Offline-first clients with a sync endpoint",
                    "Clients queue changes locally and push them in batches.",
                    "Requires conflict resolution and idempotent change ids.",
                )
            )
        for i, (title, why, cost) in enumerate(decisions, 1):
            b.ops.append(
                {
                    "op": "add_decision",
                    "decision": {
                        "id": f"adr-{i}",
                        "title": title,
                        "rationale": why,
                        "tradeoffs": cost,
                        "status": "proposed",
                    },
                }
            )

        assumptions = [
            "Single region deployment initially; multi-region is out of scope.",
            "The generated tables, endpoints and non-functional requirements are "
            "starting points inferred from keywords, not stated requirements.",
        ]
        if roles_assumed:
            assumptions.append(
                "Roles " + ", ".join(n for _, n in roles[:6]) + " were assumed; "
                "replace them with your real roles."
            )
        if multi_tenant:
            assumptions.append("Tenants are isolated by a tenant_id column in one database.")
        if offline:
            assumptions.append(
                "Offline conflicts resolve last-write-wins per record using server timestamps."
            )
        for i, text_ in enumerate(assumptions, 1):
            b.ops.append(
                {
                    "op": "add_assumption",
                    "assumption": {"id": f"asm-{i}", "text": text_, "confirmed": False},
                }
            )
        for i, feature in enumerate(features[:12], 1):
            b.ops.append(
                {
                    "op": "add_acceptance_criterion",
                    "criterion": {
                        "id": f"ac-{i}",
                        "text": f"Suggested: an authorized user can complete the "
                        f"'{feature}' workflow end to end, and an "
                        f"unauthorized user is refused.",
                    },
                }
            )
        questions = []
        if not _has(text, r"\b(\d[\d,.]*\s*(k|m|users|requests|rps)|million|thousand)"):
            questions.append(
                "How many users and requests per second do you expect at launch and in a year?"
            )
        if not prefs:
            questions.append("Do you have preferred languages, frameworks or cloud provider?")
        if not _has(text, r"\b(gdpr|hipaa|pci|soc ?2|compliance|privacy)"):
            questions.append("Are there compliance or data-residency requirements?")
        if offline:
            questions.append("How should conflicting offline edits to the same record be resolved?")
        if not _has(text, r"\b(retain|retention|delete after|archive)"):
            questions.append("How long must data be retained, and when must it be deleted?")
        for q in questions:
            b.ops.append({"op": "add_open_question", "text": q})

        explanation = (
            f"{EXAMPLE_MODE_NOTICE}. Generated deterministically from keywords in your vision: "
            f"{len(clients)} client(s), API gateway, auth, core API and {db_tech}"
            + (", cache" if cache else "")
            + (", queue + worker" if async_work or realtime else "")
            + (", object storage + CDN" if media else "")
            + (", search" if search else "")
            + (", sync service" if offline else "")
            + (f", integrations: {', '.join(integrations)}" if integrations else "")
            + f"; {sum(1 for o in domain_ops if o['op'] == 'put_entity')} entities and "
            f"{sum(1 for o in domain_ops if o['op'] == 'put_endpoint')} endpoints inferred."
        )
        return ProviderResult(explanation=explanation, operations=b.ops, questions=questions)

    async def propose_edit(self, request: str, current: ArchitectureDocument) -> ProviderResult:
        req = request.strip()
        low = req.lower()
        b = _Builder()
        b.ids |= {n.id for n in current.nodes} | {e.id for e in current.edges}

        def find(label: str) -> str | None:
            label = label.strip().strip("'\"").lower()
            for n in current.nodes:
                if n.label.lower() == label or n.id.lower() == label:
                    return n.id
            for n in current.nodes:
                if label and label in n.label.lower():
                    return n.id
            return None

        if m := re.match(r"^(?:remove|delete)\s+(?:the\s+)?(.+)$", low):
            nid = find(m.group(1))
            if nid:
                b.ops.append({"op": "remove_node", "id": nid})
        elif m := re.match(r"^rename\s+(.+?)\s+to\s+(.+)$", req, re.IGNORECASE):
            nid = find(m.group(1))
            if nid:
                b.ops.append(
                    {"op": "update_node", "id": nid, "changes": {"label": m.group(2).strip()[:200]}}
                )
        elif m := re.match(
            r"^connect\s+(.+?)\s+to\s+(.+?)(?:\s+(?:via|using|over)\s+(\S+))?$", req, re.IGNORECASE
        ):
            src, dst = find(m.group(1)), find(m.group(2))
            if src and dst:
                b.edge(src, dst, (m.group(3) or "HTTPS").upper(), encrypted=True)
        elif m := re.match(r"^use\s+(.+?)\s+for\s+(.+)$", req, re.IGNORECASE):
            nid = find(m.group(2))
            if nid:
                b.ops.append(
                    {
                        "op": "update_node",
                        "id": nid,
                        "changes": {"technology": m.group(1).strip()[:200]},
                    }
                )
        elif m := re.match(r"^(?:make\s+)?(.+?)\s+(?:highly available|ha|redundant)$", low):
            nid = find(m.group(1))
            if nid:
                b.ops.append({"op": "update_node", "id": nid, "changes": {"replicas": 3}})
        elif m := re.match(
            r"^add\s+(?:an?\s+|the\s+)?(.+?)(?:\s+(?:in front of|for|to|"
            r"between)\s+(.+))?$",
            low,
        ):
            thing, anchor = m.group(1), m.group(2)
            kind, label, tech = self._classify(thing)
            if kind:
                nid = b.node(_slug(label), kind, label, technology=tech)
                target = find(anchor) if anchor else None
                callers = (
                    [target] if target else [n.id for n in current.nodes if n.type == "service"][:3]
                )
                for c in callers:
                    if kind in {
                        "observability",
                        "secrets_manager",
                        "cache",
                        "database",
                        "message_broker",
                        "search_index",
                        "object_storage",
                        "external_api",
                    }:
                        b.edge(c, nid, "HTTPS", encrypted=True)
                    else:
                        b.edge(nid, c, "HTTPS", encrypted=True)
        if not b.ops:
            return ProviderResult(
                explanation=(
                    f"{EXAMPLE_MODE_NOTICE}. The example provider only understands: "
                    "'add <component> [for <name>]', 'remove <name>', 'rename <a> to "
                    "<b>', 'connect <a> to <b> [via <protocol>]', 'use <tech> for "
                    "<name>', 'make <name> highly available'. Nothing was changed."
                ),
                operations=[],
                questions=[
                    "Which component should change, and how? Name it as it appears on the canvas."
                ],
            )
        return ProviderResult(
            explanation=f"{EXAMPLE_MODE_NOTICE}. Interpreted: “{req}”.", operations=b.ops
        )

    @staticmethod
    def _classify(thing: str) -> tuple[str | None, str, str]:
        table = [
            (r"redis|cache", "cache", "Cache", "Redis"),
            (r"kafka", "message_broker", "Event stream", "Apache Kafka"),
            (r"rabbit|queue|broker", "message_broker", "Message queue", "RabbitMQ"),
            (r"postgres|database|\bdb\b", "database", "Database", "PostgreSQL"),
            (r"worker|job", "worker", "Background worker", ""),
            (
                r"monitor|observab|logging|metrics|tracing",
                "observability",
                "Observability",
                "OpenTelemetry",
            ),
            (r"cdn", "cdn", "CDN", ""),
            (r"auth|identity|login|sso", "auth_service", "Auth service", "OIDC"),
            (r"gateway", "api_gateway", "API gateway", ""),
            (r"load balancer|\blb\b", "load_balancer", "Load balancer", ""),
            (r"search|elastic", "search_index", "Search index", "OpenSearch"),
            (r"s3|storage|bucket|blob", "object_storage", "Object storage", "S3-compatible"),
            (r"secret|vault|kms", "secrets_manager", "Secrets manager", ""),
            (r"waf|firewall", "waf", "WAF", ""),
            (r"mobile", "mobile_client", "Mobile app", ""),
            (r"web|frontend", "web_client", "Web app", ""),
            (r"stripe|payment", "external_api", "Payment provider", "Stripe"),
            (r"email|smtp", "external_api", "Email delivery", ""),
        ]
        for pattern, kind, label, tech in table:
            if re.search(pattern, thing):
                return kind, label, tech
        m = re.match(r"^(.+?)\s+service$", thing)
        if m and node_type("service"):
            name = m.group(1).strip().title()[:180]
            return "service", f"{name} service", ""
        return None, "", ""

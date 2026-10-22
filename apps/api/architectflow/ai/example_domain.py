"""Keyword → data model templates used by the deterministic example provider.

Everything produced from these templates is an inference, so the example provider
records the generated data model as ASSUMPTIONS for the user to confirm.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class DomainTemplate:
    pattern: str
    entity: str  # table name, snake_case singular
    label: str
    fields: tuple[tuple[str, str, bool], ...]  # (name, type, nullable)


DOMAIN: tuple[DomainTemplate, ...] = (
    DomainTemplate(
        r"\binventor",
        "item",
        "Inventory item",
        (
            ("sku", "varchar", False),
            ("name", "varchar", False),
            ("description", "text", True),
            ("quantity", "integer", False),
            ("unit_price", "numeric", False),
        ),
    ),
    DomainTemplate(
        r"\b(product|catalog)",
        "product",
        "Product",
        (("name", "varchar", False), ("description", "text", True), ("price", "numeric", False)),
    ),
    DomainTemplate(
        r"\b(billing|invoice|invoic)",
        "invoice",
        "Invoice",
        (
            ("number", "varchar", False),
            ("status", "varchar", False),
            ("total", "numeric", False),
            ("issued_at", "timestamp", False),
        ),
    ),
    DomainTemplate(
        r"\b(orders?|checkout|cart)\b",
        "order",
        "Order",
        (
            ("status", "varchar", False),
            ("total", "numeric", False),
            ("placed_at", "timestamp", False),
        ),
    ),
    DomainTemplate(
        r"\b(payment|subscription)",
        "payment",
        "Payment",
        (
            ("amount", "numeric", False),
            ("status", "varchar", False),
            ("provider_ref", "varchar", True),
        ),
    ),
    DomainTemplate(
        r"\bbranch", "branch", "Branch", (("name", "varchar", False), ("address", "text", True))
    ),
    DomainTemplate(
        r"\bcustomer",
        "customer",
        "Customer",
        (("name", "varchar", False), ("email", "varchar", True), ("phone", "varchar", True)),
    ),
    DomainTemplate(
        r"\b(booking|reservation|appointment)",
        "booking",
        "Booking",
        (
            ("starts_at", "timestamp", False),
            ("ends_at", "timestamp", False),
            ("status", "varchar", False),
        ),
    ),
    DomainTemplate(
        r"\b(course|lesson)",
        "course",
        "Course",
        (("title", "varchar", False), ("description", "text", True)),
    ),
    DomainTemplate(
        r"\b(posts?|articles?|blog)\b",
        "post",
        "Post",
        (("title", "varchar", False), ("body", "text", False), ("published_at", "timestamp", True)),
    ),
    DomainTemplate(
        r"\b(tickets?|helpdesk|support desk)\b",
        "ticket",
        "Support ticket",
        (("subject", "varchar", False), ("status", "varchar", False), ("body", "text", False)),
    ),
    DomainTemplate(
        r"\b(messages?|messaging|chat)\b",
        "message",
        "Message",
        (("body", "text", False), ("sent_at", "timestamp", False)),
    ),
)

ROLE_HINTS: tuple[tuple[str, str, str], ...] = (
    (r"\b(admin|administrat)", "admin", "Administrator"),
    (r"\bmanager", "manager", "Manager"),
    (r"\b(staff|employee|cashier|clerk)", "staff", "Staff"),
    (r"\bcustomer", "customer", "Customer"),
    (r"\b(seller|vendor|merchant)", "seller", "Seller"),
    (r"\b(buyer|shopper)", "buyer", "Buyer"),
    (r"\b(student|learner)", "student", "Student"),
    (r"\b(teacher|instructor)", "teacher", "Teacher"),
    (r"\b(driver|courier)", "driver", "Driver"),
    (r"\b(patient)", "patient", "Patient"),
    (r"\b(doctor|clinician)", "doctor", "Doctor"),
)


def features_from_vision(vision: str) -> list[str]:
    """Return the comma-separated feature list in phrases like 'a SaaS with A, B, and C'."""
    match = re.search(r"\bwith\s+(.+?)(?:[.!?]\s|[.!?]?$)", vision, re.IGNORECASE | re.DOTALL)
    if not match:
        return []
    raw = re.split(r",\s*|\s+and\s+", match.group(1))
    items = []
    for part in raw:
        item = part.strip()
        while (stripped := re.sub(r"^(and|an?|the)\s+", "", item, flags=re.IGNORECASE)) != item:
            item = stripped
        if 2 < len(item) < 200:
            items.append(item[0].upper() + item[1:])
    return items


def entity_ops(
    text: str, *, db_node: str, service_node: str, multi_tenant: bool, role_ids: list[str]
) -> list[dict[str, Any]]:
    """Entities + CRUD endpoints for each domain keyword found in ``text``."""
    ops: list[dict[str, Any]] = []
    tenant_fields: list[dict[str, Any]] = []
    if multi_tenant:
        ops.append(
            {
                "op": "put_entity",
                "entity": {
                    "id": "ent-tenant",
                    "name": "tenant",
                    "label": "Tenant",
                    "node_id": db_node,
                    "description": "An organization using the SaaS; rows belong to one tenant.",
                    "fields": [
                        {
                            "id": "tenant-id",
                            "name": "id",
                            "type": "uuid",
                            "primary_key": True,
                            "nullable": False,
                        },
                        {"id": "tenant-name", "name": "name", "type": "varchar", "nullable": False},
                        {
                            "id": "tenant-created",
                            "name": "created_at",
                            "type": "timestamp",
                            "nullable": False,
                        },
                    ],
                },
            }
        )
    for tpl in DOMAIN:
        if not re.search(tpl.pattern, text):
            continue
        eid = f"ent-{tpl.entity}"
        fields: list[dict[str, Any]] = [
            {
                "id": f"{tpl.entity}-id",
                "name": "id",
                "type": "uuid",
                "primary_key": True,
                "nullable": False,
            }
        ]
        indexes: list[dict[str, Any]] = []
        if multi_tenant:
            fields.append(
                {
                    "id": f"{tpl.entity}-tenant",
                    "name": "tenant_id",
                    "type": "uuid",
                    "nullable": False,
                    "foreign_key": {
                        "entity_id": "ent-tenant",
                        "field": "id",
                        "on_delete": "cascade",
                    },
                }
            )
            indexes.append({"fields": ["tenant_id"], "reason": "every query filters by tenant"})
        for name, ftype, nullable in tpl.fields:
            fields.append(
                {"id": f"{tpl.entity}-{name}", "name": name, "type": ftype, "nullable": nullable}
            )
        fields.append(
            {
                "id": f"{tpl.entity}-created",
                "name": "created_at",
                "type": "timestamp",
                "nullable": False,
            }
        )
        tenant_fields = fields
        ops.append(
            {
                "op": "put_entity",
                "entity": {
                    "id": eid,
                    "name": tpl.entity,
                    "label": tpl.label,
                    "node_id": db_node,
                    "fields": fields,
                    "indexes": indexes,
                },
            }
        )
        plural = tpl.entity + ("es" if tpl.entity.endswith(("s", "ch")) else "s")
        writable = [f for f in tenant_fields if f["name"] not in {"id", "tenant_id", "created_at"}]
        req = [
            {
                "name": f["name"],
                "type": f["type"],
                "required": not f["nullable"],
                "entity_id": eid,
                "entity_field": f["name"],
            }
            for f in writable
        ]
        resp = [
            {
                "name": f["name"],
                "type": f["type"],
                "required": not f["nullable"],
                "entity_id": eid,
                "entity_field": f["name"],
            }
            for f in fields
            if f["name"] != "tenant_id"
        ]
        auth = {"auth": "roles", "roles": role_ids} if role_ids else {"auth": "authenticated"}
        errors = [
            {"status": 401, "description": "not signed in"},
            {"status": 403, "description": "role not allowed"},
        ]
        ops += [
            {
                "op": "put_endpoint",
                "endpoint": {
                    "id": f"api-list-{tpl.entity}",
                    "method": "GET",
                    "path": f"/api/{plural}",
                    "summary": f"List {tpl.label.lower()}s",
                    "service_node_id": service_node,
                    "response_entity_id": eid,
                    "response_fields": resp,
                    "response_is_list": True,
                    "paginated": True,
                    "filters": ["q"],
                    "errors": errors,
                    **auth,
                },
            },
            {
                "op": "put_endpoint",
                "endpoint": {
                    "id": f"api-create-{tpl.entity}",
                    "method": "POST",
                    "path": f"/api/{plural}",
                    "summary": f"Create {tpl.label.lower()}",
                    "service_node_id": service_node,
                    "request_fields": req,
                    "response_entity_id": eid,
                    "response_fields": resp,
                    "errors": [*errors, {"status": 422, "description": "validation failed"}],
                    **auth,
                },
            },
            {
                "op": "put_endpoint",
                "endpoint": {
                    "id": f"api-get-{tpl.entity}",
                    "method": "GET",
                    "path": f"/api/{plural}/{{id}}",
                    "summary": f"Get one {tpl.label.lower()}",
                    "service_node_id": service_node,
                    "response_entity_id": eid,
                    "response_fields": resp,
                    "errors": [*errors, {"status": 404, "description": "not found"}],
                    **auth,
                },
            },
        ]
    return ops

"""Schema migration for stored and imported documents.

Rules: documents carry ``schema_version``. Older versions are upgraded step by step
by pure functions registered in ``_UPGRADES``; newer (unknown) versions are rejected
rather than guessed at. Version 1 is the first published version, so the table is
empty; a missing ``schema_version`` is treated as 1 for hand-written files.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from .architecture import CURRENT_SCHEMA_VERSION

Upgrade = Callable[[dict[str, Any]], dict[str, Any]]

# from_version -> function producing a from_version + 1 document
_UPGRADES: dict[int, Upgrade] = {}


class SchemaMigrationError(ValueError):
    """The document's schema version cannot be migrated to the current one."""


def migrate_document(raw: Any) -> dict[str, Any]:
    """Return ``raw`` upgraded to :data:`CURRENT_SCHEMA_VERSION` (not yet validated)."""
    if not isinstance(raw, dict):
        raise SchemaMigrationError("architecture document must be a JSON object")
    doc = dict(raw)
    version = doc.get("schema_version", 1)
    if not isinstance(version, int) or isinstance(version, bool):
        raise SchemaMigrationError("schema_version must be an integer")
    if version > CURRENT_SCHEMA_VERSION:
        raise SchemaMigrationError(
            f"schema_version {version} is newer than this server supports "
            f"({CURRENT_SCHEMA_VERSION}); upgrade ArchitectFlow"
        )
    if version < 1:
        raise SchemaMigrationError(f"schema_version {version} is not a valid version")
    while version < CURRENT_SCHEMA_VERSION:
        upgrade = _UPGRADES.get(version)
        if upgrade is None:
            raise SchemaMigrationError(f"no upgrade path from schema_version {version}")
        doc = upgrade(doc)
        version += 1
        doc["schema_version"] = version
    doc["schema_version"] = version
    return doc

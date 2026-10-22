"""Revision and audit helpers shared by routes. Callers commit."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import AuditEvent, Project, Revision, utcnow
from .schema import ArchitectureDocument
from .validation import DocumentInvalid, parse_document

REVISION_SOURCES = {
    "create",
    "manual",
    "autosave",
    "import",
    "ai_changeset",
    "restore",
    "duplicate",
}


def audit(
    db: Session,
    action: str,
    *,
    user_id: uuid.UUID | None,
    project_id: uuid.UUID | None = None,
    **details: Any,
) -> None:
    db.add(AuditEvent(action=action, user_id=user_id, project_id=project_id, details=details))


def lock_project(db: Session, project_id: uuid.UUID, owner_id: uuid.UUID) -> Project:
    project = db.scalars(
        select(Project)
        .where(Project.id == project_id, Project.owner_id == owner_id)
        .with_for_update()
    ).first()
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found.")
    return project


def head_document(db: Session, project: Project) -> tuple[Revision, ArchitectureDocument]:
    rev = get_revision(db, project.id, project.head_revision)
    return rev, ArchitectureDocument.model_validate(rev.document)


def get_revision(db: Session, project_id: uuid.UUID, number: int) -> Revision:
    rev = db.scalars(
        select(Revision).where(Revision.project_id == project_id, Revision.number == number)
    ).first()
    if rev is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Revision {number} not found.")
    return rev


def validated(raw: Any) -> ArchitectureDocument:
    """Parse untrusted document JSON or raise a 422 with field-level errors."""
    try:
        return parse_document(raw)
    except DocumentInvalid as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            {
                "message": "The architecture document is invalid; nothing was saved.",
                "errors": exc.errors,
            },
        ) from exc


def append_revision(
    db: Session,
    project: Project,
    doc: ArchitectureDocument,
    *,
    source: str,
    author_id: uuid.UUID | None,
    message: str = "",
    base_revision: int | None,
) -> Revision:
    """Store ``doc`` as the next immutable revision of a *locked* project.

    ``base_revision`` is the head the client edited; if someone saved since, the
    request is rejected with 409 so the client can show a conflict instead of
    silently overwriting newer work.
    """
    if source not in REVISION_SOURCES:
        raise ValueError(f"unknown revision source {source}")
    if base_revision is not None and base_revision != project.head_revision:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {
                "message": "This project changed since you loaded it.",
                "head_revision": project.head_revision,
                "your_base_revision": base_revision,
            },
        )
    number = project.head_revision + 1
    rev = Revision(
        project_id=project.id,
        number=number,
        document=doc.model_dump(mode="json"),
        source=source,
        message=message[:500],
        author_id=author_id,
    )
    db.add(rev)
    project.head_revision = number
    project.updated_at = utcnow()
    return rev

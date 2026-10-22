"""Projects, documents, revisions and validation."""

from __future__ import annotations

import uuid
from typing import Annotated, Any, Literal

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from ..deps import DB, CurrentPrincipal, OwnedProject
from ..models import AuditEvent, Project, Revision
from ..schema import ArchitectureDocument
from ..services import (
    append_revision,
    audit,
    get_revision,
    head_document,
    lock_project,
    validated,
)
from ..validation import run_validation

router = APIRouter(prefix="/api/projects", tags=["projects"])

Name = Annotated[str, Field(min_length=1, max_length=200)]


class ProjectCreate(BaseModel):
    name: Name
    description: Annotated[str, Field(max_length=4000)] = ""


class ProjectPatch(BaseModel):
    name: Name | None = None
    description: Annotated[str, Field(max_length=4000)] | None = None
    archived: bool | None = None


class DocumentSave(BaseModel):
    base_revision: int
    document: dict[str, Any]
    source: Literal["manual", "autosave", "import"] = "manual"
    message: Annotated[str, Field(max_length=500)] = ""


class RestoreBody(BaseModel):
    base_revision: int


def project_out(p: Project) -> dict[str, Any]:
    return {
        "id": str(p.id),
        "name": p.name,
        "description": p.description,
        "head_revision": p.head_revision,
        "archived": p.archived,
        "created_at": p.created_at.isoformat(),
        "updated_at": p.updated_at.isoformat(),
    }


def revision_out(r: Revision, *, with_document: bool = False) -> dict[str, Any]:
    out: dict[str, Any] = {
        "number": r.number,
        "source": r.source,
        "message": r.message,
        "created_at": r.created_at.isoformat(),
    }
    if with_document:
        out["document"] = r.document
    return out


@router.get("")
def list_projects(
    principal: CurrentPrincipal, db: DB, q: str = "", archived: bool = False
) -> list[dict[str, Any]]:
    stmt = select(Project).where(
        Project.owner_id == principal.user.id, Project.archived == archived
    )
    if q:
        stmt = stmt.where(func.lower(Project.name).contains(q.lower()[:200]))
    return [project_out(p) for p in db.scalars(stmt.order_by(Project.updated_at.desc()))]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_project(body: ProjectCreate, principal: CurrentPrincipal, db: DB) -> dict[str, Any]:
    project = Project(
        owner_id=principal.user.id, name=body.name.strip(), description=body.description
    )
    db.add(project)
    db.flush()
    append_revision(
        db,
        project,
        ArchitectureDocument(),
        source="create",
        author_id=principal.user.id,
        message="Project created",
        base_revision=None,
    )
    audit(db, "project.create", user_id=principal.user.id, project_id=project.id)
    db.commit()
    return project_out(project)


@router.get("/{project_id}")
def get_project(project: OwnedProject, db: DB) -> dict[str, Any]:
    rev, _ = head_document(db, project)
    return {**project_out(project), "document": rev.document}


@router.patch("/{project_id}")
def update_project(
    project_id: uuid.UUID, body: ProjectPatch, principal: CurrentPrincipal, db: DB
) -> dict[str, Any]:
    project = lock_project(db, project_id, principal.user.id)
    changes = body.model_dump(exclude_none=True)
    if "name" in changes:
        project.name = changes["name"].strip()
    if "description" in changes:
        project.description = changes["description"]
    if "archived" in changes:
        project.archived = changes["archived"]
    audit(
        db,
        "project.update",
        user_id=principal.user.id,
        project_id=project.id,
        fields=sorted(changes),
    )
    db.commit()
    return project_out(project)


@router.post("/{project_id}/duplicate", status_code=status.HTTP_201_CREATED)
def duplicate_project(project: OwnedProject, principal: CurrentPrincipal, db: DB) -> dict[str, Any]:
    _, doc = head_document(db, project)
    copy = Project(
        owner_id=principal.user.id,
        name=f"{project.name} (copy)"[:200],
        description=project.description,
    )
    db.add(copy)
    db.flush()
    append_revision(
        db,
        copy,
        doc,
        source="duplicate",
        author_id=principal.user.id,
        message=f"Duplicated from revision {project.head_revision}",
        base_revision=None,
    )
    audit(
        db,
        "project.duplicate",
        user_id=principal.user.id,
        project_id=copy.id,
        source_project=str(project.id),
    )
    db.commit()
    return project_out(copy)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project: OwnedProject, principal: CurrentPrincipal, db: DB) -> None:
    audit(
        db,
        "project.delete",
        user_id=principal.user.id,
        project_id=None,
        deleted_project=str(project.id),
        name=project.name,
    )
    db.delete(project)
    db.commit()


@router.put("/{project_id}/document")
def save_document(
    project_id: uuid.UUID, body: DocumentSave, principal: CurrentPrincipal, db: DB
) -> dict[str, Any]:
    doc = validated(body.document)
    project = lock_project(db, project_id, principal.user.id)
    ensure_not_archived(project)
    rev = append_revision(
        db,
        project,
        doc,
        source=body.source,
        author_id=principal.user.id,
        message=body.message,
        base_revision=body.base_revision,
    )
    if body.source != "autosave":
        audit(
            db,
            f"document.{body.source}",
            user_id=principal.user.id,
            project_id=project.id,
            revision=rev.number,
        )
    db.commit()
    return {"head_revision": rev.number, "saved_at": rev.created_at.isoformat()}


@router.post("/{project_id}/validate-document")
def validate_document(project: OwnedProject, body: dict[str, Any]) -> dict[str, Any]:
    """Check an unsaved document (e.g. an import) without storing it."""
    doc = validated(body)
    return {
        "valid": True,
        "findings": [f.model_dump() for f in run_validation(doc)],
        "nodes": len(doc.nodes),
        "edges": len(doc.edges),
    }


@router.get("/{project_id}/revisions")
def list_revisions(
    project: OwnedProject, db: DB, limit: Annotated[int, Query(ge=1, le=500)] = 100
) -> list[dict[str, Any]]:
    revs = db.scalars(
        select(Revision)
        .where(Revision.project_id == project.id)
        .order_by(Revision.number.desc())
        .limit(limit)
    )
    return [revision_out(r) for r in revs]


@router.get("/{project_id}/revisions/{number}")
def read_revision(project: OwnedProject, number: int, db: DB) -> dict[str, Any]:
    return revision_out(get_revision(db, project.id, number), with_document=True)


@router.post("/{project_id}/revisions/{number}/restore")
def restore_revision(
    project_id: uuid.UUID, number: int, body: RestoreBody, principal: CurrentPrincipal, db: DB
) -> dict[str, Any]:
    project = lock_project(db, project_id, principal.user.id)
    old = get_revision(db, project.id, number)
    doc = validated(old.document)
    rev = append_revision(
        db,
        project,
        doc,
        source="restore",
        author_id=principal.user.id,
        message=f"Restored revision {number}",
        base_revision=body.base_revision,
    )
    audit(
        db,
        "revision.restore",
        user_id=principal.user.id,
        project_id=project.id,
        restored=number,
        revision=rev.number,
    )
    db.commit()
    return {"head_revision": rev.number, "document": rev.document}


@router.get("/{project_id}/findings")
def findings(project: OwnedProject, db: DB, revision: int | None = None) -> dict[str, Any]:
    number = revision if revision is not None else project.head_revision
    doc = ArchitectureDocument.model_validate(get_revision(db, project.id, number).document)
    results = run_validation(doc)
    return {
        "revision": number,
        "findings": [f.model_dump() for f in results],
        "counts": {
            sev: sum(1 for f in results if f.severity == sev)
            for sev in ("error", "warning", "info")
        },
    }


@router.get("/{project_id}/audit")
def audit_log(project: OwnedProject, db: DB) -> list[dict[str, Any]]:
    events = db.scalars(
        select(AuditEvent)
        .where(AuditEvent.project_id == project.id)
        .order_by(AuditEvent.created_at.desc())
        .limit(200)
    )
    return [
        {"action": e.action, "details": e.details, "created_at": e.created_at.isoformat()}
        for e in events
    ]


def ensure_not_archived(project: Project) -> None:
    if project.archived:
        raise HTTPException(status.HTTP_409_CONFLICT, "Unarchive the project to edit it.")

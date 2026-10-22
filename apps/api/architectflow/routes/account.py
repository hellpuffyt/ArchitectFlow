"""Personal data export and account deletion."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from ..deps import DB, SESSION_COOKIE, CurrentPrincipal
from ..models import GeneratedPrompt, Project, Revision
from ..security import verify_password

router = APIRouter(prefix="/api/account", tags=["account"])


class DeleteAccount(BaseModel):
    password: Annotated[str, Field(min_length=1, max_length=256)]


@router.get("/export")
def export_account(principal: CurrentPrincipal, db: DB) -> dict[str, Any]:
    """Everything stored for the signed-in user (projects, all revisions, prompts)."""
    projects = []
    for p in db.scalars(select(Project).where(Project.owner_id == principal.user.id)):
        revs = db.scalars(
            select(Revision).where(Revision.project_id == p.id).order_by(Revision.number)
        )
        prompts = db.scalars(select(GeneratedPrompt).where(GeneratedPrompt.project_id == p.id))
        projects.append(
            {
                "id": str(p.id),
                "name": p.name,
                "description": p.description,
                "archived": p.archived,
                "created_at": p.created_at.isoformat(),
                "revisions": [
                    {
                        "number": r.number,
                        "source": r.source,
                        "message": r.message,
                        "created_at": r.created_at.isoformat(),
                        "document": r.document,
                    }
                    for r in revs
                ],
                "prompts": [
                    {
                        "version": g.version,
                        "source_revision": g.source_revision,
                        "mode": g.template,
                        "content": g.content,
                        "created_at": g.created_at.isoformat(),
                    }
                    for g in prompts
                ],
            }
        )
    return {
        "format": "architectflow-account-export",
        "version": 1,
        "user": {
            "email": principal.user.email,
            "created_at": principal.user.created_at.isoformat(),
        },
        "projects": projects,
    }


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    body: DeleteAccount, principal: CurrentPrincipal, response: Response, db: DB
) -> None:
    """Permanently delete the user and (by cascade) all projects, revisions and links."""
    if not verify_password(principal.user.password_hash, body.password):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Password is incorrect.")
    db.delete(principal.user)
    db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")

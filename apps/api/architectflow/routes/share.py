"""Read-only share links: random 256-bit tokens, stored hashed, expiring and revocable."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from ..deps import DB, CurrentPrincipal, OwnedProject
from ..models import Project, ShareLink
from ..security import RateLimiter, new_token, token_hash
from ..services import audit, get_revision

router = APIRouter(tags=["share"])
_lookup_limiter = RateLimiter(120)


class ShareCreate(BaseModel):
    expires_in_hours: Annotated[int, Field(ge=1, le=24 * 30)] = 72


def _out(link: ShareLink) -> dict[str, Any]:
    now = datetime.now(UTC)
    state = "revoked" if link.revoked_at else "expired" if link.expires_at <= now else "active"
    return {
        "id": str(link.id),
        "created_at": link.created_at.isoformat(),
        "expires_at": link.expires_at.isoformat(),
        "state": state,
    }


@router.post("/api/projects/{project_id}/shares", status_code=status.HTTP_201_CREATED)
def create_share(
    project: OwnedProject, body: ShareCreate, principal: CurrentPrincipal, db: DB
) -> dict[str, Any]:
    token = new_token()
    link = ShareLink(
        project_id=project.id,
        token_hash=token_hash(token),
        expires_at=datetime.now(UTC) + timedelta(hours=body.expires_in_hours),
    )
    db.add(link)
    audit(
        db,
        "share.create",
        user_id=principal.user.id,
        project_id=project.id,
        expires_in_hours=body.expires_in_hours,
    )
    db.commit()
    # The raw token is returned exactly once; only its hash is stored.
    return {**_out(link), "token": token, "path": f"/share/{token}"}


@router.get("/api/projects/{project_id}/shares")
def list_shares(project: OwnedProject, db: DB) -> list[dict[str, Any]]:
    rows = db.scalars(
        select(ShareLink)
        .where(ShareLink.project_id == project.id)
        .order_by(ShareLink.created_at.desc())
    )
    return [_out(r) for r in rows]


@router.delete(
    "/api/projects/{project_id}/shares/{share_id}", status_code=status.HTTP_204_NO_CONTENT
)
def revoke_share(
    project: OwnedProject, share_id: uuid.UUID, principal: CurrentPrincipal, db: DB
) -> None:
    link = db.scalars(
        select(ShareLink).where(ShareLink.id == share_id, ShareLink.project_id == project.id)
    ).first()
    if link is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Share link not found.")
    if link.revoked_at is None:
        link.revoked_at = datetime.now(UTC)
        audit(
            db, "share.revoke", user_id=principal.user.id, project_id=project.id, share=str(link.id)
        )
        db.commit()


@router.get("/api/shared/{token}")
def read_shared(token: str, request: Request, db: DB) -> dict[str, Any]:
    client = request.client.host if request.client else "unknown"
    if not _lookup_limiter.allow(client):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many requests.")
    missing = HTTPException(
        status.HTTP_404_NOT_FOUND, "This link is invalid, expired or has been revoked."
    )
    if len(token) > 128:
        raise missing
    link = db.scalars(select(ShareLink).where(ShareLink.token_hash == token_hash(token))).first()
    if link is None or link.revoked_at is not None or link.expires_at <= datetime.now(UTC):
        raise missing
    project = db.get(Project, link.project_id)
    if project is None:
        raise missing
    rev = get_revision(db, project.id, project.head_revision)
    return {
        "name": project.name,
        "revision": rev.number,
        "document": rev.document,
        "read_only": True,
        "expires_at": link.expires_at.isoformat(),
    }

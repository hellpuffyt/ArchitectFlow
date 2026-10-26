"""Export endpoints (owner only; never reachable through share links)."""

from __future__ import annotations

import re
from typing import Any

from fastapi import APIRouter, HTTPException, Response, status

from ..config import get_settings
from ..deps import DB, CurrentPrincipal, OwnedProject
from ..exports import FORMATS, render
from ..ratelimit import RateLimiter
from ..schema import ArchitectureDocument
from ..services import audit, get_revision

router = APIRouter(prefix="/api/projects/{project_id}/exports", tags=["exports"])
_limiter = RateLimiter("export", get_settings().exports_per_minute)


@router.get("")
def list_formats(project: OwnedProject) -> list[dict[str, Any]]:
    return [
        {"key": f.key, "label": f.label, "extension": f.extension, "round_trip": f.round_trip}
        for f in FORMATS.values()
    ]


@router.get("/{fmt}")
def export(
    project: OwnedProject,
    fmt: str,
    principal: CurrentPrincipal,
    db: DB,
    revision: int | None = None,
) -> Response:
    spec = FORMATS.get(fmt)
    if spec is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown export format '{fmt}'.")
    if not _limiter.allow(str(principal.user.id)):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Export limit reached; wait.")
    number = revision if revision is not None else project.head_revision
    doc = ArchitectureDocument.model_validate(get_revision(db, project.id, number).document)
    body = render(fmt, doc, project.name, number)
    audit(
        db,
        "project.export",
        user_id=principal.user.id,
        project_id=project.id,
        format=fmt,
        revision=number,
    )
    db.commit()
    slug = re.sub(r"[^A-Za-z0-9-]+", "-", project.name).strip("-")[:60] or "project"
    filename = f"{slug}-r{number}.{spec.extension}"
    return Response(
        body,
        media_type=f"{spec.media_type}; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-ArchitectFlow-Revision": str(number),
        },
    )

"""Generated implementation prompts (derived artifacts tied to a revision)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, status
from sqlalchemy import func, select

from ..deps import DB, CurrentPrincipal, OwnedProject
from ..models import GeneratedPrompt, Project
from ..prompts import generate_prompt
from ..schema import PromptSettings
from ..services import audit, get_revision, head_document

router = APIRouter(prefix="/api/projects/{project_id}/prompts", tags=["prompts"])


def _outdated(db: DB, project: Project, p: GeneratedPrompt, head_doc: dict[str, Any]) -> bool:
    if p.source_revision == project.head_revision:
        return False
    source = get_revision(db, project.id, p.source_revision).document
    strip = {"viewport", "prompt_settings"}
    return {k: v for k, v in source.items() if k not in strip} != {
        k: v for k, v in head_doc.items() if k not in strip
    }


def prompt_out(p: GeneratedPrompt, outdated: bool, head: int) -> dict[str, Any]:
    return {
        "id": str(p.id),
        "version": p.version,
        "source_revision": p.source_revision,
        "mode": p.template,
        "sections": p.sections,
        "content": p.content,
        "characters": len(p.content),
        "words": len(p.content.split()),
        "approx_tokens": max(1, len(p.content) // 4),
        "created_at": p.created_at.isoformat(),
        "outdated": outdated,
        "head_revision": head,
    }


@router.post("", status_code=status.HTTP_201_CREATED)
def create_prompt(
    project: OwnedProject, settings: PromptSettings, principal: CurrentPrincipal, db: DB
) -> dict[str, Any]:
    """Generate from the project's *current saved* revision (never from client state)."""
    rev, doc = head_document(db, project)
    content = generate_prompt(doc, rev.number, project.name, settings)
    version = (
        db.scalar(
            select(func.max(GeneratedPrompt.version)).where(
                GeneratedPrompt.project_id == project.id
            )
        )
        or 0
    ) + 1
    p = GeneratedPrompt(
        project_id=project.id,
        version=version,
        source_revision=rev.number,
        template=f"{settings.mode}/{settings.preset}",
        sections=list(settings.sections),
        content=content,
    )
    db.add(p)
    audit(
        db,
        "prompt.generate",
        user_id=principal.user.id,
        project_id=project.id,
        version=version,
        revision=rev.number,
        mode=settings.mode,
    )
    db.commit()
    return prompt_out(p, False, rev.number)


@router.post("/preview")
def preview_prompt(project: OwnedProject, settings: PromptSettings, db: DB) -> dict[str, Any]:
    """Live preview from the current saved revision; nothing is stored."""
    rev, doc = head_document(db, project)
    content = generate_prompt(doc, rev.number, project.name, settings)
    return {
        "source_revision": rev.number,
        "content": content,
        "characters": len(content),
        "words": len(content.split()),
        "approx_tokens": max(1, len(content) // 4),
    }


@router.get("")
def list_prompts(project: OwnedProject, db: DB) -> list[dict[str, Any]]:
    head_rev, _ = head_document(db, project)
    rows = db.scalars(
        select(GeneratedPrompt)
        .where(GeneratedPrompt.project_id == project.id)
        .order_by(GeneratedPrompt.version.desc())
        .limit(50)
    )
    return [
        prompt_out(p, _outdated(db, project, p, head_rev.document), project.head_revision)
        for p in rows
    ]

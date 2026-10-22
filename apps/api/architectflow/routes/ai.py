"""AI proposals as reviewable change sets."""

from __future__ import annotations

import uuid
from typing import Annotated, Any, Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from ..ai import (
    AnthropicProvider,
    ChangeSetInvalid,
    ExampleProvider,
    OpenAICompatibleProvider,
    ProviderError,
    apply_operations,
    parse_operations,
    summarize,
)
from ..ai.base import AIProvider
from ..config import get_settings
from ..deps import DB, CurrentPrincipal, OwnedProject
from ..models import ChangeSet
from ..security import RateLimiter
from ..services import append_revision, audit, head_document, lock_project
from ..validation import run_validation
from .projects import ensure_not_archived

router = APIRouter(prefix="/api/projects/{project_id}", tags=["ai"])
_ai_limiter = RateLimiter(get_settings().ai_requests_per_minute)


def get_provider() -> AIProvider:
    s = get_settings()
    if s.ai_provider == "example" or s.ai_api_key is None:
        return ExampleProvider()
    key = s.ai_api_key.get_secret_value()
    if s.ai_provider == "anthropic":
        return AnthropicProvider(
            api_key=key,
            model=s.ai_model or "claude-sonnet-5",
            base_url=s.ai_base_url or "https://api.anthropic.com",
            timeout=s.ai_timeout_seconds,
        )
    return OpenAICompatibleProvider(
        api_key=key,
        model=s.ai_model or "gpt-4o-mini",
        base_url=s.ai_base_url or "https://api.openai.com/v1",
        timeout=s.ai_timeout_seconds,
    )


class GenerateBody(BaseModel):
    vision: Annotated[str, Field(min_length=10, max_length=4000)]
    base_revision: int


class EditBody(BaseModel):
    request: Annotated[str, Field(min_length=3, max_length=2000)]
    base_revision: int


class ApplyBody(BaseModel):
    confirm_large: bool = False


def changeset_out(cs: ChangeSet) -> dict[str, Any]:
    return {
        "id": str(cs.id),
        "kind": cs.kind,
        "request": cs.request,
        "provider": cs.provider,
        "mode": cs.mode,
        "explanation": cs.explanation,
        "questions": cs.questions,
        "operations": cs.operations,
        "summary": cs.summary,
        "findings": cs.findings,
        "status": cs.status,
        "base_revision": cs.base_revision,
        "applied_revision": cs.applied_revision,
        "created_at": cs.created_at.isoformat(),
    }


async def _propose(
    kind: Literal["generate", "edit"],
    text: str,
    base_revision: int,
    project_id: uuid.UUID,
    principal: CurrentPrincipal,
    db: DB,
) -> dict[str, Any]:
    if not _ai_limiter.allow(str(principal.user.id)):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "AI request limit reached; wait a minute and try again.",
        )
    project = lock_project(db, project_id, principal.user.id)
    ensure_not_archived(project)
    if base_revision != project.head_revision:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {
                "message": "Save or reload before asking for changes; the design changed.",
                "head_revision": project.head_revision,
            },
        )
    _, doc = head_document(db, project)
    db.rollback()  # release the row lock while the provider runs
    provider = get_provider()
    try:
        if kind == "generate":
            result = await provider.propose_architecture(text, doc)
        else:
            result = await provider.propose_edit(text, doc)
    except ProviderError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            {
                "message": f"The AI provider failed: {exc}. Your design was not changed.",
                "provider": provider.name,
            },
        ) from exc
    try:
        ops = parse_operations(result.operations)
        proposed = apply_operations(doc, ops)
    except ChangeSetInvalid as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            {
                "message": "The proposal was rejected by validation; nothing was changed.",
                "errors": exc.errors,
                "provider": provider.name,
            },
        ) from exc
    summary = summarize(doc, ops)
    findings = [f.model_dump() for f in run_validation(proposed)]
    cs = ChangeSet(
        project_id=project_id,
        base_revision=base_revision,
        kind=kind,
        request=text,
        provider=provider.name,
        mode=provider.mode,
        explanation=result.explanation,
        questions=result.questions,
        operations=[o.model_dump(mode="json") for o in ops],
        summary=summary.model_dump(),
        findings=findings,
    )
    db.add(cs)
    audit(
        db,
        f"ai.{kind}",
        user_id=principal.user.id,
        project_id=project_id,
        provider=provider.name,
        mode=provider.mode,
        operations=len(ops),
    )
    db.commit()
    return changeset_out(cs)


@router.post("/ai/generate", status_code=status.HTTP_201_CREATED)
async def generate(
    project_id: uuid.UUID, body: GenerateBody, principal: CurrentPrincipal, db: DB
) -> dict[str, Any]:
    return await _propose("generate", body.vision, body.base_revision, project_id, principal, db)


@router.post("/ai/edit", status_code=status.HTTP_201_CREATED)
async def edit(
    project_id: uuid.UUID, body: EditBody, principal: CurrentPrincipal, db: DB
) -> dict[str, Any]:
    return await _propose("edit", body.request, body.base_revision, project_id, principal, db)


def _load(db: DB, project_id: uuid.UUID, cs_id: uuid.UUID) -> ChangeSet:
    cs = db.scalars(
        select(ChangeSet).where(ChangeSet.id == cs_id, ChangeSet.project_id == project_id)
    ).first()
    if cs is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Change set not found.")
    return cs


@router.get("/changesets")
def list_changesets(project: OwnedProject, db: DB) -> list[dict[str, Any]]:
    rows = db.scalars(
        select(ChangeSet)
        .where(ChangeSet.project_id == project.id)
        .order_by(ChangeSet.created_at.desc())
        .limit(50)
    )
    return [changeset_out(c) for c in rows]


@router.get("/changesets/{cs_id}")
def get_changeset(project: OwnedProject, cs_id: uuid.UUID, db: DB) -> dict[str, Any]:
    return changeset_out(_load(db, project.id, cs_id))


@router.post("/changesets/{cs_id}/apply")
def apply_changeset(
    project_id: uuid.UUID, cs_id: uuid.UUID, body: ApplyBody, principal: CurrentPrincipal, db: DB
) -> dict[str, Any]:
    project = lock_project(db, project_id, principal.user.id)
    ensure_not_archived(project)
    cs = _load(db, project.id, cs_id)
    if cs.status != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, f"Change set is already {cs.status}.")
    if cs.base_revision != project.head_revision:
        cs.status = "stale"
        db.commit()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {
                "message": "The design changed after this proposal was made; ask again.",
                "head_revision": project.head_revision,
            },
        )
    if cs.summary.get("large") and not body.confirm_large:
        raise HTTPException(
            status.HTTP_428_PRECONDITION_REQUIRED,
            "This change removes a large part of the design; confirm to apply.",
        )
    _, doc = head_document(db, project)
    try:
        new_doc = apply_operations(doc, parse_operations(cs.operations))
    except ChangeSetInvalid as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            {"message": "Change set no longer applies.", "errors": exc.errors},
        ) from exc
    rev = append_revision(
        db,
        project,
        new_doc,
        source="ai_changeset",
        author_id=principal.user.id,
        message=f"Applied {cs.kind} ({cs.mode}): {cs.request[:200]}",
        base_revision=cs.base_revision,
    )
    cs.status = "applied"
    cs.applied_revision = rev.number
    audit(
        db,
        "changeset.apply",
        user_id=principal.user.id,
        project_id=project.id,
        changeset=str(cs.id),
        revision=rev.number,
    )
    db.commit()
    return {"head_revision": rev.number, "document": rev.document, "changeset": changeset_out(cs)}


@router.post("/changesets/{cs_id}/reject")
def reject_changeset(
    project_id: uuid.UUID, cs_id: uuid.UUID, principal: CurrentPrincipal, db: DB
) -> dict[str, Any]:
    project = lock_project(db, project_id, principal.user.id)
    cs = _load(db, project.id, cs_id)
    if cs.status != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, f"Change set is already {cs.status}.")
    cs.status = "rejected"
    audit(
        db,
        "changeset.reject",
        user_id=principal.user.id,
        project_id=project.id,
        changeset=str(cs.id),
    )
    db.commit()
    return changeset_out(cs)

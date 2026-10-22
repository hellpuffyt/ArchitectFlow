"""Request dependencies: current user, CSRF enforcement, project access."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db
from .models import AuthSession, Project, User
from .security import token_hash

SESSION_COOKIE = "af_session"
CSRF_HEADER = "x-csrf-token"
_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}

DB = Annotated[Session, Depends(get_db)]


@dataclass
class Principal:
    user: User
    session: AuthSession


def _load_session(request: Request, db: Session) -> Principal | None:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    sess = db.get(AuthSession, token_hash(token))
    if sess is None or sess.expires_at <= datetime.now(UTC):
        return None
    user = db.get(User, sess.user_id)
    if user is None:
        return None
    return Principal(user=user, session=sess)


def current_principal(request: Request, db: DB) -> Principal:
    principal = _load_session(request, db)
    if principal is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in to continue.")
    if request.method not in _SAFE_METHODS:
        sent = request.headers.get(CSRF_HEADER, "")
        if not sent or sent != principal.session.csrf_token:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "Missing or invalid CSRF token; reload the page and retry.",
            )
    return principal


CurrentPrincipal = Annotated[Principal, Depends(current_principal)]


def owned_project(project_id: uuid.UUID, principal: CurrentPrincipal, db: DB) -> Project:
    """Return the project if the caller owns it; 404 otherwise (no existence leak)."""
    stmt = select(Project).where(Project.id == project_id, Project.owner_id == principal.user.id)
    project = db.scalars(stmt).first()
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found.")
    return project


OwnedProject = Annotated[Project, Depends(owned_project)]

"""Sign-up, login, logout and the current-user endpoint."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError

from ..ai.base import EXAMPLE_MODE_NOTICE
from ..config import get_settings
from ..deps import DB, SESSION_COOKIE, CurrentPrincipal
from ..models import AuthSession, User
from ..security import RateLimiter, hash_password, new_token, token_hash, verify_password
from ..services import audit

router = APIRouter(prefix="/api/auth", tags=["auth"])
_login_limiter = RateLimiter(get_settings().login_attempts_per_minute)


class Credentials(BaseModel):
    email: EmailStr
    password: Annotated[str, Field(min_length=10, max_length=256)]


class LoginCredentials(BaseModel):
    email: EmailStr
    password: Annotated[str, Field(min_length=1, max_length=256)]


def ai_status() -> dict[str, str]:
    s = get_settings()
    if s.ai_provider == "example" or s.ai_api_key is None:
        return {"provider": "example", "mode": "example", "notice": EXAMPLE_MODE_NOTICE}
    return {
        "provider": s.ai_provider,
        "mode": "live",
        "notice": f"Designs you send to the assistant are processed by the configured "
        f"external provider ({s.ai_provider}, model {s.ai_model or 'default'}).",
    }


def _start_session(db: DB, response: Response, user: User) -> AuthSession:
    s = get_settings()
    token = new_token()
    sess = AuthSession(
        token_hash=token_hash(token),
        user_id=user.id,
        csrf_token=new_token(),
        expires_at=datetime.now(UTC) + timedelta(hours=s.session_ttl_hours),
    )
    db.add(sess)
    response.set_cookie(
        SESSION_COOKIE,
        token,
        httponly=True,
        samesite="lax",
        secure=s.secure_cookies,
        max_age=s.session_ttl_hours * 3600,
        path="/",
    )
    return sess


def _me(user: User, sess: AuthSession) -> dict[str, object]:
    return {
        "user": {"id": str(user.id), "email": user.email},
        "csrf_token": sess.csrf_token,
        "ai": ai_status(),
    }


@router.post("/signup", status_code=status.HTTP_201_CREATED)
def signup(body: Credentials, response: Response, db: DB) -> dict[str, object]:
    email = body.email.lower()
    if db.scalars(select(User).where(func.lower(User.email) == email)).first():
        raise HTTPException(
            status.HTTP_409_CONFLICT, "An account with this email already exists; sign in instead."
        )
    user = User(email=email, password_hash=hash_password(body.password))
    db.add(user)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "An account with this email already exists."
        ) from exc
    sess = _start_session(db, response, user)
    audit(db, "user.signup", user_id=user.id)
    db.commit()
    return _me(user, sess)


@router.post("/login")
def login(
    body: LoginCredentials, request: Request, response: Response, db: DB
) -> dict[str, object]:
    email = body.email.lower()
    client = request.client.host if request.client else "unknown"
    if not _login_limiter.allow(f"{client}|{email}"):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many sign-in attempts; wait a minute and try again.",
        )
    user = db.scalars(select(User).where(User.email == email)).first()
    if not verify_password(user.password_hash if user else None, body.password) or user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Email or password is incorrect.")
    db.execute(
        delete(AuthSession).where(
            AuthSession.user_id == user.id, AuthSession.expires_at <= datetime.now(UTC)
        )
    )
    sess = _start_session(db, response, user)
    audit(db, "user.login", user_id=user.id)
    db.commit()
    return _me(user, sess)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(principal: CurrentPrincipal, response: Response, db: DB) -> None:
    db.delete(principal.session)
    db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")


@router.get("/me")
def me(principal: CurrentPrincipal) -> dict[str, object]:
    return _me(principal.user, principal.session)

"""API integration on real PostgreSQL: design change sets, exports, shares, account."""

from __future__ import annotations

import json

from .conftest import Api
from .test_api_projects import generate_and_apply, new_project


def apply_cs(api: Api, pid: str, cs: dict) -> dict:
    r = api.post(f"/api/projects/{pid}/changesets/{cs['id']}/apply", json={})
    assert r.status_code == 200, r.text
    return r.json()


def test_pages_and_design_requests_go_through_review(api: Api, email: str) -> None:
    api.signup(email)
    pid = new_project(api)["id"]
    head = generate_and_apply(api, pid)["head_revision"]
    cs = api.post(f"/api/projects/{pid}/ai/pages", json={"base_revision": head}).json()
    assert cs["kind"] == "pages" and cs["provider"] == "page-generator"
    assert cs["status"] == "pending"
    assert api.get(f"/api/projects/{pid}").json()["document"]["design"]["pages"] == []
    applied = apply_cs(api, pid, cs)
    pages = applied["document"]["design"]["pages"]
    assert {p["route"] for p in pages} >= {"/items", "/items/new"}
    cs2 = api.post(
        f"/api/projects/{pid}/ai/design",
        json={
            "request": "premium dark SaaS dashboard with emerald accents",
            "base_revision": applied["head_revision"],
        },
    ).json()
    assert any("appearance: light → dark" in line for line in cs2["summary"]["lines"])
    assert cs2["mode"] == "example"
    doc = apply_cs(api, pid, cs2)["document"]
    theme = next(t for t in doc["design"]["themes"] if t["id"] == doc["design"]["active_theme_id"])
    assert theme["appearance"] == "dark"
    presets = api.get("/api/design/presets").json()
    assert {p["preset"] for p in presets} >= {"developer-dark", "saas-light", "high-contrast"}


def test_exports_endpoint(api: Api, email: str) -> None:
    api.signup(email)
    pid = new_project(api, "Gems & Co")["id"]
    head = generate_and_apply(api, pid)["head_revision"]
    fmts = {f["key"]: f for f in api.get(f"/api/projects/{pid}/exports").json()}
    assert fmts["json"]["round_trip"] and not fmts["mermaid"]["round_trip"]
    for key in fmts:
        r = api.get(f"/api/projects/{pid}/exports/{key}")
        assert r.status_code == 200, key
        assert r.headers["content-disposition"].startswith('attachment; filename="Gems-Co-r')
        assert r.headers["x-architectflow-revision"] == str(head)
    old = api.get(f"/api/projects/{pid}/exports/json?revision=1")
    assert json.loads(old.text)["nodes"] == []
    assert api.get(f"/api/projects/{pid}/exports/nope").status_code == 404


def test_share_links_read_only_expiring_revocable(api: Api, make_api, email: str) -> None:  # type: ignore[no-untyped-def]
    api.signup(email)
    pid = new_project(api, "Shared design")["id"]
    generate_and_apply(api, pid)
    created = api.post(f"/api/projects/{pid}/shares", json={"expires_in_hours": 1}).json()
    token = created["token"]
    assert len(token) >= 43 and created["state"] == "active"
    listed = api.get(f"/api/projects/{pid}/shares").json()
    assert "token" not in listed[0]
    anon = make_api()
    view = anon.get(f"/api/shared/{token}")
    assert view.status_code == 200 and view.json()["read_only"] is True
    assert view.json()["name"] == "Shared design"
    # A share token grants nothing on the owner API.
    assert anon.get(f"/api/projects/{pid}").status_code == 401
    assert anon.c.put(f"/api/projects/{pid}/document", json={}).status_code == 401
    assert anon.get(f"/api/shared/{token}x").status_code == 404
    assert anon.get("/api/shared/" + "a" * 200).status_code == 404
    assert api.delete(f"/api/projects/{pid}/shares/{created['id']}").status_code == 204
    assert anon.get(f"/api/shared/{token}").status_code == 404
    assert api.get(f"/api/projects/{pid}/shares").json()[0]["state"] == "revoked"
    # Expired links stop working (expire it directly in the database).
    created2 = api.post(f"/api/projects/{pid}/shares", json={}).json()
    from sqlalchemy import text as sql

    from architectflow.db import get_engine

    with get_engine().begin() as c:
        c.execute(
            sql("UPDATE share_links SET expires_at = now() - interval '1 minute' WHERE id = :i"),
            {"i": created2["id"]},
        )
    assert anon.get(f"/api/shared/{created2['token']}").status_code == 404
    # Other users cannot manage the owner's share links.
    other = make_api()
    other.signup(f"o-{email}")
    assert other.get(f"/api/projects/{pid}/shares").status_code == 404
    assert other.post(f"/api/projects/{pid}/shares", json={}).status_code == 404


def test_account_export_and_delete(api: Api, make_api, email: str) -> None:  # type: ignore[no-untyped-def]
    api.signup(email)
    pid = new_project(api, "Mine")["id"]
    generate_and_apply(api, pid)
    api.post(f"/api/projects/{pid}/prompts", json={})
    data = api.get("/api/account/export").json()
    assert data["user"]["email"] == email
    proj = data["projects"][0]
    assert proj["name"] == "Mine" and len(proj["revisions"]) == 2 and len(proj["prompts"]) == 1
    assert "password" not in json.dumps(data).lower()
    assert api.delete("/api/account", json={"password": "wrong"}).status_code == 403
    assert api.delete("/api/account", json={"password": "correct horse battery"}).status_code == 204
    assert api.get("/api/auth/me").status_code == 401
    again = make_api()
    r = again.c.post("/api/auth/login", json={"email": email, "password": "correct horse battery"})
    assert r.status_code == 401

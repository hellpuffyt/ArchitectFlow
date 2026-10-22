"""API integration tests on real PostgreSQL: projects, revisions, AI flow, prompts."""

from __future__ import annotations

import copy

from .conftest import Api
from .fixtures import JEWELLERY_VISION


def new_project(api: Api, name: str = "Jewellery SaaS") -> dict:
    r = api.post("/api/projects", json={"name": name})
    assert r.status_code == 201, r.text
    return r.json()


def generate_and_apply(api: Api, pid: str, vision: str = JEWELLERY_VISION) -> dict:
    head = api.get(f"/api/projects/{pid}").json()["head_revision"]
    cs = api.post(
        f"/api/projects/{pid}/ai/generate", json={"vision": vision, "base_revision": head}
    )
    assert cs.status_code == 201, cs.text
    body = cs.json()
    assert body["mode"] == "example"
    assert body["explanation"].startswith("Example mode — no AI provider configured")
    applied = api.post(f"/api/projects/{pid}/changesets/{body['id']}/apply", json={})
    assert applied.status_code == 200, applied.text
    return applied.json()


def test_signup_me_logout(api: Api, email: str) -> None:
    me = api.signup(email)
    assert me["user"]["email"] == email
    assert api.get("/api/auth/me").status_code == 200
    assert api.post("/api/auth/logout").status_code == 204
    assert api.get("/api/auth/me").status_code == 401


def test_duplicate_signup_and_bad_login(api: Api, make_api, email: str) -> None:
    api.signup(email)
    other = make_api()
    r = other.c.post("/api/auth/signup", json={"email": email, "password": "x" * 12})
    assert r.status_code == 409
    r = other.c.post("/api/auth/login", json={"email": email, "password": "wrong password"})
    assert r.status_code == 401
    r = other.c.post("/api/auth/login", json={"email": email, "password": "correct horse battery"})
    assert r.status_code == 200


def test_csrf_required_for_writes(api: Api, email: str) -> None:
    api.signup(email)
    r = api.c.post("/api/projects", json={"name": "x"})  # no CSRF header
    assert r.status_code == 403
    r = api.c.post("/api/projects", json={"name": "x"}, headers={"x-csrf-token": "forged"})
    assert r.status_code == 403


def test_project_crud_search_archive_duplicate_delete(api: Api, email: str) -> None:
    api.signup(email)
    a = new_project(api, "Alpha store")
    new_project(api, "Beta clinic")
    assert [p["name"] for p in api.get("/api/projects?q=alpha").json()] == ["Alpha store"]
    r = api.patch(f"/api/projects/{a['id']}", json={"name": "Alpha shop"})
    assert r.json()["name"] == "Alpha shop"
    dup = api.post(f"/api/projects/{a['id']}/duplicate").json()
    assert dup["name"] == "Alpha shop (copy)"
    api.patch(f"/api/projects/{a['id']}", json={"archived": True})
    assert a["id"] not in [p["id"] for p in api.get("/api/projects").json()]
    assert a["id"] in [p["id"] for p in api.get("/api/projects?archived=true").json()]
    assert api.delete(f"/api/projects/{dup['id']}").status_code == 204
    assert api.get(f"/api/projects/{dup['id']}").status_code == 404


def test_generate_review_apply_persists(api: Api, email: str) -> None:
    api.signup(email)
    pid = new_project(api)["id"]
    applied = generate_and_apply(api, pid)
    doc = api.get(f"/api/projects/{pid}").json()["document"]
    assert doc == applied["document"]
    assert {n["type"] for n in doc["nodes"]} >= {
        "web_client",
        "api_gateway",
        "auth_service",
        "service",
        "database",
    }
    names = {e["name"] for e in doc["database"]["entities"]}
    assert {"tenant", "item", "invoice", "branch"} <= names
    assert "post" not in names  # "PostgreSQL" must not be read as a blog-post domain
    assert any(r["status"] == "assumption" for r in doc["requirements"]["nonfunctional"])
    assert all(not a["confirmed"] for a in doc["assumptions"])


def test_save_roundtrip_identical_and_conflict(api: Api, email: str) -> None:
    api.signup(email)
    pid = new_project(api)["id"]
    applied = generate_and_apply(api, pid)
    doc, head = applied["document"], applied["head_revision"]
    doc["nodes"][0]["position"] = {"x": 999.5, "y": -12.25}
    doc["edges"].append(
        {
            "id": "e-new",
            "source": doc["nodes"][0]["id"],
            "target": doc["nodes"][1]["id"],
            "protocol": "gRPC",
            "label": "added by test",
        }
    )
    r = api.put(f"/api/projects/{pid}/document", json={"base_revision": head, "document": doc})
    assert r.status_code == 200, r.text
    saved = api.get(f"/api/projects/{pid}").json()
    assert saved["head_revision"] == head + 1
    reloaded = saved["document"]
    assert reloaded["nodes"][0]["position"] == {"x": 999.5, "y": -12.25}
    assert reloaded["edges"][-1]["protocol"] == "gRPC"
    # Stale base revision -> 409, nothing written.
    r = api.put(f"/api/projects/{pid}/document", json={"base_revision": head, "document": doc})
    assert r.status_code == 409
    assert r.json()["detail"]["head_revision"] == head + 1
    assert api.get(f"/api/projects/{pid}").json()["head_revision"] == head + 1


def test_invalid_document_rejected_with_actionable_errors(api: Api, email: str) -> None:
    api.signup(email)
    pid = new_project(api)["id"]
    bad = {
        "nodes": [{"id": "a", "type": "service", "label": "A"}],
        "edges": [{"id": "e1", "source": "a", "target": "ghost"}],
    }
    r = api.put(f"/api/projects/{pid}/document", json={"base_revision": 1, "document": bad})
    assert r.status_code == 422
    detail = r.json()["detail"]
    assert "nothing was saved" in detail["message"]
    assert any("ghost" in e["message"] for e in detail["errors"])
    r = api.put(
        f"/api/projects/{pid}/document",
        json={"base_revision": 1, "document": {"nodes": [{"id": "a"}]}},
    )
    assert r.status_code == 422
    assert any(e["path"].startswith("nodes.0") for e in r.json()["detail"]["errors"])
    r = api.put(
        f"/api/projects/{pid}/document",
        json={"base_revision": 1, "document": {"schema_version": 99}},
    )
    assert "newer than this server" in r.json()["detail"]["errors"][0]["message"]
    assert api.get(f"/api/projects/{pid}").json()["head_revision"] == 1


def test_ai_edit_is_reviewed_before_apply(api: Api, email: str) -> None:
    api.signup(email)
    pid = new_project(api)["id"]
    head = generate_and_apply(api, pid)["head_revision"]
    cs = api.post(
        f"/api/projects/{pid}/ai/edit",
        json={"request": "add a redis cache for Core API", "base_revision": head},
    )
    assert cs.status_code == 201, cs.text
    body = cs.json()
    assert body["status"] == "pending"
    assert any("Cache" in line for line in body["summary"]["lines"])
    # Not applied yet: head unchanged and no cache in the saved design.
    saved = api.get(f"/api/projects/{pid}").json()
    assert saved["head_revision"] == head
    assert not any(n["type"] == "cache" for n in saved["document"]["nodes"])
    r = api.post(f"/api/projects/{pid}/changesets/{body['id']}/reject")
    assert r.json()["status"] == "rejected"
    assert (
        api.post(f"/api/projects/{pid}/changesets/{body['id']}/apply", json={}).status_code == 409
    )
    # Unknown request: honest no-op proposal.
    r = api.post(
        f"/api/projects/{pid}/ai/edit",
        json={"request": "make it better somehow", "base_revision": head},
    )
    assert r.json()["operations"] == [] and "Nothing was changed" in r.json()["explanation"]


def test_changeset_goes_stale_when_design_changes(api: Api, email: str) -> None:
    api.signup(email)
    pid = new_project(api)["id"]
    applied = generate_and_apply(api, pid)
    head = applied["head_revision"]
    cs = api.post(
        f"/api/projects/{pid}/ai/edit", json={"request": "add monitoring", "base_revision": head}
    ).json()
    api.put(
        f"/api/projects/{pid}/document",
        json={"base_revision": head, "document": applied["document"]},
    )
    r = api.post(f"/api/projects/{pid}/changesets/{cs['id']}/apply", json={})
    assert r.status_code == 409
    assert api.get(f"/api/projects/{pid}/changesets/{cs['id']}").json()["status"] == "stale"


def test_regenerating_over_a_design_requires_confirmation(api: Api, email: str) -> None:
    api.signup(email)
    pid = new_project(api)["id"]
    head = generate_and_apply(api, pid)["head_revision"]
    cs = api.post(
        f"/api/projects/{pid}/ai/generate",
        json={"vision": "A simple blog where authors can publish posts.", "base_revision": head},
    ).json()
    assert cs["summary"]["large"] is True
    r = api.post(f"/api/projects/{pid}/changesets/{cs['id']}/apply", json={})
    assert r.status_code == 428
    r = api.post(f"/api/projects/{pid}/changesets/{cs['id']}/apply", json={"confirm_large": True})
    assert r.status_code == 200


def test_prompt_reflects_current_saved_revision(api: Api, email: str) -> None:
    api.signup(email)
    pid = new_project(api)["id"]
    applied = generate_and_apply(api, pid)
    first = api.post(f"/api/projects/{pid}/prompts", json={}).json()
    assert first["source_revision"] == applied["head_revision"]
    assert "Core API" in first["content"] and "`invoice`" in first["content"]
    assert "[ASSUMPTION]" in first["content"] and "[UNRESOLVED]" in first["content"]
    # Edit the saved design: rename a component and add one.
    doc = applied["document"]
    for n in doc["nodes"]:
        if n["id"] == "core-api":
            n["label"] = "Ledger Service"
    doc["nodes"].append(
        {
            "id": "search",
            "type": "search_index",
            "label": "Catalogue Search",
            "technology": "OpenSearch",
        }
    )
    r = api.put(
        f"/api/projects/{pid}/document",
        json={"base_revision": applied["head_revision"], "document": doc},
    )
    new_head = r.json()["head_revision"]
    listed = api.get(f"/api/projects/{pid}/prompts").json()
    assert listed[0]["outdated"] is True
    second = api.post(f"/api/projects/{pid}/prompts", json={}).json()
    assert second["source_revision"] == new_head
    assert second["version"] == first["version"] + 1
    assert "Ledger Service" in second["content"] and "Core API" not in second["content"]
    assert "Catalogue Search" in second["content"]
    assert api.get(f"/api/projects/{pid}/prompts").json()[0]["outdated"] is False
    preview = api.post(
        f"/api/projects/{pid}/prompts/preview", json={"mode": "database", "preset": "generic_agent"}
    ).json()
    assert "## Data model" in preview["content"] and "## Components" not in preview["content"]


def test_version_history_restore(api: Api, email: str) -> None:
    api.signup(email)
    pid = new_project(api)["id"]
    applied = generate_and_apply(api, pid)
    good = applied["head_revision"]
    doc = copy.deepcopy(applied["document"])
    doc["nodes"] = [n for n in doc["nodes"] if n["id"] != "db"]
    doc["edges"] = [e for e in doc["edges"] if "db" not in (e["source"], e["target"])]
    doc["database"]["entities"] = []
    doc["api"]["endpoints"] = [
        e for e in doc["api"]["endpoints"] if e.get("response_entity_id") is None
    ]
    r = api.put(f"/api/projects/{pid}/document", json={"base_revision": good, "document": doc})
    assert r.status_code == 200, r.text
    bad_head = r.json()["head_revision"]
    revs = api.get(f"/api/projects/{pid}/revisions").json()
    assert [x["number"] for x in revs][:2] == [bad_head, good]
    r = api.post(f"/api/projects/{pid}/revisions/{good}/restore", json={"base_revision": bad_head})
    assert r.status_code == 200
    restored = api.get(f"/api/projects/{pid}").json()
    assert restored["head_revision"] == bad_head + 1
    assert any(n["id"] == "db" for n in restored["document"]["nodes"])
    assert restored["document"] == applied["document"]


def test_findings_from_saved_data(api: Api, email: str) -> None:
    api.signup(email)
    pid = new_project(api)["id"]
    doc = {
        "nodes": [
            {"id": "w", "type": "web_client", "label": "Web"},
            {"id": "db", "type": "database", "label": "Orders DB", "public": True},
        ],
        "edges": [{"id": "e1", "source": "w", "target": "db", "protocol": "TCP"}],
    }
    api.put(f"/api/projects/{pid}/document", json={"base_revision": 1, "document": doc})
    f = api.get(f"/api/projects/{pid}/findings").json()
    rules = {x["rule"] for x in f["findings"]}
    assert {"client-to-datastore", "public-internal-component"} <= rules
    hit = next(x for x in f["findings"] if x["rule"] == "client-to-datastore")
    assert hit["edge_ids"] == ["e1"] and hit["kind"] == "recommendation"
    assert "Web → Orders DB" in hit["evidence"]

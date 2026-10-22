"""Two real users: one must never read or change the other's private project."""

from __future__ import annotations

import uuid

from .test_api_projects import generate_and_apply, new_project


def test_cross_user_access_is_refused_everywhere(make_api) -> None:  # type: ignore[no-untyped-def]
    alice, mallory = make_api(), make_api()
    alice.signup(f"alice-{uuid.uuid4().hex[:6]}@example.com")
    mallory.signup(f"mallory-{uuid.uuid4().hex[:6]}@example.com")
    pid = new_project(alice, "Alice private")["id"]
    applied = generate_and_apply(alice, pid)
    head = applied["head_revision"]
    cs = alice.post(
        f"/api/projects/{pid}/ai/edit", json={"request": "add monitoring", "base_revision": head}
    ).json()
    base = f"/api/projects/{pid}"
    reads = [
        base,
        f"{base}/revisions",
        f"{base}/revisions/1",
        f"{base}/findings",
        f"{base}/prompts",
        f"{base}/changesets",
        f"{base}/changesets/{cs['id']}",
        f"{base}/audit",
    ]
    for url in reads:
        r = mallory.get(url)
        assert r.status_code == 404, (url, r.status_code)
    writes = [
        ("put", f"{base}/document", {"base_revision": head, "document": {}}),
        ("patch", base, {"name": "pwned"}),
        ("post", f"{base}/duplicate", None),
        ("post", f"{base}/ai/generate", {"vision": "x" * 20, "base_revision": head}),
        ("post", f"{base}/ai/edit", {"request": "remove db", "base_revision": head}),
        ("post", f"{base}/changesets/{cs['id']}/apply", {}),
        ("post", f"{base}/changesets/{cs['id']}/reject", None),
        ("post", f"{base}/revisions/1/restore", {"base_revision": head}),
        ("post", f"{base}/prompts", {}),
        ("post", f"{base}/prompts/preview", {}),
        ("delete", base, None),
    ]
    for method, url, body in writes:
        r = (
            getattr(mallory, method)(url, json=body)
            if body is not None
            else getattr(mallory, method)(url)
        )
        assert r.status_code == 404, (method, url, r.status_code, r.text)
    assert pid not in [p["id"] for p in mallory.get("/api/projects").json()]
    # Alice's project is untouched.
    after = alice.get(base).json()
    assert after["name"] == "Alice private" and after["head_revision"] == head
    assert alice.get(f"{base}/changesets/{cs['id']}").json()["status"] == "pending"


def test_anonymous_is_refused(make_api) -> None:  # type: ignore[no-untyped-def]
    owner = make_api()
    owner.signup(f"o-{uuid.uuid4().hex[:6]}@example.com")
    pid = new_project(owner)["id"]
    anon = make_api()
    assert anon.get(f"/api/projects/{pid}").status_code == 401
    assert anon.get("/api/projects").status_code == 401

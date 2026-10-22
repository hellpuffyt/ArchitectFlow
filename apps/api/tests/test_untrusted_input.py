"""Malformed and hostile input through the real API on real PostgreSQL.

Every case must end in an actionable 4xx (never a 500) and must not create a revision.
Also covers the "never silently overwrite" contract for import and restore.
"""

from __future__ import annotations

import copy
from typing import Any

import pytest
from fastapi.testclient import TestClient

from architectflow.validation import DocumentInvalid, parse_document

from .conftest import Api
from .test_api_projects import generate_and_apply, new_project


@pytest.fixture
def lenient(app) -> Api:  # type: ignore[no-untyped-def]
    """A client that returns server errors as responses instead of raising them."""
    return Api(TestClient(app, raise_server_exceptions=False))


def _raw(api: Api, method: str, url: str, body: bytes) -> Any:
    return api.c.request(
        method, url, content=body, headers={**api._h(), "content-type": "application/json"}
    )


def _doc_body(document_json: str, base: int = 1) -> bytes:
    return f'{{"base_revision":{base},"document":{document_json}}}'.encode()


NODE = '{"id":"a","type":"service","label":"%s"}'
CASES: dict[str, tuple[str, str]] = {
    # name: (document JSON text, expected path prefix in the error)
    "nan-position": (
        '{"nodes":[{"id":"a","type":"service","label":"A","position":{"x":NaN,"y":0}}]}',
        "nodes.0.position.x",
    ),
    "infinite-zoom": ('{"viewport":{"x":Infinity,"y":0,"zoom":1}}', "viewport.x"),
    "nul-in-label": ('{"nodes":[' + NODE % "A\\u0000B" + "]}", "nodes.0.label"),
    "nul-in-vision": ('{"vision":"x\\u0000"}', "vision"),
    "nul-in-property-key": (
        '{"nodes":[{"id":"a","type":"service","label":"A","properties":{"k\\u0000":1}}]}',
        "nodes.0.properties",
    ),
    "lone-surrogate": ('{"vision":"x\\ud800y"}', "vision"),
    "deeply-nested": ('{"vision":' + "[" * 5000 + "]" * 5000 + "}", "vision"),
    "deeply-nested-object": ("{" + '"a":{' * 3000 + "}" * 3000 + "}", "a.a.a"),
}


@pytest.mark.parametrize("case", sorted(CASES))
def test_hostile_documents_get_actionable_422(lenient: Api, email: str, case: str) -> None:
    lenient.signup(email)
    pid = new_project(lenient)["id"]
    document, path = CASES[case]
    for url, body in [
        (f"/api/projects/{pid}/document", _doc_body(document)),
        (f"/api/projects/{pid}/validate-document", document.encode()),
    ]:
        method = "PUT" if url.endswith("/document") else "POST"
        r = _raw(lenient, method, url, body)
        assert r.status_code == 422, (case, url, r.status_code, r.text[:300])
        errors = r.json()["detail"]["errors"]
        assert any(e["path"].startswith(path) for e in errors), (case, errors)
        assert len(r.content) < 20_000  # errors never echo a huge payload back
    assert lenient.get(f"/api/projects/{pid}").json()["head_revision"] == 1


def test_wrong_body_shapes_never_500(lenient: Api, email: str) -> None:
    lenient.signup(email)
    pid = new_project(lenient)["id"]
    deep_list = b"[" * 3000 + b"]" * 3000
    for method, url, body in [
        ("PUT", f"/api/projects/{pid}/document", _doc_body(deep_list.decode())),
        ("PUT", f"/api/projects/{pid}/document", b'{"base_revision":1,"document":[]}'),
        ("POST", f"/api/projects/{pid}/validate-document", deep_list),
        ("POST", f"/api/projects/{pid}/validate-document", b"[" * 100_000 + b"]" * 100_000),
        ("POST", f"/api/projects/{pid}/validate-document", b'{"vision": "\xff\xfe"}'),
    ]:
        r = _raw(lenient, method, url, body)
        assert 400 <= r.status_code < 500, (url, r.status_code, r.text[:200])
        assert len(r.content) < 20_000


def test_schema_version_errors_are_actionable() -> None:
    for version, needle in [
        (99, "newer than this server"),
        (0, "not a valid version"),
        ("1", "must be an integer"),
        (1.0, "must be an integer"),
        (True, "must be an integer"),
    ]:
        with pytest.raises(DocumentInvalid) as exc:
            parse_document({"schema_version": version})
        assert exc.value.errors[0]["path"] == "schema_version"
        assert needle in exc.value.errors[0]["message"]


def test_unicode_round_trips_exactly(api: Api, email: str) -> None:
    api.signup(email)
    pid = new_project(api)["id"]
    text = "é ‮RTL‬ \U0001f48e 中文 ﻿bom ‍zwj"
    doc = {
        "vision": text,
        "nodes": [{"id": "a", "type": "service", "label": text[:50], "description": text}],
    }
    r = api.put(f"/api/projects/{pid}/document", json={"base_revision": 1, "document": doc})
    assert r.status_code == 200, r.text
    saved = api.get(f"/api/projects/{pid}").json()["document"]
    assert saved["vision"] == text and saved["nodes"][0]["description"] == text
    exported = api.get(f"/api/projects/{pid}/exports/json").json()
    assert exported["vision"] == text and exported["nodes"][0]["description"] == text
    spec = api.get(f"/api/projects/{pid}/exports/spec").content.decode("utf-8")
    assert text[:50] in spec


@pytest.mark.parametrize(
    "payload",
    [{"name": "a\u0000b"}, {"name": "ok", "description": "d\u0000"}],
)
def test_nul_in_other_text_inputs_is_422(lenient: Api, email: str, payload: dict) -> None:
    lenient.signup(email)
    r = lenient.post("/api/projects", json=payload)
    assert r.status_code == 422, r.text
    pid = new_project(lenient)["id"]
    r = lenient.patch(f"/api/projects/{pid}", json={"name": "x\u0000"})
    assert r.status_code == 422, r.text
    assert lenient.get("/api/projects?q=a%00b").status_code in {200, 422}
    r = lenient.post(
        f"/api/projects/{pid}/ai/generate",
        json={"vision": "build a thing \u0000 with stuff", "base_revision": 1},
    )
    assert r.status_code == 422, r.text


def test_out_of_range_revision_numbers_are_404(lenient: Api, email: str) -> None:
    lenient.signup(email)
    pid = new_project(lenient)["id"]
    huge = 2**31
    for r in [
        lenient.get(f"/api/projects/{pid}/revisions/{huge}"),
        lenient.get(f"/api/projects/{pid}/revisions/{10**20}"),
        lenient.post(f"/api/projects/{pid}/revisions/{huge}/restore", json={"base_revision": 1}),
        lenient.get(f"/api/projects/{pid}/findings?revision={huge}"),
        lenient.get(f"/api/projects/{pid}/exports/json?revision={huge}"),
        lenient.get(f"/api/projects/{pid}/revisions/-1"),
    ]:
        assert r.status_code == 404, (r.request.url, r.status_code, r.text)


# ------------------------------------------------------------- never silently overwrite


def test_restore_never_overwrites_newer_work(api: Api, email: str) -> None:
    api.signup(email)
    pid = new_project(api)["id"]
    applied = generate_and_apply(api, pid)
    head = applied["head_revision"]
    newer = copy.deepcopy(applied["document"])
    newer["vision"] = "edited in another tab"
    r = api.put(f"/api/projects/{pid}/document", json={"base_revision": head, "document": newer})
    assert r.status_code == 200
    # A client still on `head` asks to restore revision 1: rejected, nothing written.
    r = api.post(f"/api/projects/{pid}/revisions/1/restore", json={"base_revision": head})
    assert r.status_code == 409
    assert r.json()["detail"]["head_revision"] == head + 1
    current = api.get(f"/api/projects/{pid}").json()
    assert current["head_revision"] == head + 1
    assert current["document"]["vision"] == "edited in another tab"
    # With the right base the restore is a NEW revision; history keeps every version.
    r = api.post(f"/api/projects/{pid}/revisions/1/restore", json={"base_revision": head + 1})
    assert r.status_code == 200 and r.json()["head_revision"] == head + 2
    kept = api.get(f"/api/projects/{pid}/revisions/{head + 1}").json()
    assert kept["document"]["vision"] == "edited in another tab"


def test_import_never_overwrites_newer_work(api: Api, email: str) -> None:
    api.signup(email)
    pid = new_project(api)["id"]
    applied = generate_and_apply(api, pid)
    head = applied["head_revision"]
    imported = {"nodes": [{"id": "only", "type": "service", "label": "Imported"}]}
    mine = copy.deepcopy(applied["document"])
    mine["vision"] = "concurrent edit"
    assert (
        api.put(f"/api/projects/{pid}/document", json={"base_revision": head, "document": mine})
    ).status_code == 200
    r = api.put(
        f"/api/projects/{pid}/document",
        json={"base_revision": head, "document": imported, "source": "import"},
    )
    assert r.status_code == 409
    assert api.get(f"/api/projects/{pid}").json()["document"]["vision"] == "concurrent edit"
    r = api.put(
        f"/api/projects/{pid}/document",
        json={"base_revision": head + 1, "document": imported, "source": "import"},
    )
    assert r.status_code == 200 and r.json()["head_revision"] == head + 2
    revs = api.get(f"/api/projects/{pid}/revisions").json()
    assert [x["source"] for x in revs[:2]] == ["import", "manual"]
    assert api.get(f"/api/projects/{pid}/revisions/{head + 1}").json()["document"]["vision"] == (
        "concurrent edit"
    )


def test_archived_project_cannot_be_changed_by_restore(api: Api, email: str) -> None:
    api.signup(email)
    pid = new_project(api)["id"]
    applied = generate_and_apply(api, pid)
    head = applied["head_revision"]
    assert api.patch(f"/api/projects/{pid}", json={"archived": True}).status_code == 200
    r = api.post(f"/api/projects/{pid}/revisions/1/restore", json={"base_revision": head})
    assert r.status_code == 409
    assert api.get(f"/api/projects/{pid}").json()["head_revision"] == head

"""Failure handling with REAL network/database conditions (no mocks):
missing key, unreachable provider, provider timeout, provider rate limit, garbage output,
and PostgreSQL unavailable."""

from __future__ import annotations

import os
import socket
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest
from fastapi.testclient import TestClient

from architectflow import config

from .conftest import Api
from .test_api_projects import new_project


@contextmanager
def provider_env(**env: str) -> Iterator[None]:
    keys = {f"ARCHITECTFLOW_{k.upper()}": v for k, v in env.items()}
    old = {k: os.environ.get(k) for k in keys}
    os.environ.update(keys)
    config.get_settings.cache_clear()
    try:
        yield
    finally:
        for k, v in old.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        config.get_settings.cache_clear()


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


@contextmanager
def http_server(status: int, body: bytes) -> Iterator[str]:
    class H(BaseHTTPRequestHandler):
        def do_POST(self) -> None:
            self.rfile.read(int(self.headers.get("content-length", 0)))
            self.send_response(status)
            self.send_header("content-type", "application/json")
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *a: object) -> None:
            return

    srv = HTTPServer(("127.0.0.1", 0), H)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    try:
        yield f"http://127.0.0.1:{srv.server_address[1]}/v1"
    finally:
        srv.shutdown()


@contextmanager
def silent_server() -> Iterator[str]:
    """Accepts TCP connections and never answers (provider hangs)."""
    srv = socket.socket()
    srv.bind(("127.0.0.1", 0))
    srv.listen(8)
    conns: list[socket.socket] = []
    stop = threading.Event()

    def accept() -> None:
        srv.settimeout(0.2)
        while not stop.is_set():
            try:
                conns.append(srv.accept()[0])
            except OSError:
                continue

    threading.Thread(target=accept, daemon=True).start()
    try:
        yield f"http://127.0.0.1:{srv.getsockname()[1]}/v1"
    finally:
        stop.set()
        for c in conns:
            c.close()
        srv.close()


def edit(api: Api, pid: str) -> tuple[int, dict]:
    r = api.post(
        f"/api/projects/{pid}/ai/edit", json={"request": "add a cache", "base_revision": 1}
    )
    return r.status_code, r.json()


def test_missing_key_is_reported_and_non_ai_features_still_work(api: Api, email: str) -> None:
    api.signup(email)
    pid = new_project(api)["id"]
    with provider_env(ai_provider="openai", ai_model="m"):
        code, body = edit(api, pid)
        assert code == 503
        assert "ARCHITECTFLOW_AI_API_KEY is not set" in body["detail"]["message"]
        assert api.get("/api/auth/me").json()["ai"]["mode"] == "misconfigured"
        doc = api.get(f"/api/projects/{pid}").json()["document"]
        doc["vision"] = "still editable without a key"
        assert (
            api.put(
                f"/api/projects/{pid}/document", json={"base_revision": 1, "document": doc}
            ).status_code
            == 200
        )
        assert api.post(f"/api/projects/{pid}/prompts", json={}).status_code == 201
        assert api.get(f"/api/projects/{pid}/findings").status_code == 200


def test_unreachable_provider(api: Api, email: str) -> None:
    api.signup(email)
    pid = new_project(api)["id"]
    url = f"http://127.0.0.1:{free_port()}/v1"  # nothing listens here
    with provider_env(ai_provider="openai", ai_api_key="k", ai_model="m", ai_base_url=url):
        code, body = edit(api, pid)
    assert code == 502 and "ConnectError" in body["detail"]["message"]
    assert "not changed" in body["detail"]["message"]
    assert api.get(f"/api/projects/{pid}").json()["head_revision"] == 1


def test_provider_timeout(api: Api, email: str) -> None:
    api.signup(email)
    pid = new_project(api)["id"]
    with (
        silent_server() as url,
        provider_env(
            ai_provider="openai",
            ai_api_key="k",
            ai_model="m",
            ai_base_url=url,
            ai_timeout_seconds="0.5",
        ),
    ):
        code, body = edit(api, pid)
    assert code == 504 and "did not answer" in body["detail"]["message"]


@pytest.mark.parametrize(
    "status,payload,expect,needle",
    [
        (429, b'{"error":"slow down"}', 429, "rate limit"),
        (401, b'{"error":"bad key"}', 502, "rejected the API key"),
        (500, b"{}", 502, "HTTP 500"),
        (200, b'{"choices":[{"message":{"content":"I cannot do JSON today"}}]}', 502, "no JSON"),
    ],
)
def test_provider_error_responses(
    api: Api, email: str, status: int, payload: bytes, expect: int, needle: str
) -> None:
    api.signup(email)
    pid = new_project(api)["id"]
    with (
        http_server(status, payload) as url,
        provider_env(ai_provider="openai", ai_api_key="k", ai_model="m", ai_base_url=url),
    ):
        code, body = edit(api, pid)
    assert code == expect and needle in body["detail"]["message"]


def test_provider_output_that_breaks_the_graph_is_rejected(api: Api, email: str) -> None:
    api.signup(email)
    pid = new_project(api)["id"]
    content = (
        '{"explanation":"x","operations":[{"op":"add_edge","edge":{"id":"e",'
        '"source":"ghost","target":"phantom"}}]}'
    )
    body = '{"choices":[{"message":{"content":' + __import__("json").dumps(content) + "}}]}"
    with (
        http_server(200, body.encode()) as url,
        provider_env(ai_provider="openai", ai_api_key="k", ai_model="m", ai_base_url=url),
    ):
        code, out = edit(api, pid)
    assert code == 422 and "rejected by validation" in out["detail"]["message"]
    assert api.get(f"/api/projects/{pid}/changesets").json() == []


def test_database_unavailable_returns_503_not_success(email: str) -> None:
    """A real connection failure: nothing listens on the configured database port."""
    from architectflow import db

    port = free_port()
    with provider_env(database_url=f"postgresql+psycopg://x@127.0.0.1:{port}/none"):
        db.get_engine.cache_clear()
        db._factory.cache_clear()
        try:
            from architectflow.main import create_app

            client = TestClient(create_app(), raise_server_exceptions=False)
            r = client.post(
                "/api/auth/signup", json={"email": email, "password": "correct horse battery"}
            )
            assert r.status_code == 503
            assert "NOT saved" in r.json()["detail"]
        finally:
            db.get_engine.cache_clear()
            db._factory.cache_clear()

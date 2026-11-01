import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { analyze } from "../src/engine/analyze.ts";
import { validateDocument } from "../src/engine/validate.ts";
import { makeRepo, MONOREPO } from "./helpers.ts";

test("detects languages, frameworks, package managers and a monorepo", () => {
  const { dir, cleanup } = makeRepo(MONOREPO);
  try {
    const r = analyze(dir);
    const langs = r.facts.stack.languages.map((l) => l.name);
    assert.ok(langs.includes("TypeScript") && langs.includes("Python"));
    const fw = r.facts.stack.frameworks.map((f) => f.name);
    assert.ok(fw.includes("Next.js") && fw.includes("FastAPI") && fw.includes("SQLAlchemy"));
    assert.ok(r.facts.stack.packageManagers.includes("pnpm") && r.facts.stack.packageManagers.includes("uv"));
    assert.equal(r.facts.stack.monorepo, true);
    assert.ok(r.facts.stack.workspaces.length >= 3);
  } finally { cleanup(); }
});

test("extracts routes from FastAPI and Next.js route handlers with evidence", () => {
  const { dir, cleanup } = makeRepo(MONOREPO);
  try {
    const r = analyze(dir);
    const paths = r.document.api.endpoints.map((e) => `${e.method} ${e.path}`);
    assert.ok(paths.includes("GET /items"), paths.join(","));
    assert.ok(paths.includes("POST /items"));
    assert.ok(paths.includes("GET /users"), "Next.js app-router route");
    assert.ok(paths.includes("POST /users"));
    // every endpoint traces to a real file:line
    for (const rec of r.evidence.filter((e) => e.elementKind === "endpoint")) {
      const ev = rec.evidence[0]!;
      assert.ok(fs.existsSync(path.join(dir, ev.path)), `evidence path exists: ${ev.path}`);
      assert.ok(ev.lineStart && ev.lineStart > 0);
    }
  } finally { cleanup(); }
});

test("extracts SQLAlchemy entities (and drops the 0-field declarative Base)", () => {
  const { dir, cleanup } = makeRepo(MONOREPO);
  try {
    const r = analyze(dir);
    const names = r.document.database.entities.map((e) => e.name).sort();
    assert.deepEqual(names, ["orders", "users"]);
    const orders = r.document.database.entities.find((e) => e.name === "orders")!;
    assert.ok(orders.fields.some((f) => f.name === "user_id"));
    assert.ok(orders.fields.some((f) => f.primary_key));
  } finally { cleanup(); }
});

test("every node and edge carries a confidence label and source evidence", () => {
  const { dir, cleanup } = makeRepo(MONOREPO);
  try {
    const r = analyze(dir);
    for (const n of r.document.nodes) {
      assert.ok(["verified", "inferred", "recommendation", "unknown"].includes(String(n.properties?.confidence)));
      const rec = r.evidence.find((e) => e.elementId === n.id);
      assert.ok(rec && rec.evidence.length >= 0);
    }
    assert.ok(r.document.nodes.some((n) => n.type === "database"));
    assert.ok(r.document.nodes.some((n) => n.type === "web_client"));
    assert.ok(r.document.nodes.some((n) => n.type === "service"));
  } finally { cleanup(); }
});

test("generated document passes local structural validation", () => {
  const { dir, cleanup } = makeRepo(MONOREPO);
  try {
    assert.deepEqual(validateDocument(analyze(dir).document), []);
  } finally { cleanup(); }
});

test("produces all eight diagram types as mermaid", () => {
  const { dir, cleanup } = makeRepo(MONOREPO);
  try {
    const r = analyze(dir);
    for (const name of ["context", "container", "component", "service-dependencies", "entity-relationship", "data-flow", "auth-sequence", "deployment"]) {
      assert.ok(r.diagrams[name] && r.diagrams[name]!.length > 0, `diagram ${name}`);
    }
    assert.match(r.diagrams["entity-relationship"]!, /erDiagram/);
    assert.match(r.diagrams["auth-sequence"]!, /sequenceDiagram/);
  } finally { cleanup(); }
});

test("discovers infrastructure: Dockerfile, compose services, CI", () => {
  const { dir, cleanup } = makeRepo(MONOREPO);
  try {
    const kinds = analyze(dir).facts.infra.map((i) => `${i.kind}:${i.name}`);
    assert.ok(kinds.some((k) => k.startsWith("dockerfile")));
    assert.ok(kinds.includes("compose_service:api") && kinds.includes("compose_service:db"));
    assert.ok(kinds.some((k) => k.startsWith("ci:")));
  } finally { cleanup(); }
});

test("a clean/empty repository analyzes without error and validates", () => {
  const { dir, cleanup } = makeRepo({ "README.md": "# empty" });
  try {
    const r = analyze(dir);
    assert.deepEqual(validateDocument(r.document), []);
    assert.equal(r.document.schema_version, 1);
    assert.equal(r.document.api.endpoints.length, 0);
  } finally { cleanup(); }
});

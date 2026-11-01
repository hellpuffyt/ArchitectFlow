import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze } from "../src/engine/analyze.ts";
import { scrubSecrets, isSensitivePath } from "../src/engine/privacy.ts";
import { makeRepo, MONOREPO } from "./helpers.ts";

test(".env and the secret it holds never appear in any artifact", () => {
  const { dir, cleanup } = makeRepo(MONOREPO);
  try {
    const r = analyze(dir);
    const blob = JSON.stringify(r.document) + r.markdown + JSON.stringify(r.evidence) + JSON.stringify(r.diagrams);
    assert.ok(!blob.includes("sk-super-secret-value"), "secret value leaked");
    assert.ok(!blob.includes("postgres://u:p@h/db"), "db url leaked");
    // .env was recorded as skipped-and-not-read, never as a discovered file
    assert.ok(r.facts.skipped.some((s) => s.path === ".env"));
    assert.ok(!r.facts.files.some((f) => f.rel === ".env"));
  } finally { cleanup(); }
});

test(".architectflowignore excludes paths from analysis", () => {
  const { dir, cleanup } = makeRepo(MONOREPO);
  try {
    const r = analyze(dir);
    assert.ok(!r.facts.files.some((f) => f.rel.startsWith("packages/legacy/")), "ignored path analyzed");
    assert.ok(!r.document.database.entities.some((e) => e.name === "legacy"));
  } finally { cleanup(); }
});

test("scrubSecrets redacts common secret shapes", () => {
  assert.match(scrubSecrets("key sk-abcdefghij1234567890"), /\[REDACTED\]/);
  assert.match(scrubSecrets("AKIAABCDEFGHIJKLMNOP"), /\[REDACTED\]/);
  assert.match(scrubSecrets("password: hunter2secret"), /\[REDACTED\]/);
});

test("isSensitivePath flags env files, keys and certs", () => {
  for (const p of [".env", "api/.env.local", "certs/server.pem", "id_rsa", "secrets.yaml"]) assert.ok(isSensitivePath(p), p);
  for (const p of ["src/index.ts", "README.md"]) assert.ok(!isSensitivePath(p), p);
});

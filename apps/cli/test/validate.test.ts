import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDocument } from "../src/engine/validate.ts";
import type { ArchitectureDocument } from "../src/types.ts";

function base(): ArchitectureDocument {
  return {
    schema_version: 1, vision: "", requirements: { functional: [], nonfunctional: [], acceptance_criteria: [] },
    actors: [], workflows: [], integrations: [], technology_preferences: [], constraints: [], assumptions: [],
    open_questions: [], decisions: [], nodes: [], edges: [], groups: [], viewport: { x: 0, y: 0, zoom: 1 },
    database: { entities: [] }, api: { endpoints: [] },
    design: { themes: [], active_theme_id: null, pages: [], journeys: [] },
    prompt_settings: { mode: "architecture_docs", preset: "claude_code", sections: [], page_id: null },
  };
}

test("accepts a minimal valid document", () => assert.deepEqual(validateDocument(base()), []));

test("rejects unknown node type", () => {
  const d = base(); d.nodes = [{ id: "a", type: "wizard" as never, label: "x", position: { x: 0, y: 0 } }];
  assert.ok(validateDocument(d).some((e) => /unknown node type/.test(e)));
});

test("rejects dangling edge target and bad entity name", () => {
  const d = base();
  d.nodes = [{ id: "a", type: "service", label: "A", position: { x: 0, y: 0 } }];
  d.edges = [{ id: "e1", source: "a", target: "ghost" }];
  d.database.entities = [{ id: "E1", name: "BadName", fields: [] }];
  const errs = validateDocument(d);
  assert.ok(errs.some((e) => /target missing/.test(e)));
  assert.ok(errs.some((e) => /invalid entity name/.test(e)));
});

test("rejects an endpoint that carries a properties field", () => {
  const d = base();
  d.api.endpoints = [{ id: "ep1", method: "GET", path: "/x", properties: { a: 1 } } as never];
  assert.ok(validateDocument(d).some((e) => /must not carry a properties/.test(e)));
});

test("rejects a non-rooted path", () => {
  const d = base();
  d.api.endpoints = [{ id: "ep1", method: "GET", path: "noslash" }];
  assert.ok(validateDocument(d).some((e) => /bad path/.test(e)));
});

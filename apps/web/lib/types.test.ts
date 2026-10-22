import { describe, expect, it } from "vitest";
import schema from "./generated/architecture.schema.json";
import registryJson from "./generated/node-registry.json";
import { SCHEMA_KEYS } from "./types";
import { DESIGN_SCHEMA_KEYS } from "./design-types";
import { NODE_TYPES } from "./registry";

type Def = { properties?: Record<string, unknown> };
const defs = (schema as { $defs: Record<string, Def>; properties: Record<string, unknown> }).$defs;

describe("TypeScript types agree with the server's JSON Schema", () => {
  it("ArchitectureDocument top-level keys", () => {
    expect(Object.keys(SCHEMA_KEYS.ArchitectureDocument).sort()).toEqual(Object.keys((schema as Def).properties ?? {}).sort());
  });
  const cases: [string, Record<string, true>][] = [
    ["Node", SCHEMA_KEYS.Node], ["Edge", SCHEMA_KEYS.Edge], ["Requirement", SCHEMA_KEYS.Requirement], ["Entity", SCHEMA_KEYS.Entity],
    ["EntityField", SCHEMA_KEYS.EntityField], ["Endpoint", SCHEMA_KEYS.Endpoint], ["ApiField", SCHEMA_KEYS.ApiField], ["Group", SCHEMA_KEYS.Group],
    ["Actor", SCHEMA_KEYS.Actor], ["Assumption", SCHEMA_KEYS.Assumption], ["PromptSettings", SCHEMA_KEYS.PromptSettings],
    ["Theme", DESIGN_SCHEMA_KEYS.Theme], ["Palette", DESIGN_SCHEMA_KEYS.Palette], ["LayoutNode", DESIGN_SCHEMA_KEYS.LayoutNode],
    ["Page", DESIGN_SCHEMA_KEYS.Page], ["Interaction", DESIGN_SCHEMA_KEYS.Interaction], ["DesignDocument", DESIGN_SCHEMA_KEYS.DesignDocument],
  ];
  it.each(cases)("%s", (name, keys) => {
    expect(defs[name], `missing $defs.${name}`).toBeDefined();
    expect(Object.keys(keys).sort()).toEqual(Object.keys(defs[name].properties ?? {}).sort());
  });
});

describe("node registry", () => {
  it("matches apps/api/architectflow/schema/registry.py", () => {
    const server = (registryJson as { key: string; label: string; category: string }[]).map((r) => [r.key, r.label, r.category]);
    expect(NODE_TYPES.map((t) => [t.key, t.label, t.category])).toEqual(server);
  });
});

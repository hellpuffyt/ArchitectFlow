import { describe, expect, it } from "vitest";
import { addEdge, addNode, deleteElements, deletionImpact, duplicateNodes, groupNodes, ungroup, uniqueId } from "./graph";
import { emptyDocument } from "./types";

function seeded() {
  let d = emptyDocument();
  [d] = addNode(d, "service", { x: 0, y: 0 });
  [d] = addNode(d, "database", { x: 300, y: 0 });
  const [s, db] = d.nodes.map((n) => n.id);
  [d] = addEdge(d, s, db);
  d = { ...d, database: { entities: [{ id: "e", name: "t", label: "", node_id: db, fields: [], indexes: [], description: "" }] },
    api: { endpoints: [{ id: "ep", method: "GET", path: "/x", summary: "", service_node_id: s, auth: "public", roles: [], request_fields: [],
      response_entity_id: null, response_fields: [], response_is_list: false, paginated: false, filters: [], errors: [] }] } };
  return { d, s, db };
}

describe("graph operations", () => {
  it("uniqueId avoids collisions and produces valid ids", () => {
    expect(uniqueId("Backend service", ["backend-service"])).toBe("backend-service-2");
    expect(uniqueId("--", [])).toBe("item");
    expect(uniqueId("_x", [])).toMatch(/^[A-Za-z0-9]/);
  });
  it("refuses self-loops and duplicate edges", () => {
    const { d, s, db } = seeded();
    expect(addEdge(d, s, s)[1]).toBeNull();
    expect(addEdge(d, s, db)[1]).toBeNull();
    expect(addEdge(d, db, s)[1]).not.toBeNull();
  });
  it("delete removes edges and detaches (never deletes) entities and endpoints", () => {
    const { d, s, db } = seeded();
    const impact = deletionImpact(d, [s, db]);
    expect(impact).toMatchObject({ edges: 1, entities: ["t"], endpoints: ["GET /x"] });
    const after = deleteElements(d, [s, db], []);
    expect(after.nodes).toHaveLength(0);
    expect(after.edges).toHaveLength(0);
    expect(after.database.entities[0].node_id).toBeNull();
    expect(after.api.endpoints[0].service_node_id).toBeNull();
  });
  it("duplicate offsets copies with new ids", () => {
    const { d, s } = seeded();
    const [after, ids] = duplicateNodes(d, [s]);
    expect(ids).toHaveLength(1);
    const copy = after.nodes.find((n) => n.id === ids[0])!;
    expect(copy.position).toEqual({ x: 40, y: 40 });
    expect(copy.label).toContain("(copy)");
  });
  it("group/ungroup keep membership consistent", () => {
    const { d, s, db } = seeded();
    const [g, gid] = groupNodes(d, [s, db], "VPC");
    expect(g.groups[0].node_ids).toEqual([s, db]);
    expect(g.nodes.every((n) => n.group_id === gid)).toBe(true);
    const u = ungroup(g, gid);
    expect(u.groups).toHaveLength(0);
    expect(u.nodes.every((n) => n.group_id === null)).toBe(true);
  });
});

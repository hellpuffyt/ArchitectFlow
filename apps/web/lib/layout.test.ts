import { describe, expect, it } from "vitest";
import { breakpointFor, cloneWithIds, effectiveRule, findNode, insertNode, moveNode, moveSibling, newNode, removeNode } from "./layout";

function tree() {
  const root = newNode("container", "root");
  let r = insertNode(root, "root", 0, newNode("grid", "g"));
  r = insertNode(r, "g", 0, newNode("card", "c1"));
  r = insertNode(r, "g", 1, newNode("card", "c2"));
  r = insertNode(r, "root", 1, newNode("button", "b"));
  return r;
}

describe("layout tree", () => {
  it("inserts only into containers", () => {
    const r = insertNode(tree(), "b", 0, newNode("text", "t"));
    expect(findNode(r, "t")).toBeNull();
  });
  it("moves within and across containers", () => {
    let r = moveNode(tree(), "c2", "g", 0);
    expect(findNode(r, "g")!.children.map((c) => c.id)).toEqual(["c2", "c1"]);
    r = moveNode(r, "b", "c1", 0);
    expect(findNode(r, "c1")!.children.map((c) => c.id)).toEqual(["b"]);
    expect(r.children.map((c) => c.id)).toEqual(["g"]);
  });
  it("refuses to move a node into its own subtree", () => {
    const r = tree();
    expect(moveNode(r, "g", "c1", 0)).toBe(r);
  });
  it("moveSibling reorders", () => {
    const r = moveSibling(tree(), "c1", 1);
    expect(findNode(r, "g")!.children.map((c) => c.id)).toEqual(["c2", "c1"]);
  });
  it("cannot remove the root; removes subtrees", () => {
    const r = tree();
    expect(removeNode(r, "root")).toBe(r);
    expect(findNode(removeNode(r, "g"), "c1")).toBeNull();
  });
  it("clones with fresh unique ids", () => {
    const taken = new Set(["root", "g", "c1", "c2", "b"]);
    const c = cloneWithIds(findNode(tree(), "g")!, taken);
    expect(c.id).toBe("g-copy");
    expect(c.children.map((x) => x.id)).toEqual(["c1-copy", "c2-copy"]);
  });
  it("breakpoint rules: sm inherits md, base ignores both", () => {
    const n = { ...newNode("grid", "x"), responsive: { md: { columns: 2, hidden: null }, sm: { columns: 1 } } };
    const bp = { sm: 640, md: 1024 };
    expect(breakpointFor(1280, bp)).toBe("base");
    expect(breakpointFor(768, bp)).toBe("md");
    expect(breakpointFor(390, bp)).toBe("sm");
    expect(effectiveRule(n, "base")).toEqual({});
    expect(effectiveRule(n, "md").columns).toBe(2);
    expect(effectiveRule(n, "sm").columns).toBe(1);
    const onlyMd = { ...newNode("stack", "y"), responsive: { md: { hidden: true }, sm: null } };
    expect(effectiveRule(onlyMd, "sm").hidden).toBe(true);
  });
});

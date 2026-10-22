import { describe, expect, it } from "vitest";
import { HISTORY_LIMIT, initHistory, push, redo, replace, undo } from "./history";

describe("snapshot history", () => {
  it("undo/redo walk the snapshots", () => {
    let h = initHistory(1);
    h = push(h, 2);
    h = push(h, 3);
    h = undo(h);
    expect(h.present).toBe(2);
    h = undo(h);
    expect(h.present).toBe(1);
    expect(undo(h)).toBe(h);
    h = redo(redo(h));
    expect(h.present).toBe(3);
    expect(redo(h)).toBe(h);
  });
  it("a new edit clears the redo stack", () => {
    const h = push(undo(push(initHistory("a"), "b")), "c");
    expect(h.future).toEqual([]);
    expect(h.past).toEqual(["a"]);
  });
  it("replace does not create an undo step", () => {
    const h = replace(push(initHistory(0), 1), 2);
    expect(h.past).toEqual([0]);
    expect(undo(h).present).toBe(0);
  });
  it("is bounded", () => {
    let h = initHistory(0);
    for (let i = 1; i <= HISTORY_LIMIT + 50; i++) h = push(h, i);
    expect(h.past.length).toBe(HISTORY_LIMIT);
  });
});

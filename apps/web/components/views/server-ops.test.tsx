// Restore / import / AI proposals first save pending edits, then send the server the head
// revision they are based on. That base must be the head *after* the save; using the head
// captured before it makes the server answer 409 even though nothing conflicts.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProjectProvider, useProject } from "@/lib/project-store";
import { VersionsView } from "./VersionsView";

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  revisions: vi.fn(),
  saveDocument: vi.fn(),
  restore: vi.fn(),
  exportFormats: vi.fn(),
  shares: vi.fn(),
  validateDocument: vi.fn(),
}));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { ...actual.api, ...mocks } };
});

const doc = { schema_version: 1, vision: "", nodes: [], edges: [], groups: [] };
const project = { id: "p1", name: "P", description: "", head_revision: 3, archived: false,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", document: doc };

function Editor() {
  const { edit } = useProject();
  return <button onClick={() => edit((d) => ({ ...d, vision: "unsaved edit" }))}>make edit</button>;
}

beforeEach(() => {
  // jsdom has no <dialog> modal API.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true; };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.open = false; };
  vi.clearAllMocks();
  mocks.getProject.mockResolvedValue(project);
  mocks.revisions.mockResolvedValue([
    { number: 3, source: "manual", message: "", created_at: "2026-01-01T00:00:00Z" },
    { number: 2, source: "manual", message: "", created_at: "2026-01-01T00:00:00Z" },
  ]);
  mocks.saveDocument.mockResolvedValue({ head_revision: 4, saved_at: "2026-01-01T00:00:00Z" });
  mocks.restore.mockResolvedValue({ head_revision: 5, document: doc });
  mocks.exportFormats.mockResolvedValue([]);
  mocks.shares.mockResolvedValue([]);
  mocks.validateDocument.mockResolvedValue({ valid: true, findings: [], nodes: 0, edges: 0 });
});

describe("server operations after saving pending edits", () => {
  it("restore uses the head revision produced by the save", async () => {
    render(<ProjectProvider id="p1"><Editor /><VersionsView /></ProjectProvider>);
    fireEvent.click(await screen.findByLabelText("Restore revision 2"));
    fireEvent.click(screen.getByText("make edit"));
    await act(async () => { fireEvent.click(screen.getByText("Restore as new revision")); });
    await waitFor(() => expect(mocks.restore).toHaveBeenCalled());
    expect(mocks.saveDocument).toHaveBeenCalledWith("p1", 3, expect.objectContaining({ vision: "unsaved edit" }), "autosave");
    expect(mocks.restore).toHaveBeenCalledWith("p1", 2, 4);
  });

  it("import uses the head revision produced by the save", async () => {
    mocks.getProject.mockResolvedValueOnce(project).mockResolvedValue({ ...project, head_revision: 5 });
    mocks.saveDocument
      .mockResolvedValueOnce({ head_revision: 4, saved_at: "2026-01-01T00:00:00Z" })
      .mockResolvedValueOnce({ head_revision: 5, saved_at: "2026-01-01T00:00:00Z" });
    render(<ProjectProvider id="p1"><Editor /><VersionsView /></ProjectProvider>);
    await screen.findByLabelText("Restore revision 2");
    const file = new File([JSON.stringify(doc)], "design.json", { type: "application/json" });
    await act(async () => { fireEvent.change(screen.getByLabelText("Import file"), { target: { files: [file] } }); });
    await screen.findByText("Replace current design");
    fireEvent.click(screen.getByText("make edit"));
    await act(async () => { fireEvent.click(screen.getByText("Replace current design")); });
    await waitFor(() => expect(mocks.saveDocument).toHaveBeenCalledTimes(2));
    expect(mocks.saveDocument).toHaveBeenNthCalledWith(1, "p1", 3, expect.objectContaining({ vision: "unsaved edit" }), "autosave");
    expect(mocks.saveDocument).toHaveBeenNthCalledWith(2, "p1", 4, doc, "import", "Imported design.json");
  });
});

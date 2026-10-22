"use client";
import { useEffect, useRef, useState } from "react";
import { Download, History, Upload } from "lucide-react";
import { ApiError, api } from "@/lib/api";
import type { RevisionSummary } from "@/lib/api";
import { useProject } from "@/lib/project-store";
import type { ArchitectureDocument } from "@/lib/types";
import { Badge, Button, Dialog, ErrorBox } from "@/components/ui";
import { ExportsPanel } from "./ExportsPanel";

export function VersionsView() {
  const { project, head, status, saveNow, adoptServerDocument } = useProject();
  const [revs, setRevs] = useState<RevisionSummary[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [restoring, setRestoring] = useState<RevisionSummary | null>(null);
  const [importDoc, setImportDoc] = useState<{ doc: unknown; nodes: number; edges: number; name: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => { if (project) api.revisions(project.id).then(setRevs).catch((e) => setError(e as ApiError)); }, [project, head]);
  if (!project) return null;

  async function restore(r: RevisionSummary) {
    if (!project) return;
    setError(null);
    try {
      if (status !== "saved" && !(await saveNow())) throw new ApiError(409, "Resolve the unsaved changes first.");
      const res = await api.restore(project.id, r.number, head);
      adoptServerDocument(res.document, res.head_revision);
    } catch (e) { setError(e as ApiError); } finally { setRestoring(null); }
  }
  async function exportJson(n: number) {
    if (!project) return;
    const r = await api.revision(project.id, n);
    const url = URL.createObjectURL(new Blob([JSON.stringify(r.document, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name.replace(/[^a-z0-9-]+/gi, "-")}-r${n}.architecture.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  async function pickFile(f: File | undefined) {
    if (!f || !project) return;
    setError(null);
    try {
      if (f.size > 2_000_000) throw new ApiError(413, "File is larger than 2 MB.");
      let parsed: unknown;
      try { parsed = JSON.parse(await f.text()); } catch { throw new ApiError(422, "The file is not valid JSON."); }
      const v = await api.validateDocument(project.id, parsed);
      setImportDoc({ doc: parsed, nodes: v.nodes, edges: v.edges, name: f.name });
    } catch (e) { setError(e as ApiError); } finally { if (file.current) file.current.value = ""; }
  }
  async function doImport() {
    if (!project || !importDoc) return;
    try {
      if (status !== "saved" && !(await saveNow())) throw new ApiError(409, "Resolve the unsaved changes first.");
      const r = await api.saveDocument(project.id, head, importDoc.doc as ArchitectureDocument, "import", `Imported ${importDoc.name}`);
      const fresh = await api.getProject(project.id);
      adoptServerDocument(fresh.document, r.head_revision);
    } catch (e) { setError(e as ApiError); } finally { setImportDoc(null); }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <div>
        <h1 className="text-lg font-semibold">Versions & exports</h1>
        <p className="text-sm text-muted">Every save is an immutable revision. Restoring creates a new revision; nothing is overwritten.</p>
      </div>
      {error && <ErrorBox message={error.message} errors={error.errors} />}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void exportJson(head)}><Download size={13} /> Export architecture JSON</Button>
        <Button onClick={() => file.current?.click()}><Upload size={13} /> Import architecture JSON</Button>
        <input ref={file} type="file" accept="application/json,.json" className="hidden" aria-label="Import file" onChange={(e) => void pickFile(e.target.files?.[0])} />
      </div>
      <ExportsPanel />
      <section>
        <h2 className="mb-2 text-sm font-semibold">History</h2>
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel" aria-label="Revisions">
          {(revs ?? []).map((r) => (
            <li key={r.number} className="flex items-center gap-3 px-4 py-2.5 text-sm" data-testid="revision">
              <span className="w-12 font-mono text-xs">r{r.number}</span>
              <Badge>{r.source.replace("_", " ")}</Badge>
              <span className="min-w-0 flex-1 truncate text-muted">{r.message}</span>
              <span className="text-xs text-faint">{new Date(r.created_at).toLocaleString()}</span>
              {r.number === head ? <Badge tone="ok">current</Badge> : (
                <Button size="sm" variant="ghost" onClick={() => setRestoring(r)} aria-label={`Restore revision ${r.number}`}><History size={13} /> Restore</Button>
              )}
              <Button size="sm" variant="ghost" aria-label={`Download revision ${r.number}`} onClick={() => void exportJson(r.number)}><Download size={13} /></Button>
            </li>
          ))}
        </ul>
      </section>
      <Dialog open={restoring !== null} onClose={() => setRestoring(null)} title={`Restore revision ${restoring?.number}?`}
        footer={<><Button onClick={() => setRestoring(null)}>Cancel</Button><Button variant="primary" onClick={() => restoring && void restore(restoring)}>Restore as new revision</Button></>}>
        <p>The design from revision {restoring?.number} becomes revision {head + 1}. The current revision {head} stays in history.</p>
      </Dialog>
      <Dialog open={importDoc !== null} onClose={() => setImportDoc(null)} title="Import architecture?"
        footer={<><Button onClick={() => setImportDoc(null)}>Cancel</Button><Button variant="primary" onClick={() => void doImport()}>Replace current design</Button></>}>
        <p>“{importDoc?.name}” is valid: {importDoc?.nodes} components, {importDoc?.edges} connections. Importing replaces the current design as revision {head + 1}; the current version stays in history.</p>
      </Dialog>
    </div>
  );
}

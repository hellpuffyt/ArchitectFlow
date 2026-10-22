"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReactFlowProvider, getNodesBounds, getViewportForBounds, useReactFlow } from "@xyflow/react";
import { toPng, toSvg } from "html-to-image";
import { Download, Maximize, Search } from "lucide-react";
import { useProject } from "@/lib/project-store";
import { addNode, deleteElements, deletionImpact, duplicateNodes, groupNodes } from "@/lib/graph";
import { ArchCanvas } from "@/components/canvas/ArchCanvas";
import { Palette } from "@/components/canvas/Palette";
import { Inspector } from "@/components/canvas/Inspector";
import { Assistant } from "@/components/canvas/Assistant";
import { Button, Dialog, EmptyState, Input } from "@/components/ui";

export function ArchitectureView({ highlight, onGoToVision }: { highlight: Set<string>; onGoToVision: () => void }) {
  return <ReactFlowProvider><ArchitectureInner highlight={highlight} onGoToVision={onGoToVision} /></ReactFlowProvider>;
}

function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

function download(name: string, href: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.click();
}

function ArchitectureInner({ highlight, onGoToVision }: { highlight: Set<string>; onGoToVision: () => void }) {
  const { doc, project, edit, selection, setSelection, undo, redo, saveNow } = useProject();
  const flow = useReactFlow();
  const [tab, setTab] = useState<"inspect" | "assistant">("inspect");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [find, setFind] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const addAtCenter = useCallback((type: string) => {
    const el = document.querySelector(".react-flow");
    const r = el?.getBoundingClientRect();
    const pos = r ? flow.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 }) : { x: 0, y: 0 };
    let id = "";
    edit((d) => { const [n, newId] = addNode(d, type, { x: pos.x - 90, y: pos.y - 30 }); id = newId; return n; });
    setTimeout(() => setSelection({ nodes: [id], edges: [] }), 0);
  }, [edit, flow, setSelection]);

  const requestDelete = useCallback(() => {
    if (selection.nodes.length + selection.edges.length > 0) setConfirmDelete(true);
  }, [selection]);
  const impact = useMemo(() => (doc ? deletionImpact(doc, selection.nodes) : null), [doc, selection.nodes]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
      else if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); void saveNow(); }
      else if (mod && e.key.toLowerCase() === "d" && selection.nodes.length) {
        e.preventDefault();
        let ids: string[] = [];
        edit((d) => { const [n, c] = duplicateNodes(d, selection.nodes); ids = c; return n; });
        setTimeout(() => setSelection({ nodes: ids, edges: [] }), 0);
      } else if (mod && e.key.toLowerCase() === "g" && selection.nodes.length > 1) {
        e.preventDefault();
        edit((d) => groupNodes(d, selection.nodes, "Group")[0]);
      } else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); requestDelete(); }
      else if (e.key === "f" && !mod) { void flow.fitView({ padding: 0.2, duration: 200 }); }
      else if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === "Escape") setSelection({ nodes: [], edges: [] });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, saveNow, edit, selection, setSelection, requestDelete, flow]);

  function locate() {
    if (!doc || !find.trim()) return;
    const hit = doc.nodes.find((n) => `${n.label} ${n.technology} ${n.id}`.toLowerCase().includes(find.toLowerCase()));
    if (hit) {
      setSelection({ nodes: [hit.id], edges: [] });
      void flow.fitView({ nodes: [{ id: hit.id }], padding: 1.2, duration: 250, maxZoom: 1.2 });
    }
  }

  async function exportImage(kind: "png" | "svg") {
    const el = document.querySelector<HTMLElement>(".react-flow__viewport");
    if (!el || !doc?.nodes.length) return;
    const bounds = getNodesBounds(flow.getNodes());
    const width = Math.min(4000, Math.max(800, bounds.width + 160));
    const height = Math.min(4000, Math.max(500, bounds.height + 160));
    const vp = getViewportForBounds(bounds, width, height, 0.2, 2, 0.08);
    const opts = { backgroundColor: "#0b0d12", width, height,
      style: { width: `${width}px`, height: `${height}px`, transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` } };
    const url = kind === "png" ? await toPng(el, opts) : await toSvg(el, opts);
    download(`${(project?.name ?? "architecture").replace(/[^a-z0-9-]+/gi, "-")}.${kind}`, url);
  }

  if (!doc) return null;
  return (
    <div className="flex h-full min-h-0">
      <aside className="w-56 shrink-0 border-r border-line bg-panel" aria-label="Component library"><Palette onAdd={addAtCenter} searchRef={searchRef} /></aside>
      <div className="relative min-w-0 flex-1">
        <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-line bg-panel/95 p-1.5 shadow-lg backdrop-blur">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-2.5 text-faint" />
            <Input aria-label="Find on canvas" placeholder="Find on canvas" className="h-8 w-44 pl-6 text-xs" value={find}
              onChange={(e) => setFind(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") locate(); }} />
          </div>
          <Button size="sm" variant="ghost" aria-label="Fit to view" onClick={() => void flow.fitView({ padding: 0.2, duration: 200 })}><Maximize size={14} /></Button>
          <Button size="sm" variant="ghost" onClick={() => void exportImage("png")} aria-label="Export PNG"><Download size={13} /> PNG</Button>
          <Button size="sm" variant="ghost" onClick={() => void exportImage("svg")} aria-label="Export SVG"><Download size={13} /> SVG</Button>
        </div>
        {doc.nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center">
            <div className="pointer-events-auto">
              <EmptyState title="The canvas is empty" body="Drag components from the library, or describe your product in the Vision workspace and review a proposed architecture."
                action={<Button variant="primary" onClick={onGoToVision}>Describe the product</Button>} />
            </div>
          </div>
        )}
        <ArchCanvas highlight={highlight} />
      </div>
      <aside className="flex w-80 shrink-0 flex-col border-l border-line bg-panel" aria-label="Inspector and assistant">
        <div role="tablist" className="flex border-b border-line text-xs">
          {(["inspect", "assistant"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => setTab(t)}
              className={`flex-1 px-3 py-2.5 font-medium ${tab === t ? "border-b-2 border-accent text-fg" : "text-muted hover:text-fg"}`}>
              {t === "inspect" ? "Inspector" : "AI assistant"}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-auto" role="tabpanel">{tab === "inspect" ? <Inspector onDelete={requestDelete} /> : <Assistant />}</div>
      </aside>
      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete selection?"
        footer={<><Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button variant="danger" onClick={() => { edit((d) => deleteElements(d, selection.nodes, selection.edges)); setSelection({ nodes: [], edges: [] }); setConfirmDelete(false); }}>Delete</Button></>}>
        {impact && (
          <div className="space-y-2">
            {impact.nodes.length > 0 && <p>Components: {impact.nodes.join(", ")}</p>}
            <p>Connections removed: {impact.edges + selection.edges.length}</p>
            {impact.entities.length > 0 && <p className="text-warn">Entities kept but unlinked from their data store: {impact.entities.join(", ")}</p>}
            {impact.endpoints.length > 0 && <p className="text-warn">Endpoints kept but unassigned: {impact.endpoints.join(", ")}</p>}
            <p className="text-xs text-muted">You can undo this (⌘Z) or restore an earlier version.</p>
          </div>
        )}
      </Dialog>
    </div>
  );
}

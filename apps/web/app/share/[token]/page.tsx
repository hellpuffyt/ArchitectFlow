"use client";
import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Background, MarkerType, ReactFlow, ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ApiError, api } from "@/lib/api";
import type { ArchitectureDocument } from "@/lib/types";
import { ArchNodeView } from "@/components/canvas/ArchNodeView";
import { Badge, ErrorBox, Spinner } from "@/components/ui";
import { Logo } from "@/components/Logo";

const nodeTypes = { arch: ArchNodeView };

function Shared() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<{ name: string; revision: number; document: ArchitectureDocument; expires_at: string } | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  useEffect(() => { api.shared(token).then(setData, (e) => setError(e as ApiError)); }, [token]);
  if (error) return <main className="mx-auto max-w-lg p-10"><ErrorBox message={error.message} /></main>;
  if (!data) return <div className="flex h-screen items-center justify-center"><Spinner /></div>;
  const d = data.document;
  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b border-line bg-panel px-4 py-2.5">
        <Logo size={16} /><span className="font-medium">{data.name}</span><Badge>read-only · revision {data.revision}</Badge>
        <span className="ml-auto text-xs text-faint">Link expires {new Date(data.expires_at).toLocaleString()}</span>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_320px]">
        <ReactFlowProvider>
          <ReactFlow nodeTypes={nodeTypes} fitView nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} proOptions={{ hideAttribution: true }}
            nodes={d.nodes.map((n) => ({ id: n.id, type: "arch", position: n.position, data: { node: n, highlight: false } }))}
            edges={d.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: [e.label, e.protocol].filter(Boolean).join(" · "), markerEnd: { type: MarkerType.ArrowClosed } }))}>
            <Background gap={22} size={1} color="#2a3142" />
          </ReactFlow>
        </ReactFlowProvider>
        <aside className="space-y-4 overflow-auto border-l border-line bg-panel p-4 text-sm">
          <div><p className="text-xs font-semibold uppercase text-faint">Vision</p><p className="mt-1 text-muted">{d.vision || "—"}</p></div>
          <div><p className="text-xs font-semibold uppercase text-faint">Requirements</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted">{[...d.requirements.functional, ...d.requirements.nonfunctional].map((r) => <li key={r.id}>{r.text}</li>)}</ul></div>
          <div><p className="text-xs font-semibold uppercase text-faint">Pages</p>
            <ul className="mt-1 space-y-0.5 text-muted">{(d.design?.pages ?? []).map((p) => <li key={p.id}><code>{p.route}</code> {p.name}</li>)}</ul></div>
        </aside>
      </div>
    </div>
  );
}

export default function SharePage() {
  return <Suspense fallback={<div className="flex h-screen items-center justify-center"><Spinner /></div>}><Shared /></Suspense>;
}

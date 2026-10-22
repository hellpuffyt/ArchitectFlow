"use client";
import { useState } from "react";
import { Copy, Group as GroupIcon, Link2, Plus, Trash2, Ungroup, X } from "lucide-react";
import { useProject } from "@/lib/project-store";
import { NODE_TYPES } from "@/lib/registry";
import { addEdge, duplicateNodes, groupNodes, ungroup, updateEdge, updateNode } from "@/lib/graph";
import type { ArchEdge, ArchNode, PropValue } from "@/lib/types";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";

const PROTOCOLS = ["HTTPS", "HTTP", "gRPC", "WSS", "WS", "GraphQL", "SQL/TLS", "AMQP/TLS", "Kafka", "RESP/TLS", "OTLP", "SMTP/TLS", "TCP"];

function triState(v: boolean | null): string { return v === null ? "" : v ? "true" : "false"; }
function fromTri(v: string): boolean | null { return v === "" ? null : v === "true"; }

export function Inspector({ onDelete }: { onDelete: () => void }) {
  const { doc, selection, edit, setSelection } = useProject();
  if (!doc) return null;
  const nodes = doc.nodes.filter((n) => selection.nodes.includes(n.id));
  const edges = doc.edges.filter((e) => selection.edges.includes(e.id));
  if (nodes.length === 1 && edges.length === 0) return <NodeInspector node={nodes[0]} onDelete={onDelete} />;
  if (edges.length === 1 && nodes.length === 0) return <EdgeInspector edge={edges[0]} onDelete={onDelete} />;
  if (nodes.length + edges.length > 1) {
    const groupId = nodes[0]?.group_id;
    return (
      <div className="space-y-3 p-4 text-sm">
        <p className="font-medium">{nodes.length} components, {edges.length} connections selected</p>
        <div className="flex flex-wrap gap-2">
          {nodes.length > 1 && <Button size="sm" onClick={() => edit((d) => groupNodes(d, nodes.map((n) => n.id), "Group")[0])}><GroupIcon size={13} /> Group</Button>}
          {groupId && nodes.every((n) => n.group_id === groupId) && <Button size="sm" onClick={() => edit((d) => ungroup(d, groupId))}><Ungroup size={13} /> Ungroup</Button>}
          {nodes.length > 0 && <Button size="sm" onClick={() => { let ids: string[] = []; edit((d) => { const [n, c] = duplicateNodes(d, nodes.map((x) => x.id)); ids = c; return n; }); setTimeout(() => setSelection({ nodes: ids, edges: [] }), 0); }}><Copy size={13} /> Duplicate</Button>}
          <Button size="sm" variant="danger" onClick={onDelete}><Trash2 size={13} /> Delete</Button>
        </div>
        <GroupLabels />
      </div>
    );
  }
  return (
    <div className="space-y-3 p-4 text-sm text-muted">
      <p>Select a component or connection to edit it.</p>
      <ul className="list-disc space-y-1 pl-4 text-xs">
        <li>Drag from the library, or click an item to add it.</li>
        <li>Drag between handles to connect; or use “Connect to…” in the inspector.</li>
        <li>Drag on empty canvas to box-select; Shift/⌘-click to multi-select; Space+drag or scroll to pan.</li>
        <li>⌘Z / ⇧⌘Z undo/redo · ⌫ delete · ⌘D duplicate · ⌘G group · F fit view · / search</li>
      </ul>
      <GroupLabels />
    </div>
  );
}

function GroupLabels() {
  const { doc, edit } = useProject();
  if (!doc || doc.groups.length === 0) return null;
  return (
    <div className="space-y-2 border-t border-line pt-3">
      <p className="text-xs font-medium text-muted">Groups</p>
      {doc.groups.map((g) => (
        <div key={g.id} className="flex items-center gap-2">
          <Input aria-label={`Group name ${g.label}`} value={g.label} maxLength={200}
            onChange={(e) => edit((d) => ({ ...d, groups: d.groups.map((x) => (x.id === g.id ? { ...x, label: e.target.value } : x)) }))} />
          <Button size="sm" variant="ghost" aria-label={`Ungroup ${g.label}`} onClick={() => edit((d) => ungroup(d, g.id))}><Ungroup size={13} /></Button>
        </div>
      ))}
    </div>
  );
}

function NodeInspector({ node, onDelete }: { node: ArchNode; onDelete: () => void }) {
  const { doc, edit, setSelection } = useProject();
  const [target, setTarget] = useState("");
  const [propKey, setPropKey] = useState("");
  const set = (patch: Partial<ArchNode>) => edit((d) => updateNode(d, node.id, patch));
  const others = (doc?.nodes ?? []).filter((n) => n.id !== node.id);
  return (
    <div className="space-y-3 p-4" aria-label="Component inspector">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-faint">Component</p>
        <code className="text-[11px] text-faint">{node.id}</code>
      </div>
      <Field label="Name" htmlFor="n-label"><Input id="n-label" value={node.label} maxLength={200} onChange={(e) => set({ label: e.target.value })} /></Field>
      <Field label="Type" htmlFor="n-type">
        <Select id="n-type" value={node.type} onChange={(e) => set({ type: e.target.value })}>
          {NODE_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </Select>
      </Field>
      <Field label="Technology" htmlFor="n-tech"><Input id="n-tech" value={node.technology} maxLength={200} placeholder="e.g. PostgreSQL 17" onChange={(e) => set({ technology: e.target.value })} /></Field>
      <Field label="Responsibility" htmlFor="n-desc"><Textarea id="n-desc" rows={3} value={node.description} maxLength={4000} onChange={(e) => set({ description: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Owner" htmlFor="n-owner"><Input id="n-owner" value={node.owner} maxLength={200} onChange={(e) => set({ owner: e.target.value })} /></Field>
        <Field label="Replicas" htmlFor="n-rep"><Input id="n-rep" type="number" min={0} max={10000} value={node.replicas} onChange={(e) => set({ replicas: Math.max(0, Math.min(10000, Number(e.target.value) || 0)) })} /></Field>
      </div>
      <Field label="Public exposure" htmlFor="n-public" hint="Default follows the component type.">
        <Select id="n-public" value={triState(node.public)} onChange={(e) => set({ public: fromTri(e.target.value) })}>
          <option value="">Type default</option><option value="true">Publicly reachable</option><option value="false">Internal only</option>
        </Select>
      </Field>
      <div>
        <p className="mb-1 text-xs font-medium text-muted">Properties</p>
        <div className="space-y-1.5">
          {Object.entries(node.properties).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1.5">
              <code className="w-28 truncate text-[11px] text-muted" title={k}>{k}</code>
              <Input aria-label={`Property ${k}`} value={String(v)} className="text-xs"
                onChange={(e) => set({ properties: { ...node.properties, [k]: coerce(e.target.value) } })} />
              <Button size="sm" variant="ghost" aria-label={`Remove property ${k}`} onClick={() => { const p = { ...node.properties }; delete p[k]; set({ properties: p }); }}><X size={12} /></Button>
            </div>
          ))}
          <div className="flex gap-1.5">
            <Input aria-label="New property name" placeholder="e.g. backup" className="text-xs" value={propKey} maxLength={200} onChange={(e) => setPropKey(e.target.value)} />
            <Button size="sm" disabled={!propKey.trim() || propKey.trim() in node.properties} onClick={() => { set({ properties: { ...node.properties, [propKey.trim()]: "" } }); setPropKey(""); }}><Plus size={12} /></Button>
          </div>
        </div>
      </div>
      <div className="flex gap-1.5">
        <Select aria-label="Connect to" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Connect to…</option>
          {others.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
        </Select>
        <Button size="sm" disabled={!target} onClick={() => { let id: string | null = null; edit((d) => { const [n, e] = addEdge(d, node.id, target); id = e; return n; }); setTarget(""); setTimeout(() => id && setSelection({ nodes: [], edges: [id] }), 0); }}><Link2 size={13} /> Connect</Button>
      </div>
      <div className="flex gap-2 border-t border-line pt-3">
        <Button size="sm" onClick={() => { let ids: string[] = []; edit((d) => { const [n, c] = duplicateNodes(d, [node.id]); ids = c; return n; }); setTimeout(() => setSelection({ nodes: ids, edges: [] }), 0); }}><Copy size={13} /> Duplicate</Button>
        <Button size="sm" variant="danger" onClick={onDelete}><Trash2 size={13} /> Delete</Button>
      </div>
    </div>
  );
}

function coerce(v: string): PropValue {
  if (v === "true") return true;
  if (v === "false") return false;
  if (v.trim() !== "" && !Number.isNaN(Number(v)) && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v);
  return v;
}

function EdgeInspector({ edge, onDelete }: { edge: ArchEdge; onDelete: () => void }) {
  const { doc, edit } = useProject();
  const set = (patch: Partial<ArchEdge>) => edit((d) => updateEdge(d, edge.id, patch));
  const label = (id: string) => doc?.nodes.find((n) => n.id === id)?.label ?? id;
  return (
    <div className="space-y-3 p-4" aria-label="Connection inspector">
      <p className="text-xs font-semibold uppercase tracking-wider text-faint">Connection</p>
      <p className="text-sm">{label(edge.source)} → {label(edge.target)}</p>
      <Field label="Label" htmlFor="e-label"><Input id="e-label" value={edge.label} maxLength={200} onChange={(e) => set({ label: e.target.value })} /></Field>
      <Field label="Protocol" htmlFor="e-proto">
        <Input id="e-proto" list="protocols" value={edge.protocol} maxLength={200} onChange={(e) => set({ protocol: e.target.value })} />
        <datalist id="protocols">{PROTOCOLS.map((p) => <option key={p} value={p} />)}</datalist>
      </Field>
      <Field label="Data carried" htmlFor="e-data"><Input id="e-data" value={edge.data} maxLength={200} placeholder="e.g. invoices, PII" onChange={(e) => set({ data: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Direction" htmlFor="e-dir">
          <Select id="e-dir" value={edge.direction} onChange={(e) => set({ direction: e.target.value as ArchEdge["direction"] })}>
            <option value="one_way">One way</option><option value="two_way">Two way</option>
          </Select>
        </Field>
        <Field label="Mode" htmlFor="e-sync">
          <Select id="e-sync" value={edge.synchronous ? "sync" : "async"} onChange={(e) => set({ synchronous: e.target.value === "sync" })}>
            <option value="sync">Synchronous</option><option value="async">Asynchronous</option>
          </Select>
        </Field>
      </div>
      <Field label="Encryption in transit" htmlFor="e-enc">
        <Select id="e-enc" value={triState(edge.encrypted)} onChange={(e) => set({ encrypted: fromTri(e.target.value) })}>
          <option value="">Not stated</option><option value="true">Encrypted (TLS)</option><option value="false">Unencrypted</option>
        </Select>
      </Field>
      <div className="border-t border-line pt-3"><Button size="sm" variant="danger" onClick={onDelete}><Trash2 size={13} /> Delete connection</Button></div>
    </div>
  );
}

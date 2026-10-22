"use client";
import { useMemo, useState } from "react";
import { Background, MarkerType, ReactFlow, ReactFlowProvider } from "@xyflow/react";
import type { Edge, Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import { useProject } from "@/lib/project-store";
import { uniqueId } from "@/lib/graph";
import { FIELD_TYPES } from "@/lib/types";
import type { Entity, EntityField, FieldType } from "@/lib/types";
import { Button, EmptyState, Field, Input, Select, Textarea } from "@/components/ui";

const DATASTORES = new Set(["database", "search_index", "cache", "object_storage"]);
const snake = (s: string) => s.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^[^a-z_]+/, "").slice(0, 63);

export function DatabaseView() {
  const { doc, edit } = useProject();
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "erd">("edit");
  if (!doc) return null;
  const entities = doc.database.entities;
  const entity = entities.find((e) => e.id === selected) ?? entities[0] ?? null;
  const setEntity = (id: string, patch: Partial<Entity>) => edit((d) => ({ ...d, database: { entities: d.database.entities.map((e) => (e.id === id ? { ...e, ...patch } : e)) } }));

  function addEntity() {
    const id = uniqueId("ent-new", entities.map((e) => e.id));
    const name = uniqueId("new_table", entities.map((e) => e.name)).replace(/-/g, "_");
    const db = doc!.nodes.find((n) => n.type === "database");
    edit((d) => ({ ...d, database: { entities: [...d.database.entities, { id, name, label: "", node_id: db?.id ?? null, description: "",
      fields: [{ id: `${id}-id`, name: "id", type: "uuid", primary_key: true, nullable: false, unique: false, foreign_key: null, description: "" }], indexes: [] }] } }));
    setSelected(id);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-line px-6 py-3">
        <h1 className="text-lg font-semibold">Database design</h1>
        <div role="tablist" className="ml-4 flex gap-1 text-xs">
          {(["edit", "erd"] as const).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} type="button" onClick={() => setMode(m)}
              className={`rounded-md px-2.5 py-1 ${mode === m ? "bg-panel-2 text-fg" : "text-muted"}`}>{m === "edit" ? "Entities" : "ER diagram"}</button>
          ))}
        </div>
        <Button className="ml-auto" variant="primary" size="sm" onClick={addEntity}><Plus size={13} /> Entity</Button>
      </div>
      {entities.length === 0 ? <div className="p-8"><EmptyState title="No entities yet" body="Generate an architecture from the vision, or add entities by hand." action={<Button onClick={addEntity}><Plus size={13} /> Add entity</Button>} /></div>
        : mode === "erd" ? <ReactFlowProvider><Erd /></ReactFlowProvider> : (
        <div className="flex min-h-0 flex-1">
          <ul className="w-56 shrink-0 overflow-auto border-r border-line bg-panel py-2" aria-label="Entities">
            {entities.map((e) => (
              <li key={e.id}><button type="button" onClick={() => setSelected(e.id)} aria-current={entity?.id === e.id}
                className={`w-full px-4 py-1.5 text-left font-mono text-xs ${entity?.id === e.id ? "bg-panel-2 text-fg" : "text-muted hover:text-fg"}`}>{e.name}
                {!e.node_id && <span className="ml-1 text-warn" title="Not linked to a data store">•</span>}</button></li>
            ))}
          </ul>
          {entity && <EntityEditor key={entity.id} entity={entity} setEntity={setEntity} />}
        </div>
      )}
    </div>
  );
}

function EntityEditor({ entity, setEntity }: { entity: Entity; setEntity: (id: string, p: Partial<Entity>) => void }) {
  const { doc, edit } = useProject();
  if (!doc) return null;
  const setField = (fid: string, patch: Partial<EntityField>) => setEntity(entity.id, { fields: entity.fields.map((f) => (f.id === fid ? { ...f, ...patch } : f)) });
  const others = doc.database.entities;
  return (
    <div className="min-w-0 flex-1 space-y-4 overflow-auto p-6">
      <div className="grid grid-cols-3 gap-3">
        <Field label="Table name (snake_case)" htmlFor="ent-name"><Input id="ent-name" className="font-mono" value={entity.name} onChange={(e) => setEntity(entity.id, { name: snake(e.target.value) || "t" })} /></Field>
        <Field label="Label" htmlFor="ent-label"><Input id="ent-label" value={entity.label} maxLength={200} onChange={(e) => setEntity(entity.id, { label: e.target.value })} /></Field>
        <Field label="Stored in" htmlFor="ent-node">
          <Select id="ent-node" value={entity.node_id ?? ""} onChange={(e) => setEntity(entity.id, { node_id: e.target.value || null })}>
            <option value="">— not linked —</option>
            {doc.nodes.filter((n) => DATASTORES.has(n.type)).map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Description" htmlFor="ent-desc"><Textarea id="ent-desc" rows={2} value={entity.description} maxLength={4000} onChange={(e) => setEntity(entity.id, { description: e.target.value })} /></Field>
      <table className="w-full text-xs" aria-label={`Fields of ${entity.name}`}>
        <thead><tr className="text-left text-faint"><th className="py-1">Column</th><th>Type</th><th>PK</th><th>Null</th><th>Unique</th><th>Foreign key</th><th /></tr></thead>
        <tbody>
          {entity.fields.map((f) => (
            <tr key={f.id} className="border-t border-line">
              <td className="py-1 pr-2"><Input aria-label={`Column name ${f.name}`} className="font-mono text-xs" value={f.name} onChange={(e) => setField(f.id, { name: snake(e.target.value) || "c" })} /></td>
              <td className="pr-2"><Select aria-label={`Column type ${f.name}`} className="text-xs" value={f.type} onChange={(e) => setField(f.id, { type: e.target.value as FieldType })}>{FIELD_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></td>
              <td><input type="checkbox" aria-label={`Primary key ${f.name}`} checked={f.primary_key} onChange={(e) => setField(f.id, { primary_key: e.target.checked, nullable: e.target.checked ? false : f.nullable })} /></td>
              <td><input type="checkbox" aria-label={`Nullable ${f.name}`} checked={f.nullable} onChange={(e) => setField(f.id, { nullable: e.target.checked })} /></td>
              <td><input type="checkbox" aria-label={`Unique ${f.name}`} checked={f.unique} onChange={(e) => setField(f.id, { unique: e.target.checked })} /></td>
              <td className="pr-2">
                <Select aria-label={`Foreign key ${f.name}`} className="text-xs" value={f.foreign_key ? `${f.foreign_key.entity_id}|${f.foreign_key.field}` : ""}
                  onChange={(e) => { const [eid, fld] = e.target.value.split("|"); setField(f.id, { foreign_key: e.target.value ? { entity_id: eid, field: fld, on_delete: f.foreign_key?.on_delete ?? "restrict" } : null }); }}>
                  <option value="">—</option>
                  {others.flatMap((o) => o.fields.filter((x) => x.primary_key || x.unique).map((x) => <option key={`${o.id}|${x.name}`} value={`${o.id}|${x.name}`}>{o.name}.{x.name}</option>))}
                </Select>
              </td>
              <td><Button size="sm" variant="ghost" aria-label={`Remove column ${f.name}`} onClick={() => setEntity(entity.id, { fields: entity.fields.filter((x) => x.id !== f.id) })}><Trash2 size={12} /></Button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => setEntity(entity.id, { fields: [...entity.fields, { id: uniqueId(`${entity.id}-col`, entity.fields.map((f) => f.id)), name: uniqueId("column", entity.fields.map((f) => f.name)).replace(/-/g, "_"), type: "text", primary_key: false, nullable: true, unique: false, foreign_key: null, description: "" }] })}><Plus size={12} /> Column</Button>
        <Button size="sm" variant="danger" onClick={() => edit((d) => ({ ...d, database: { entities: d.database.entities.filter((e) => e.id !== entity.id) },
          api: { endpoints: d.api.endpoints.map((ep) => ({ ...ep, response_entity_id: ep.response_entity_id === entity.id ? null : ep.response_entity_id,
            request_fields: ep.request_fields.map((f) => (f.entity_id === entity.id ? { ...f, entity_id: null, entity_field: null } : f)),
            response_fields: ep.response_fields.map((f) => (f.entity_id === entity.id ? { ...f, entity_id: null, entity_field: null } : f)) })) } }))}><Trash2 size={12} /> Delete entity (unlinks API fields)</Button>
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-muted">Indexes (suggestions you can edit)</p>
        {entity.indexes.map((ix, i) => (
          <div key={i} className="mb-1 flex items-center gap-2 text-xs">
            <Input aria-label={`Index ${i + 1} columns`} className="font-mono text-xs" value={ix.fields.join(", ")}
              onChange={(e) => setEntity(entity.id, { indexes: entity.indexes.map((x, j) => (j === i ? { ...x, fields: e.target.value.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 8) } : x)) })} />
            <label className="flex items-center gap-1"><input type="checkbox" checked={ix.unique} onChange={(e) => setEntity(entity.id, { indexes: entity.indexes.map((x, j) => (j === i ? { ...x, unique: e.target.checked } : x)) })} /> unique</label>
            <Input aria-label={`Index ${i + 1} reason`} className="text-xs" value={ix.reason} maxLength={200} onChange={(e) => setEntity(entity.id, { indexes: entity.indexes.map((x, j) => (j === i ? { ...x, reason: e.target.value } : x)) })} />
            <Button size="sm" variant="ghost" aria-label={`Remove index ${i + 1}`} onClick={() => setEntity(entity.id, { indexes: entity.indexes.filter((_, j) => j !== i) })}><Trash2 size={12} /></Button>
          </div>
        ))}
        <Button size="sm" variant="ghost" disabled={entity.fields.length === 0} onClick={() => setEntity(entity.id, { indexes: [...entity.indexes, { fields: [entity.fields[0].name], unique: false, reason: "" }] })}><Plus size={12} /> Index</Button>
      </div>
    </div>
  );
}

function Erd() {
  const { doc } = useProject();
  const { nodes, edges } = useMemo(() => {
    const ents = doc?.database.entities ?? [];
    const cols = Math.max(1, Math.ceil(Math.sqrt(ents.length)));
    const nodes: Node[] = ents.map((e, i) => ({
      id: e.id, position: { x: (i % cols) * 280, y: Math.floor(i / cols) * 260 }, draggable: true,
      data: { label: (
        <div className="text-left font-mono text-[11px]">
          <p className="mb-1 border-b border-line pb-1 font-semibold text-fg">{e.name}</p>
          {e.fields.map((f) => <p key={f.id} className="flex gap-1 text-muted">{f.primary_key ? <KeyRound size={10} className="text-warn" /> : <span className="w-2.5" />}{f.name}<span className="ml-auto text-faint">{f.type}{f.foreign_key ? " FK" : ""}</span></p>)}
        </div>) },
      style: { background: "var(--panel-2)", border: "1px solid var(--line-strong)", borderRadius: 8, width: 220, color: "var(--fg)" },
    }));
    const edges: Edge[] = ents.flatMap((e) => e.fields.filter((f) => f.foreign_key && ents.some((t) => t.id === f.foreign_key?.entity_id)).map((f) => ({
      id: `${e.id}-${f.id}`, source: e.id, target: f.foreign_key!.entity_id, label: `${f.name} → ${f.foreign_key!.field}`,
      markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 1.4 },
    })));
    return { nodes, edges };
  }, [doc]);
  return (
    <div className="min-h-0 flex-1" aria-label="Entity relationship diagram">
      <ReactFlow defaultNodes={nodes} defaultEdges={edges} fitView nodesConnectable={false} proOptions={{ hideAttribution: true }}>
        <Background gap={22} size={1} color="#2a3142" />
      </ReactFlow>
    </div>
  );
}

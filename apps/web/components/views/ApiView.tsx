"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useProject } from "@/lib/project-store";
import { uniqueId } from "@/lib/graph";
import { FIELD_TYPES } from "@/lib/types";
import type { ApiField, Endpoint, FieldType, HttpMethod } from "@/lib/types";
import { Badge, Button, EmptyState, Field, Input, Select } from "@/components/ui";

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const SERVICES = new Set(["service", "api_gateway", "auth_service", "worker"]);
const METHOD_TONE = { GET: "info", POST: "ok", PUT: "warn", PATCH: "warn", DELETE: "err" } as const;

export function ApiView() {
  const { doc, edit } = useProject();
  const [selected, setSelected] = useState<string | null>(null);
  if (!doc) return null;
  const eps = doc.api.endpoints;
  const ep = eps.find((e) => e.id === selected) ?? eps[0] ?? null;
  const setEp = (id: string, patch: Partial<Endpoint>) => edit((d) => ({ ...d, api: { endpoints: d.api.endpoints.map((e) => (e.id === id ? { ...e, ...patch } : e)) } }));
  function add() {
    const id = uniqueId("api-new", eps.map((e) => e.id));
    const svc = doc!.nodes.find((n) => n.type === "service");
    edit((d) => ({ ...d, api: { endpoints: [...d.api.endpoints, { id, method: "GET", path: `/api/${id}`, summary: "", service_node_id: svc?.id ?? null, auth: "authenticated", roles: [],
      request_fields: [], response_entity_id: null, response_fields: [], response_is_list: false, paginated: false, filters: [], errors: [{ status: 401, description: "not signed in" }] }] } }));
    setSelected(id);
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center border-b border-line px-6 py-3">
        <h1 className="text-lg font-semibold">API design</h1>
        <Button className="ml-auto" variant="primary" size="sm" onClick={add}><Plus size={13} /> Endpoint</Button>
      </div>
      {eps.length === 0 ? <div className="p-8"><EmptyState title="No endpoints yet" body="Generate from the vision or add endpoints by hand." action={<Button onClick={add}><Plus size={13} /> Add endpoint</Button>} /></div> : (
        <div className="flex min-h-0 flex-1">
          <ul className="w-72 shrink-0 overflow-auto border-r border-line bg-panel py-2" aria-label="Endpoints">
            {eps.map((e) => (
              <li key={e.id}><button type="button" onClick={() => setSelected(e.id)} aria-current={ep?.id === e.id}
                className={`flex w-full items-center gap-2 px-4 py-1.5 text-left font-mono text-xs ${ep?.id === e.id ? "bg-panel-2 text-fg" : "text-muted hover:text-fg"}`}>
                <Badge tone={METHOD_TONE[e.method]}>{e.method}</Badge><span className="truncate">{e.path}</span>
                {!e.service_node_id && <span className="text-warn" title="No implementing service">•</span>}
              </button></li>
            ))}
          </ul>
          {ep && <EndpointEditor key={ep.id} ep={ep} setEp={setEp} />}
        </div>
      )}
    </div>
  );
}

function FieldsTable({ title, fields, onChange }: { title: string; fields: ApiField[]; onChange: (f: ApiField[]) => void }) {
  const { doc } = useProject();
  const ents = doc?.database.entities ?? [];
  const set = (i: number, patch: Partial<ApiField>) => onChange(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted">{title}</p>
      <table className="w-full text-xs" aria-label={title}>
        <tbody>
          {fields.map((f, i) => (
            <tr key={i} className="border-t border-line">
              <td className="py-1 pr-2"><Input aria-label={`${title} field ${i + 1} name`} className="font-mono text-xs" value={f.name} maxLength={200} onChange={(e) => set(i, { name: e.target.value })} /></td>
              <td className="pr-2"><Select aria-label={`${title} field ${i + 1} type`} className="text-xs" value={f.type} onChange={(e) => set(i, { type: e.target.value as FieldType })}>{FIELD_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></td>
              <td className="pr-2"><label className="flex items-center gap-1 text-muted"><input type="checkbox" checked={f.required} onChange={(e) => set(i, { required: e.target.checked })} /> required</label></td>
              <td className="pr-2">
                <Select aria-label={`${title} field ${i + 1} maps to`} className="text-xs" value={f.entity_id ? `${f.entity_id}|${f.entity_field ?? ""}` : ""}
                  onChange={(e) => { const [eid, fld] = e.target.value.split("|"); set(i, { entity_id: eid || null, entity_field: fld || null }); }}>
                  <option value="">no data mapping</option>
                  {ents.flatMap((en) => en.fields.map((x) => <option key={`${en.id}|${x.name}`} value={`${en.id}|${x.name}`}>{en.name}.{x.name}</option>))}
                </Select>
              </td>
              <td><Button size="sm" variant="ghost" aria-label={`Remove ${title} field ${i + 1}`} onClick={() => onChange(fields.filter((_, j) => j !== i))}><Trash2 size={12} /></Button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <Button size="sm" variant="ghost" onClick={() => onChange([...fields, { name: `field_${fields.length + 1}`, type: "text", required: true, entity_id: null, entity_field: null }])}><Plus size={12} /> Field</Button>
    </div>
  );
}

function EndpointEditor({ ep, setEp }: { ep: Endpoint; setEp: (id: string, p: Partial<Endpoint>) => void }) {
  const { doc, edit } = useProject();
  if (!doc) return null;
  const roles = doc.actors.filter((a) => a.is_role);
  return (
    <div className="min-w-0 flex-1 space-y-4 overflow-auto p-6">
      <div className="grid grid-cols-[110px_1fr] gap-3">
        <Field label="Method" htmlFor="ep-method"><Select id="ep-method" value={ep.method} onChange={(e) => setEp(ep.id, { method: e.target.value as HttpMethod })}>{METHODS.map((m) => <option key={m}>{m}</option>)}</Select></Field>
        <Field label="Path" htmlFor="ep-path" hint="Start with /; use {id} for path parameters."><Input id="ep-path" className="font-mono" value={ep.path} maxLength={200} onChange={(e) => setEp(ep.id, { path: e.target.value.startsWith("/") ? e.target.value.replace(/[^A-Za-z0-9_\-/{}.:]/g, "") : `/${e.target.value}` })} /></Field>
      </div>
      <Field label="Summary" htmlFor="ep-sum"><Input id="ep-sum" value={ep.summary} maxLength={200} onChange={(e) => setEp(ep.id, { summary: e.target.value })} /></Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Implemented by" htmlFor="ep-svc">
          <Select id="ep-svc" value={ep.service_node_id ?? ""} onChange={(e) => setEp(ep.id, { service_node_id: e.target.value || null })}>
            <option value="">— unassigned —</option>
            {doc.nodes.filter((n) => SERVICES.has(n.type)).map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
          </Select>
        </Field>
        <Field label="Access" htmlFor="ep-auth">
          <Select id="ep-auth" value={ep.auth} onChange={(e) => setEp(ep.id, { auth: e.target.value as Endpoint["auth"], roles: e.target.value === "roles" ? ep.roles : [] })}>
            <option value="public">Public</option><option value="authenticated">Any signed-in user</option><option value="roles">Specific roles</option>
          </Select>
        </Field>
        <Field label="Returns entity" htmlFor="ep-ent">
          <Select id="ep-ent" value={ep.response_entity_id ?? ""} onChange={(e) => setEp(ep.id, { response_entity_id: e.target.value || null })}>
            <option value="">—</option>
            {doc.database.entities.map((en) => <option key={en.id} value={en.id}>{en.name}</option>)}
          </Select>
        </Field>
      </div>
      {ep.auth === "roles" && (
        <fieldset className="flex flex-wrap gap-3 text-xs"><legend className="mb-1 text-xs font-medium text-muted">Allowed roles</legend>
          {roles.map((r) => (
            <label key={r.id} className="flex items-center gap-1 text-muted">
              <input type="checkbox" checked={ep.roles.includes(r.id)} onChange={(e) => setEp(ep.id, { roles: e.target.checked ? [...ep.roles, r.id] : ep.roles.filter((x) => x !== r.id) })} /> {r.name}
            </label>
          ))}
          {roles.length === 0 && <span className="text-faint">Define roles in Requirements first.</span>}
        </fieldset>
      )}
      <div className="flex flex-wrap gap-4 text-xs text-muted">
        <label className="flex items-center gap-1"><input type="checkbox" checked={ep.response_is_list} onChange={(e) => setEp(ep.id, { response_is_list: e.target.checked })} /> returns a list</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={ep.paginated} onChange={(e) => setEp(ep.id, { paginated: e.target.checked })} /> paginated</label>
        <label className="flex items-center gap-1">filters <Input aria-label="Filters" className="h-7 w-48 text-xs" value={ep.filters.join(", ")} onChange={(e) => setEp(ep.id, { filters: e.target.value.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20) })} /></label>
      </div>
      <FieldsTable title="Request body" fields={ep.request_fields} onChange={(f) => setEp(ep.id, { request_fields: f })} />
      <FieldsTable title="Response" fields={ep.response_fields} onChange={(f) => setEp(ep.id, { response_fields: f })} />
      <div>
        <p className="mb-1 text-xs font-medium text-muted">Error responses</p>
        {ep.errors.map((er, i) => (
          <div key={i} className="mb-1 flex items-center gap-2">
            <Input aria-label={`Error ${i + 1} status`} type="number" min={400} max={599} className="w-24 text-xs" value={er.status}
              onChange={(e) => setEp(ep.id, { errors: ep.errors.map((x, j) => (j === i ? { ...x, status: Math.min(599, Math.max(400, Number(e.target.value) || 400)) } : x)) })} />
            <Input aria-label={`Error ${i + 1} description`} className="text-xs" value={er.description} maxLength={200} onChange={(e) => setEp(ep.id, { errors: ep.errors.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })} />
            <Button size="sm" variant="ghost" aria-label={`Remove error ${i + 1}`} onClick={() => setEp(ep.id, { errors: ep.errors.filter((_, j) => j !== i) })}><Trash2 size={12} /></Button>
          </div>
        ))}
        <Button size="sm" variant="ghost" onClick={() => setEp(ep.id, { errors: [...ep.errors, { status: 400, description: "bad request" }] })}><Plus size={12} /> Error</Button>
      </div>
      <Button size="sm" variant="danger" onClick={() => edit((d) => ({ ...d, api: { endpoints: d.api.endpoints.filter((e) => e.id !== ep.id) } }))}><Trash2 size={12} /> Delete endpoint</Button>
    </div>
  );
}

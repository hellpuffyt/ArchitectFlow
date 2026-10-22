"use client";
import { Plus, Trash2 } from "lucide-react";
import { useProject } from "@/lib/project-store";
import { PAGE_STATE_KINDS } from "@/lib/design-types";
import type { Page, PageStateKind } from "@/lib/design-types";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";

export function PageSettings({ page, onChange, onDelete, onDuplicate }: { page: Page; onChange: (p: Partial<Page>) => void; onDelete: () => void; onDuplicate: () => void }) {
  const { doc } = useProject();
  if (!doc) return null;
  const roles = doc.actors.filter((a) => a.is_role);
  const unused = PAGE_STATE_KINDS.filter((k) => !page.states.some((s) => s.kind === k));
  return (
    <div className="space-y-3 p-4 text-xs" aria-label="Page settings">
      <p className="text-xs font-semibold uppercase tracking-wider text-faint">Page</p>
      <Field label="Name" htmlFor="pg-name"><Input id="pg-name" className="text-xs" value={page.name} maxLength={200} onChange={(e) => onChange({ name: e.target.value })} /></Field>
      <Field label="Route" htmlFor="pg-route" hint="Starts with /; [id] or {id} for parameters.">
        <Input id="pg-route" className="font-mono text-xs" value={page.route} maxLength={200}
          onChange={(e) => { const v = e.target.value.startsWith("/") ? e.target.value : `/${e.target.value}`; onChange({ route: v.replace(/[^A-Za-z0-9_\-/{}:.[\]]/g, "") }); }} />
      </Field>
      <Field label="Parent page" htmlFor="pg-parent">
        <Select id="pg-parent" className="text-xs" value={page.parent_id ?? ""} onChange={(e) => onChange({ parent_id: e.target.value || null })}>
          <option value="">— top level —</option>
          {doc.design.pages.filter((p) => p.id !== page.id).map((p) => <option key={p.id} value={p.id}>{p.name} ({p.route})</option>)}
        </Select>
      </Field>
      <Field label="Description" htmlFor="pg-desc"><Textarea id="pg-desc" rows={2} className="text-xs" value={page.description} maxLength={4000} onChange={(e) => onChange({ description: e.target.value })} /></Field>
      <label className="flex items-center gap-2 text-muted"><input type="checkbox" checked={page.requires_auth} onChange={(e) => onChange({ requires_auth: e.target.checked })} /> Requires sign-in</label>
      {page.requires_auth && (
        <fieldset className="flex flex-wrap gap-3"><legend className="mb-1 text-muted">Roles allowed</legend>
          {roles.map((r) => (
            <label key={r.id} className="flex items-center gap-1 text-muted"><input type="checkbox" checked={page.roles.includes(r.id)}
              onChange={(e) => onChange({ roles: e.target.checked ? [...page.roles, r.id] : page.roles.filter((x) => x !== r.id) })} /> {r.name}</label>
          ))}
          {roles.length === 0 && <span className="text-faint">Define roles in Requirements.</span>}
        </fieldset>
      )}
      <fieldset className="space-y-1.5"><legend className="mb-1 text-muted">States (loading / empty / error …)</legend>
        {page.states.map((s, i) => (
          <div key={s.kind} className="flex items-center gap-1.5">
            <span className="w-24 shrink-0 text-muted">{s.kind.replace("_", " ")}</span>
            <Input aria-label={`${s.kind} message`} className="text-xs" value={s.message} maxLength={200} onChange={(e) => onChange({ states: page.states.map((x, j) => (j === i ? { ...x, message: e.target.value } : x)) })} />
            <Button size="sm" variant="ghost" aria-label={`Remove ${s.kind} state`} onClick={() => onChange({ states: page.states.filter((_, j) => j !== i) })}><Trash2 size={11} /></Button>
          </div>
        ))}
        {unused.length > 0 && (
          <Select aria-label="Add state" className="text-xs" value="" onChange={(e) => e.target.value && onChange({ states: [...page.states, { kind: e.target.value as PageStateKind, message: "" }] })}>
            <option value="">+ Add state…</option>{unused.map((k) => <option key={k} value={k}>{k.replace("_", " ")}</option>)}
          </Select>
        )}
      </fieldset>
      <div className="flex gap-1.5 border-t border-line pt-2">
        <Button size="sm" onClick={onDuplicate}><Plus size={12} /> Duplicate page</Button>
        <Button size="sm" variant="danger" onClick={onDelete}><Trash2 size={12} /> Delete page</Button>
      </div>
    </div>
  );
}

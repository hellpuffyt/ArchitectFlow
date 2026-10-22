"use client";
import { ArrowDown, ArrowUp, Copy, Trash2 } from "lucide-react";
import { useProject } from "@/lib/project-store";
import type { LayoutNode, Page, ResponsiveRule } from "@/lib/design-types";
import type { PropValue } from "@/lib/types";
import { COMPONENTS } from "@/lib/layout";
import { Badge, Button, Field, Input, Select } from "@/components/ui";

const PROP_FIELDS: Record<string, string[]> = {
  heading: ["text", "level"], text: ["text"], button: ["label", "variant", "disabled"], input: ["label", "name", "type", "placeholder", "required", "help", "disabled"],
  select: ["label", "name", "options"], checkbox: ["label", "name"], table: ["columns", "density"], stat: ["label", "value"], chart: ["label"],
  alert: ["text", "tone"], badge: ["text"], image: ["alt"], icon: ["name"], empty_state: ["title", "text"], card: ["title"], nav: ["label"],
  tabs: ["tabs"], modal: ["title"], form: ["label"], list: ["label"], stack: ["direction", "gap", "justify"], grid: ["columns", "gap"],
  container: ["align", "max_width"], divider: [],
};
const BOOL = new Set(["disabled", "required"]);
const NUM = new Set(["level", "gap", "columns", "max_width"]);

export function ElementInspector({ page, node, onChange, onRemove, onDuplicate, onMove }: {
  page: Page; node: LayoutNode; onChange: (patch: Partial<LayoutNode>) => void; onRemove: () => void; onDuplicate: () => void; onMove: (d: -1 | 1) => void;
}) {
  const { doc } = useProject();
  if (!doc) return null;
  const isRoot = node.id === page.layout.id;
  const fields = PROP_FIELDS[node.kind] ?? [];
  const setProp = (k: string, v: PropValue | null) => {
    const props = { ...node.props };
    if (v === null || v === "") delete props[k]; else props[k] = v;
    onChange({ props });
  };
  const setRule = (bp: "sm" | "md", patch: Partial<ResponsiveRule>) => {
    const cur = node.responsive[bp] ?? {};
    const next = { ...cur, ...patch };
    const empty = Object.values(next).every((v) => v === null || v === undefined);
    onChange({ responsive: { ...node.responsive, [bp]: empty ? null : next } });
  };
  const inter = node.interaction;
  const entities = doc.database.entities;
  const ep = doc.api.endpoints;
  return (
    <div className="space-y-3 p-4 text-xs" aria-label="Element inspector">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-faint">{COMPONENTS.find((c) => c.kind === node.kind)?.label ?? node.kind}</p>
        <code className="text-[10px] text-faint">{node.id}</code>
      </div>
      {fields.map((k) => BOOL.has(k) ? (
        <label key={k} className="flex items-center gap-2 text-muted"><input type="checkbox" checked={!!node.props[k]} onChange={(e) => setProp(k, e.target.checked || null)} /> {k}</label>
      ) : (
        <Field key={k} label={k.replace("_", " ")} htmlFor={`prop-${k}`}>
          <Input id={`prop-${k}`} className="text-xs" type={NUM.has(k) ? "number" : "text"} value={node.props[k] === undefined ? "" : String(node.props[k])} maxLength={200}
            onChange={(e) => setProp(k, NUM.has(k) ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)} />
        </Field>
      ))}
      {!isRoot && (
        <fieldset className="space-y-1.5 border-t border-line pt-2">
          <legend className="font-medium text-muted">Responsive rules</legend>
          {(["md", "sm"] as const).map((bp) => (
            <div key={bp} className="flex flex-wrap items-center gap-2">
              <Badge>{bp === "md" ? "Tablet (md)" : "Mobile (sm)"}</Badge>
              <label className="flex items-center gap-1 text-muted"><input type="checkbox" aria-label={`Hide on ${bp}`} checked={!!node.responsive[bp]?.hidden} onChange={(e) => setRule(bp, { hidden: e.target.checked || null })} /> hide</label>
              {(node.kind === "grid" || node.kind === "form") && (
                <label className="flex items-center gap-1 text-muted">cols
                  <input aria-label={`Columns on ${bp}`} type="number" min={1} max={12} className="w-12 rounded border border-line bg-bg px-1" value={node.responsive[bp]?.columns ?? ""}
                    onChange={(e) => setRule(bp, { columns: e.target.value === "" ? null : Math.max(1, Math.min(12, Number(e.target.value))) })} />
                </label>
              )}
              {node.kind === "stack" && (
                <select aria-label={`Direction on ${bp}`} className="rounded border border-line bg-bg px-1" value={node.responsive[bp]?.direction ?? ""}
                  onChange={(e) => setRule(bp, { direction: (e.target.value || null) as ResponsiveRule["direction"] })}>
                  <option value="">inherit</option><option value="row">row</option><option value="column">column</option>
                </select>
              )}
            </div>
          ))}
        </fieldset>
      )}
      <fieldset className="space-y-1.5 border-t border-line pt-2">
        <legend className="font-medium text-muted">Data links</legend>
        <Select aria-label="Endpoint" className="text-xs" value={node.endpoint_id ?? ""} onChange={(e) => onChange({ endpoint_id: e.target.value || null })}>
          <option value="">No API endpoint</option>
          {ep.map((x) => <option key={x.id} value={x.id}>{x.method} {x.path}</option>)}
          {node.endpoint_id && !ep.some((x) => x.id === node.endpoint_id) && <option value={node.endpoint_id}>⚠ missing: {node.endpoint_id}</option>}
        </Select>
        <Select aria-label="Entity" className="text-xs" value={node.entity_id ?? ""} onChange={(e) => onChange({ entity_id: e.target.value || null })}>
          <option value="">No entity</option>
          {entities.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          {node.entity_id && !entities.some((x) => x.id === node.entity_id) && <option value={node.entity_id}>⚠ missing: {node.entity_id}</option>}
        </Select>
        {(node.kind === "input" || node.kind === "select" || node.kind === "checkbox") && (
          <Select aria-label="Stores value in" className="text-xs" value={node.binding?.entity_id ? `${node.binding.entity_id}|${node.binding.entity_field ?? ""}` : ""}
            onChange={(e) => { const [a, b] = e.target.value.split("|"); onChange({ binding: e.target.value ? { entity_id: a, entity_field: b || null } : null }); }}>
            <option value="">Value not stored</option>
            {entities.flatMap((x) => x.fields.map((f) => <option key={`${x.id}|${f.name}`} value={`${x.id}|${f.name}`}>{x.name}.{f.name}</option>))}
          </Select>
        )}
      </fieldset>
      <fieldset className="space-y-1.5 border-t border-line pt-2">
        <legend className="font-medium text-muted">Interaction</legend>
        <Select aria-label="Action" className="text-xs" value={inter?.action ?? "none"}
          onChange={(e) => onChange({ interaction: e.target.value === "none" && !inter ? null : { trigger: inter?.trigger ?? "click", action: e.target.value as NonNullable<LayoutNode["interaction"]>["action"], target_page_id: inter?.target_page_id ?? null, endpoint_id: inter?.endpoint_id ?? null, implemented: inter?.implemented ?? false } })}>
          <option value="none">No action</option><option value="navigate">Navigate to page</option><option value="call_api">Call API</option><option value="open_modal">Open modal</option><option value="close_modal">Close modal</option>
        </Select>
        {inter?.action === "navigate" && (
          <Select aria-label="Target page" className="text-xs" value={inter.target_page_id ?? ""} onChange={(e) => onChange({ interaction: { ...inter, target_page_id: e.target.value || null } })}>
            <option value="">Choose page…</option>
            {doc.design.pages.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.route})</option>)}
          </Select>
        )}
        {inter?.action === "call_api" && (
          <Select aria-label="Called endpoint" className="text-xs" value={inter.endpoint_id ?? ""} onChange={(e) => onChange({ interaction: { ...inter, endpoint_id: e.target.value || null } })}>
            <option value="">Choose endpoint…</option>
            {ep.map((x) => <option key={x.id} value={x.id}>{x.method} {x.path}</option>)}
          </Select>
        )}
        {inter && inter.action !== "none" && (
          <label className="flex items-center gap-2 text-muted" title="Only navigation can actually run in the prototype.">
            <input type="checkbox" aria-label="Implemented in prototype" checked={inter.implemented} disabled={inter.action !== "navigate"}
              onChange={(e) => onChange({ interaction: { ...inter, implemented: e.target.checked } })} />
            {inter.action === "navigate" ? "Implemented in prototype" : "Visual only (the prototype cannot run this action)"}
          </label>
        )}
      </fieldset>
      {!isRoot && (
        <div className="flex flex-wrap gap-1.5 border-t border-line pt-2">
          <Button size="sm" variant="ghost" aria-label="Move element up" onClick={() => onMove(-1)}><ArrowUp size={12} /></Button>
          <Button size="sm" variant="ghost" aria-label="Move element down" onClick={() => onMove(1)}><ArrowDown size={12} /></Button>
          <Button size="sm" onClick={onDuplicate}><Copy size={12} /> Duplicate</Button>
          <Button size="sm" variant="danger" onClick={onRemove}><Trash2 size={12} /> Remove</Button>
        </div>
      )}
    </div>
  );
}

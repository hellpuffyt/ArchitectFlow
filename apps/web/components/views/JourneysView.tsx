"use client";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { useProject } from "@/lib/project-store";
import { uniqueId } from "@/lib/graph";
import type { Workflow } from "@/lib/types";
import { Button, EmptyState, Input, Select } from "@/components/ui";

/** System-level user journeys: ordered steps through architecture components (drives sequence diagrams). */
export function JourneysView() {
  const { doc, edit } = useProject();
  if (!doc) return null;
  const setWf = (id: string, patch: Partial<Workflow>) => edit((d) => ({ ...d, workflows: d.workflows.map((w) => (w.id === id ? { ...w, ...patch } : w)) }));
  const label = (id: string) => doc.nodes.find((n) => n.id === id)?.label ?? id;
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold">User journeys</h1>
          <p className="text-sm text-muted">Each journey is an ordered path through components. It feeds the sequence-diagram export and the prompt.</p>
        </div>
        <Button variant="primary" onClick={() => edit((d) => ({ ...d, workflows: [...d.workflows, { id: uniqueId("journey", d.workflows.map((w) => w.id)), name: "New journey", actor_id: d.actors[0]?.id ?? null, steps: [], description: "" }] }))}><Plus size={13} /> Add journey</Button>
      </div>
      {doc.workflows.length === 0 && <EmptyState title="No journeys yet" body="Add a journey such as “Staff records a sale” and list the components it passes through." />}
      {doc.workflows.map((w) => (
        <section key={w.id} className="space-y-3 rounded-xl border border-line bg-panel p-4" data-testid={`journey-${w.id}`}>
          <div className="flex flex-wrap gap-2">
            <Input aria-label={`Journey name ${w.id}`} className="flex-1" value={w.name} maxLength={200} onChange={(e) => setWf(w.id, { name: e.target.value })} />
            <Select aria-label={`Journey actor ${w.id}`} className="w-48" value={w.actor_id ?? ""} onChange={(e) => setWf(w.id, { actor_id: e.target.value || null })}>
              <option value="">No actor</option>
              {doc.actors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
            <Button size="sm" variant="ghost" aria-label={`Delete journey ${w.id}`} onClick={() => edit((d) => ({ ...d, workflows: d.workflows.filter((x) => x.id !== w.id) }))}><Trash2 size={13} /></Button>
          </div>
          <Input aria-label={`Journey description ${w.id}`} placeholder="What the user achieves" value={w.description} maxLength={4000} onChange={(e) => setWf(w.id, { description: e.target.value })} />
          <ol className="space-y-1">
            {w.steps.map((s, i) => (
              <li key={`${s}-${i}`} className="flex items-center gap-2 text-sm">
                <span className="w-6 text-right text-xs text-faint">{i + 1}.</span>
                <span className="flex-1">{label(s)}</span>
                <Button size="sm" variant="ghost" aria-label="Move step up" disabled={i === 0} onClick={() => setWf(w.id, { steps: w.steps.map((x, j) => (j === i - 1 ? s : j === i ? w.steps[i - 1] : x)) })}><ArrowUp size={12} /></Button>
                <Button size="sm" variant="ghost" aria-label="Move step down" disabled={i === w.steps.length - 1} onClick={() => setWf(w.id, { steps: w.steps.map((x, j) => (j === i + 1 ? s : j === i ? w.steps[i + 1] : x)) })}><ArrowDown size={12} /></Button>
                <Button size="sm" variant="ghost" aria-label="Remove step" onClick={() => setWf(w.id, { steps: w.steps.filter((_, j) => j !== i) })}><X size={12} /></Button>
              </li>
            ))}
          </ol>
          <Select aria-label={`Add step to ${w.id}`} value="" onChange={(e) => e.target.value && setWf(w.id, { steps: [...w.steps, e.target.value].slice(0, 50) })}>
            <option value="">+ Add step (component)…</option>
            {doc.nodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
          </Select>
        </section>
      ))}
    </div>
  );
}

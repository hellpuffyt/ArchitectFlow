"use client";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { useProject } from "@/lib/project-store";
import { uniqueId } from "@/lib/graph";
import type { UiJourney } from "@/lib/design-types";
import { Button, EmptyState, Input, Select } from "@/components/ui";

/** Screen-level journeys: ordered pages with the user's action on each. */
export function UiJourneys() {
  const { doc, edit } = useProject();
  if (!doc) return null;
  const pages = doc.design.pages;
  const set = (id: string, patch: Partial<UiJourney>) => edit((d) => ({ ...d, design: { ...d.design, journeys: d.design.journeys.map((j) => (j.id === id ? { ...j, ...patch } : j)) } }));
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-8">
      <div className="flex items-start justify-between">
        <div><h2 className="text-base font-semibold">UI journeys</h2><p className="text-sm text-muted">Link pages into task flows per role. Exported as the page-flow diagram and included in prompts.</p></div>
        <Button variant="primary" disabled={pages.length === 0} onClick={() => edit((d) => ({ ...d, design: { ...d.design, journeys: [...d.design.journeys, { id: uniqueId("journey", d.design.journeys.map((j) => j.id)), name: "New journey", role_id: null, steps: [] }] } }))}><Plus size={13} /> Add journey</Button>
      </div>
      {doc.design.journeys.length === 0 && <EmptyState title="No UI journeys" body={pages.length ? "Add a journey and pick the pages a user moves through." : "Create pages first."} />}
      {doc.design.journeys.map((j) => (
        <section key={j.id} className="space-y-2 rounded-xl border border-line bg-panel p-4" data-testid={`ui-journey-${j.id}`}>
          <div className="flex gap-2">
            <Input aria-label={`UI journey name ${j.id}`} className="flex-1" value={j.name} maxLength={200} onChange={(e) => set(j.id, { name: e.target.value })} />
            <Select aria-label={`UI journey role ${j.id}`} className="w-44" value={j.role_id ?? ""} onChange={(e) => set(j.id, { role_id: e.target.value || null })}>
              <option value="">Any role</option>{doc.actors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
            <Button size="sm" variant="ghost" aria-label={`Delete UI journey ${j.id}`} onClick={() => edit((d) => ({ ...d, design: { ...d.design, journeys: d.design.journeys.filter((x) => x.id !== j.id) } }))}><Trash2 size={13} /></Button>
          </div>
          <ol className="space-y-1">
            {j.steps.map((s, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <span className="w-5 text-right text-xs text-faint">{i + 1}.</span>
                <code className="w-44 truncate text-xs">{pages.find((p) => p.id === s.page_id)?.route ?? `⚠ ${s.page_id}`}</code>
                <Input aria-label={`Step ${i + 1} action`} className="text-xs" value={s.action} maxLength={200} placeholder="what the user does" onChange={(e) => set(j.id, { steps: j.steps.map((x, k) => (k === i ? { ...x, action: e.target.value } : x)) })} />
                <Button size="sm" variant="ghost" aria-label="Move step up" disabled={i === 0} onClick={() => set(j.id, { steps: j.steps.map((x, k) => (k === i - 1 ? j.steps[i] : k === i ? j.steps[i - 1] : x)) })}><ArrowUp size={12} /></Button>
                <Button size="sm" variant="ghost" aria-label="Move step down" disabled={i === j.steps.length - 1} onClick={() => set(j.id, { steps: j.steps.map((x, k) => (k === i + 1 ? j.steps[i] : k === i ? j.steps[i + 1] : x)) })}><ArrowDown size={12} /></Button>
                <Button size="sm" variant="ghost" aria-label="Remove step" onClick={() => set(j.id, { steps: j.steps.filter((_, k) => k !== i) })}><X size={12} /></Button>
              </li>
            ))}
          </ol>
          <Select aria-label={`Add page to ${j.id}`} value="" onChange={(e) => e.target.value && set(j.id, { steps: [...j.steps, { page_id: e.target.value, action: "" }].slice(0, 30) })}>
            <option value="">+ Add page…</option>{pages.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.route})</option>)}
          </Select>
        </section>
      ))}
    </div>
  );
}

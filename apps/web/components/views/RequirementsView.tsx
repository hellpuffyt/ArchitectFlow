"use client";
import { Check, Plus, Trash2 } from "lucide-react";
import { useProject } from "@/lib/project-store";
import { uniqueId } from "@/lib/graph";
import type { ArchitectureDocument, Constraint, Requirement } from "@/lib/types";
import { Badge, Button, Input, Select } from "@/components/ui";

const CATEGORIES = ["", "feature", "role", "business", "performance", "security", "availability", "retention", "deployment", "scalability", "durability", "accessibility", "compliance"];

function Section({ title, count, children, onAdd, addLabel }: { title: string; count: number; children: React.ReactNode; onAdd?: () => void; addLabel?: string }) {
  return (
    <section className="rounded-xl border border-line bg-panel">
      <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <h2 className="text-sm font-semibold">{title} <span className="text-faint">({count})</span></h2>
        {onAdd && <Button size="sm" variant="ghost" onClick={onAdd}><Plus size={13} /> {addLabel ?? "Add"}</Button>}
      </header>
      <div className="divide-y divide-line">{children}</div>
    </section>
  );
}

export function RequirementsView() {
  const { doc, edit } = useProject();
  if (!doc) return null;
  const reqIds = () => [...doc.requirements.functional, ...doc.requirements.nonfunctional].map((r) => r.id);

  function reqList(kind: "functional" | "nonfunctional") {
    const list = doc!.requirements[kind];
    const setReq = (id: string, patch: Partial<Requirement>) => edit((d) => ({ ...d, requirements: { ...d.requirements, [kind]: d.requirements[kind].map((r) => (r.id === id ? { ...r, ...patch } : r)) } }));
    const remove = (id: string) => edit((d) => ({ ...d, requirements: { ...d.requirements, [kind]: d.requirements[kind].filter((r) => r.id !== id) } }));
    return list.map((r) => (
      <div key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-2" data-testid={`req-${r.id}`}>
        {r.status === "assumption" ? <Badge tone="warn">assumption</Badge> : <Badge tone="ok">confirmed</Badge>}
        <Input aria-label={`Requirement ${r.id}`} className="min-w-[280px] flex-1" value={r.text} maxLength={4000} onChange={(e) => setReq(r.id, { text: e.target.value })} />
        <Select aria-label={`Priority ${r.id}`} className="w-24" value={r.priority} onChange={(e) => setReq(r.id, { priority: e.target.value as Requirement["priority"] })}>
          <option value="must">must</option><option value="should">should</option><option value="could">could</option>
        </Select>
        <Select aria-label={`Category ${r.id}`} className="w-32" value={r.category} onChange={(e) => setReq(r.id, { category: e.target.value })}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c || "—"}</option>)}
        </Select>
        {r.status === "assumption" && <Button size="sm" onClick={() => setReq(r.id, { status: "confirmed" })} aria-label={`Confirm ${r.id}`}><Check size={13} /> Confirm</Button>}
        <Button size="sm" variant="ghost" aria-label={`Remove ${r.id}`} onClick={() => remove(r.id)}><Trash2 size={13} /></Button>
      </div>
    ));
  }
  const addReq = (kind: "functional" | "nonfunctional") => edit((d) => ({ ...d, requirements: { ...d.requirements,
    [kind]: [...d.requirements[kind], { id: uniqueId(kind === "functional" ? "fr" : "nfr", reqIds()), text: "New requirement", priority: "must", category: "", status: "confirmed" }] } }));

  const setList = <K extends "open_questions">(key: K, fn: (l: string[]) => string[]) => edit((d) => ({ ...d, [key]: fn(d[key]) }) as ArchitectureDocument);

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-8">
      <div>
        <h1 className="text-lg font-semibold">Requirements</h1>
        <p className="text-sm text-muted">Items marked <Badge tone="warn">assumption</Badge> were inferred, not stated. Confirm or edit them — prompts label unconfirmed items as assumptions.</p>
      </div>
      <Section title="Functional" count={doc.requirements.functional.length} onAdd={() => addReq("functional")}>{reqList("functional")}</Section>
      <Section title="Non-functional" count={doc.requirements.nonfunctional.length} onAdd={() => addReq("nonfunctional")}>{reqList("nonfunctional")}</Section>
      <Section title="Acceptance criteria" count={doc.requirements.acceptance_criteria.length}
        onAdd={() => edit((d) => ({ ...d, requirements: { ...d.requirements, acceptance_criteria: [...d.requirements.acceptance_criteria, { id: uniqueId("ac", d.requirements.acceptance_criteria.map((a) => a.id)), text: "New acceptance criterion" }] } }))}>
        {doc.requirements.acceptance_criteria.map((a) => (
          <div key={a.id} className="flex items-center gap-2 px-4 py-2">
            <Input aria-label={`Acceptance criterion ${a.id}`} value={a.text} maxLength={4000}
              onChange={(e) => edit((d) => ({ ...d, requirements: { ...d.requirements, acceptance_criteria: d.requirements.acceptance_criteria.map((x) => (x.id === a.id ? { ...x, text: e.target.value } : x)) } }))} />
            <Button size="sm" variant="ghost" aria-label={`Remove ${a.id}`} onClick={() => edit((d) => ({ ...d, requirements: { ...d.requirements, acceptance_criteria: d.requirements.acceptance_criteria.filter((x) => x.id !== a.id) } }))}><Trash2 size={13} /></Button>
          </div>
        ))}
      </Section>
      <Section title="Roles & actors" count={doc.actors.length}
        onAdd={() => edit((d) => ({ ...d, actors: [...d.actors, { id: uniqueId("role", d.actors.map((a) => a.id)), name: "New role", description: "", is_role: true }] }))}>
        {doc.actors.map((a) => (
          <div key={a.id} className="flex items-center gap-2 px-4 py-2">
            <code className="w-28 truncate text-[11px] text-faint">{a.id}</code>
            <Input aria-label={`Role name ${a.id}`} className="w-48" value={a.name} maxLength={200} onChange={(e) => edit((d) => ({ ...d, actors: d.actors.map((x) => (x.id === a.id ? { ...x, name: e.target.value } : x)) }))} />
            <Input aria-label={`Role description ${a.id}`} placeholder="What this role does" value={a.description} maxLength={4000} onChange={(e) => edit((d) => ({ ...d, actors: d.actors.map((x) => (x.id === a.id ? { ...x, description: e.target.value } : x)) }))} />
            <Button size="sm" variant="ghost" aria-label={`Remove role ${a.id}`} onClick={() => edit((d) => ({ ...d, actors: d.actors.filter((x) => x.id !== a.id) }))}><Trash2 size={13} /></Button>
          </div>
        ))}
      </Section>
      <Section title="Assumptions" count={doc.assumptions.length}
        onAdd={() => edit((d) => ({ ...d, assumptions: [...d.assumptions, { id: uniqueId("asm", d.assumptions.map((a) => a.id)), text: "New assumption", confirmed: false }] }))}>
        {doc.assumptions.map((a) => (
          <div key={a.id} className="flex items-center gap-2 px-4 py-2">
            <label className="flex items-center gap-1.5 text-xs text-muted">
              <input type="checkbox" checked={a.confirmed} onChange={(e) => edit((d) => ({ ...d, assumptions: d.assumptions.map((x) => (x.id === a.id ? { ...x, confirmed: e.target.checked } : x)) }))} /> confirmed
            </label>
            <Input aria-label={`Assumption ${a.id}`} value={a.text} maxLength={4000} onChange={(e) => edit((d) => ({ ...d, assumptions: d.assumptions.map((x) => (x.id === a.id ? { ...x, text: e.target.value } : x)) }))} />
            <Button size="sm" variant="ghost" aria-label={`Remove assumption ${a.id}`} onClick={() => edit((d) => ({ ...d, assumptions: d.assumptions.filter((x) => x.id !== a.id) }))}><Trash2 size={13} /></Button>
          </div>
        ))}
      </Section>
      <Section title="Constraints" count={doc.constraints.length}
        onAdd={() => edit((d) => ({ ...d, constraints: [...d.constraints, { id: uniqueId("c", d.constraints.map((c) => c.id)), text: "New constraint", kind: "note", value: "" }] }))}>
        {doc.constraints.map((c) => {
          const setC = (patch: Partial<Constraint>) => edit((d) => ({ ...d, constraints: d.constraints.map((x) => (x.id === c.id ? { ...x, ...patch } : x)) }));
          return (
            <div key={c.id} className="flex items-center gap-2 px-4 py-2">
              <Select aria-label={`Constraint kind ${c.id}`} className="w-44" value={c.kind} onChange={(e) => setC({ kind: e.target.value as Constraint["kind"] })}>
                <option value="note">note</option><option value="requires_component">requires component type</option><option value="forbids_technology">forbids technology</option>
              </Select>
              <Input aria-label={`Constraint ${c.id}`} value={c.text} maxLength={4000} onChange={(e) => setC({ text: e.target.value })} />
              {c.kind !== "note" && <Input aria-label={`Constraint value ${c.id}`} className="w-40" placeholder={c.kind === "requires_component" ? "e.g. waf" : "e.g. MongoDB"} value={c.value} maxLength={200} onChange={(e) => setC({ value: e.target.value })} />}
              <Button size="sm" variant="ghost" aria-label={`Remove constraint ${c.id}`} onClick={() => edit((d) => ({ ...d, constraints: d.constraints.filter((x) => x.id !== c.id) }))}><Trash2 size={13} /></Button>
            </div>
          );
        })}
      </Section>
      <Section title="Open questions" count={doc.open_questions.length} onAdd={() => setList("open_questions", (l) => [...l, "New question"])}>
        {doc.open_questions.map((q, i) => (
          <div key={i} className="flex items-center gap-2 px-4 py-2">
            <Input aria-label={`Open question ${i + 1}`} value={q} maxLength={4000} onChange={(e) => setList("open_questions", (l) => l.map((x, j) => (j === i ? e.target.value : x)))} />
            <Button size="sm" variant="ghost" aria-label={`Resolve question ${i + 1}`} onClick={() => setList("open_questions", (l) => l.filter((_, j) => j !== i))}><Check size={13} /> Resolved</Button>
          </div>
        ))}
      </Section>
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Finding, PromptResult } from "@/lib/api";
import { useProject } from "@/lib/project-store";
import { Badge } from "@/components/ui";
import type { View } from "./nav";

export function OverviewView({ go }: { go: (v: View) => void }) {
  const { doc, project, head } = useProject();
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [prompts, setPrompts] = useState<PromptResult[] | null>(null);
  useEffect(() => {
    if (!project) return;
    api.findings(project.id).then((f) => setFindings(f.findings)).catch(() => setFindings(null));
    api.prompts(project.id).then(setPrompts).catch(() => setPrompts(null));
  }, [project, head]);
  if (!doc || !project) return null;
  const unconfirmed = doc.assumptions.filter((a) => !a.confirmed).length
    + [...doc.requirements.functional, ...doc.requirements.nonfunctional].filter((r) => r.status === "assumption").length;
  const cards: [string, string | number, View, string][] = [
    ["Components", doc.nodes.length, "architecture", `${doc.edges.length} connections`],
    ["Requirements", doc.requirements.functional.length + doc.requirements.nonfunctional.length, "requirements", `${unconfirmed} awaiting confirmation`],
    ["Entities", doc.database.entities.length, "database", "database design"],
    ["Endpoints", doc.api.endpoints.length, "api", "API design"],
    ["Findings", findings ? findings.length : "—", "validation", findings ? `${findings.filter((f) => f.severity === "error").length} errors` : "not loaded"],
    ["Prompts", prompts ? prompts.length : "—", "prompt", prompts?.[0] ? (prompts[0].outdated ? "latest is OUTDATED" : `latest from revision ${prompts[0].source_revision}`) : "none yet"],
  ];
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-8">
      <div>
        <h1 className="text-lg font-semibold">{project.name}</h1>
        <p className="text-sm text-muted">Revision {head}. {doc.vision ? doc.vision : "No vision yet — start in the Vision workspace."}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map(([label, value, view, sub]) => (
          <button key={label} type="button" onClick={() => go(view)} className="rounded-xl border border-line bg-panel p-4 text-left hover:border-line-strong">
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
            <p className="mt-0.5 text-xs text-faint">{sub}</p>
          </button>
        ))}
      </div>
      {doc.open_questions.length > 0 && (
        <div className="rounded-xl border border-line bg-panel p-4">
          <p className="mb-2 text-sm font-medium">Open questions <Badge tone="warn">{doc.open_questions.length}</Badge></p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">{doc.open_questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

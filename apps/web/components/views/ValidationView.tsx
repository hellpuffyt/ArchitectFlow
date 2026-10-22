"use client";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { ApiError, api } from "@/lib/api";
import type { Finding } from "@/lib/api";
import { useProject } from "@/lib/project-store";
import { Badge, Button, EmptyState, ErrorBox, Spinner } from "@/components/ui";

const TONE = { error: "err", warning: "warn", info: "info" } as const;

export function ValidationView({ onShow }: { onShow: (f: Finding) => void }) {
  const { project, head, status, saveNow } = useProject();
  const [data, setData] = useState<{ revision: number; findings: Finding[] } | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [filter, setFilter] = useState<"all" | "error" | "warning" | "info">("all");
  const [kind, setKind] = useState<"all" | "schema_error" | "recommendation">("all");

  async function run() {
    if (!project) return;
    setError(null);
    try {
      if (status !== "saved") await saveNow();
      setData(await api.findings(project.id));
    } catch (e) {
      setError(e as ApiError);
    }
  }
  useEffect(() => {
    if (!project) return;
    api.findings(project.id).then((d) => { setData(d); setError(null); }, (e) => setError(e as ApiError));
  }, [project, head]);

  const shown = (data?.findings ?? []).filter((f) => (filter === "all" || f.severity === filter) && (kind === "all" || f.kind === kind));
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Validation findings</h1>
          <p className="text-sm text-muted">Deterministic checks over the saved design{data ? ` (revision ${data.revision})` : ""}. Recommendations are judgement calls, not confirmed vulnerabilities.</p>
        </div>
        <Button onClick={() => void run()}><RefreshCw size={13} /> Re-run</Button>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {(["all", "error", "warning", "info"] as const).map((s) => (
          <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)}
            className={`rounded-md border px-2 py-1 ${filter === s ? "border-accent text-fg" : "border-line text-muted"}`}>
            {s} {data && s !== "all" ? `(${data.findings.filter((f) => f.severity === s).length})` : ""}
          </button>
        ))}
        <span className="mx-2 border-l border-line" />
        {(["all", "schema_error", "recommendation"] as const).map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}
            className={`rounded-md border px-2 py-1 ${kind === k ? "border-accent text-fg" : "border-line text-muted"}`}>{k.replace("_", " ")}</button>
        ))}
      </div>
      {error && <ErrorBox message={error.message} errors={error.errors} />}
      {!data && !error && <Spinner />}
      {data && shown.length === 0 && <EmptyState title="No findings" body={data.findings.length ? "Nothing matches this filter." : "The validator found nothing to report for this revision."} />}
      <ul className="space-y-2" aria-label="Findings">
        {shown.map((f) => (
          <li key={f.id} className="rounded-lg border border-line bg-panel p-3" data-testid="finding">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={TONE[f.severity]}>{f.severity}</Badge>
              <Badge>{f.kind === "schema_error" ? "schema error" : "recommendation"}</Badge>
              <span className="font-medium">{f.title}</span>
              <code className="ml-auto text-[11px] text-faint">{f.rule}</code>
            </div>
            <p className="mt-1.5 text-sm text-muted">{f.explanation}</p>
            <p className="mt-1 text-xs"><span className="text-faint">Evidence:</span> {f.evidence}</p>
            <p className="mt-0.5 text-xs"><span className="text-faint">Fix:</span> {f.remediation}</p>
            {f.path && <p className="mt-0.5 text-xs"><span className="text-faint">Location:</span> <code data-testid="finding-path">{f.path}</code></p>}
            {(f.node_ids.length > 0 || f.edge_ids.length > 0) && (
              <Button size="sm" variant="ghost" className="mt-1.5" onClick={() => onShow(f)}>Show on canvas</Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

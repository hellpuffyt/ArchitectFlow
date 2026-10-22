"use client";
import { useState } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { ApiError, api } from "@/lib/api";
import type { ChangeSet } from "@/lib/api";
import { useProject } from "@/lib/project-store";
import { Badge, Button, Dialog, ErrorBox } from "@/components/ui";

/** Review a proposed change set: summary diff, validation findings, then apply or reject. */
export function ChangeSetReview({ cs, onDone }: { cs: ChangeSet; onDone: (cs: ChangeSet | null) => void }) {
  const { project, adoptServerDocument, serverOp } = useProject();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [confirmLarge, setConfirmLarge] = useState(false);
  const errors = cs.findings.filter((f) => f.severity === "error").length;
  const warnings = cs.findings.filter((f) => f.severity === "warning").length;

  async function apply(confirm = false) {
    if (!project) return;
    if (cs.summary.large && !confirm) { setConfirmLarge(true); return; }
    setBusy(true);
    setError(null);
    try {
      const r = await serverOp(() => api.applyChangeset(project.id, cs.id, confirm));
      adoptServerDocument(r.document, r.head_revision);
      onDone(r.changeset);
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
      setConfirmLarge(false);
    }
  }
  async function reject() {
    if (!project) return;
    setBusy(true);
    try { onDone(await api.rejectChangeset(project.id, cs.id)); } catch (e) { setError(e as ApiError); } finally { setBusy(false); }
  }

  return (
    <section className="space-y-3 rounded-lg border border-line bg-panel-2 p-3" aria-label="Proposed changes">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={cs.mode === "example" ? "warn" : "info"}>{cs.mode === "example" ? "Example mode" : `Live: ${cs.provider}`}</Badge>
        <Badge tone={cs.status === "pending" ? "accent" : cs.status === "applied" ? "ok" : "neutral"}>{cs.status}</Badge>
        {cs.summary.large && <Badge tone="err">Large change</Badge>}
        <span className="text-xs text-faint">based on revision {cs.base_revision}</span>
      </div>
      <p className="text-xs text-muted">{cs.explanation}</p>
      {cs.summary.lines.length > 0 ? (
        <ul className="max-h-64 space-y-0.5 overflow-auto rounded border border-line bg-bg p-2 font-mono text-[11px]" data-testid="changeset-lines">
          {cs.summary.lines.map((l, i) => (
            <li key={i} className={l.startsWith("+") ? "text-ok" : l.startsWith("-") ? "text-err" : l.trimStart().startsWith("!") ? "text-warn" : "text-info"}>{l}</li>
          ))}
        </ul>
      ) : <p className="text-xs text-faint">No changes proposed.</p>}
      {cs.questions.length > 0 && (
        <div className="text-xs"><p className="font-medium text-muted">Questions</p>
          <ul className="list-disc pl-4 text-muted">{cs.questions.map((q) => <li key={q}>{q}</li>)}</ul></div>
      )}
      <p className="text-xs text-muted">After applying: {errors} error, {warnings} warning finding(s) from validation.</p>
      {error && <ErrorBox message={error.message} errors={error.errors} />}
      {cs.status === "pending" && cs.summary.lines.length > 0 && (
        <div className="flex gap-2">
          <Button size="sm" variant="primary" disabled={busy} onClick={() => void apply()}><Check size={13} /> Apply changes</Button>
          <Button size="sm" disabled={busy} onClick={() => void reject()}><X size={13} /> Reject</Button>
        </div>
      )}
      <Dialog open={confirmLarge} onClose={() => setConfirmLarge(false)} title="Replace a large part of the design?"
        footer={<><Button onClick={() => setConfirmLarge(false)}>Cancel</Button><Button variant="danger" onClick={() => void apply(true)}>Apply anyway</Button></>}>
        <p className="flex gap-2"><AlertTriangle size={16} className="shrink-0 text-warn" /> This proposal removes {cs.summary.removed_nodes} components.
          The current design stays available in version history and can be restored.</p>
      </Dialog>
    </section>
  );
}

"use client";
import { useEffect, useState } from "react";
import { Wand2 } from "lucide-react";
import { ApiError, api } from "@/lib/api";
import type { ChangeSet } from "@/lib/api";
import { useProject } from "@/lib/project-store";
import { useSession } from "@/lib/session";
import { Badge, Button, ErrorBox, Textarea } from "@/components/ui";
import { ChangeSetReview } from "./ChangeSetReview";

export function AiNotice() {
  const { me } = useSession();
  if (!me) return null;
  return me.ai.mode === "example"
    ? <p className="rounded-md border border-warn/30 bg-warn/10 px-2.5 py-1.5 text-xs text-warn" role="note">{me.ai.notice}. Results are deterministic templates, not AI output.</p>
    : <p className="rounded-md border border-info/30 bg-info/10 px-2.5 py-1.5 text-xs text-info" role="note">{me.ai.notice}</p>;
}

/** Ask for a design change; the result is a reviewable change set, never a silent edit. */
export function Assistant() {
  const { project, head, status, saveNow } = useProject();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [current, setCurrent] = useState<ChangeSet | null>(null);
  const [history, setHistory] = useState<ChangeSet[]>([]);

  useEffect(() => {
    if (project) api.changesets(project.id).then(setHistory).catch(() => setHistory([]));
  }, [project, current]);

  async function ask() {
    if (!project) return;
    setBusy(true);
    setError(null);
    try {
      if (status !== "saved" && !(await saveNow())) throw new ApiError(409, "Save your changes before asking for a proposal.");
      setCurrent(await api.edit(project.id, text, head));
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3 p-4">
      <AiNotice />
      <label htmlFor="ai-edit" className="text-xs font-medium text-muted">Describe a change</label>
      <Textarea id="ai-edit" rows={3} value={text} maxLength={2000} placeholder="e.g. add a redis cache for Core API"
        onChange={(e) => setText(e.target.value)} />
      <Button size="sm" variant="primary" disabled={busy || text.trim().length < 3} onClick={() => void ask()}><Wand2 size={13} /> {busy ? "Proposing…" : "Propose change"}</Button>
      {error && <ErrorBox message={error.message} errors={error.errors} />}
      {current && <ChangeSetReview cs={current} onDone={(cs) => setCurrent(cs)} />}
      {history.filter((h) => h.id !== current?.id).length > 0 && (
        <div className="border-t border-line pt-3">
          <p className="mb-1 text-xs font-medium text-muted">Earlier proposals</p>
          <ul className="space-y-1 text-xs">
            {history.filter((h) => h.id !== current?.id).slice(0, 8).map((h) => (
              <li key={h.id} className="flex items-center gap-2">
                <Badge tone={h.status === "applied" ? "ok" : h.status === "pending" ? "accent" : "neutral"}>{h.status}</Badge>
                <button type="button" className="truncate text-left text-muted hover:text-fg" onClick={() => setCurrent(h)}>{h.request}</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

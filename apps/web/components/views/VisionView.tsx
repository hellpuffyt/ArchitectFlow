"use client";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { ApiError, api } from "@/lib/api";
import type { ChangeSet } from "@/lib/api";
import { useProject } from "@/lib/project-store";
import { SAMPLE_VISION } from "@/lib/samples";
import { AiNotice } from "@/components/canvas/Assistant";
import { ChangeSetReview } from "@/components/canvas/ChangeSetReview";
import { Button, ErrorBox, Textarea } from "@/components/ui";

export function VisionView({ prefillSample, onApplied }: { prefillSample: boolean; onApplied: () => void }) {
  const { doc, project, edit, status, saveNow, currentHead } = useProject();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [proposal, setProposal] = useState<ChangeSet | null>(null);

  useEffect(() => {
    if (prefillSample && doc && !doc.vision) edit((d) => ({ ...d, vision: SAMPLE_VISION }));
  }, [prefillSample, doc, edit]);

  if (!doc || !project) return null;
  async function generate() {
    if (!project || !doc) return;
    setBusy(true);
    setError(null);
    try {
      if (status !== "saved" && !(await saveNow())) throw new ApiError(409, "Your latest edits are not saved yet; resolve the save problem first.");
      setProposal(await api.generate(project.id, doc.vision, currentHead()));
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-8">
      <div>
        <h1 className="text-lg font-semibold">Product vision</h1>
        <p className="text-sm text-muted">Describe what you want to build. ArchitectFlow extracts requirements, roles, data and an architecture as a proposal you review before anything changes.</p>
      </div>
      <Textarea aria-label="Product vision" rows={7} value={doc.vision} maxLength={4000}
        placeholder="e.g. A booking platform where customers reserve appointments and staff manage schedules…"
        onChange={(e) => edit((d) => ({ ...d, vision: e.target.value }))} />
      <div className="flex items-center justify-between text-xs text-faint">
        <span>{doc.vision.length}/4000</span>
        {!doc.vision && <button type="button" className="text-accent" onClick={() => edit((d) => ({ ...d, vision: SAMPLE_VISION }))}>Use the sample vision</button>}
      </div>
      <AiNotice />
      <Button variant="primary" disabled={busy || doc.vision.trim().length < 10} onClick={() => void generate()}>
        <Sparkles size={14} /> {busy ? "Generating proposal…" : doc.nodes.length ? "Propose a new architecture" : "Generate architecture"}
      </Button>
      {doc.nodes.length > 0 && !proposal && <p className="text-xs text-muted">The canvas already has {doc.nodes.length} components. A new proposal will show exactly what it replaces before you apply it.</p>}
      {error && <ErrorBox message={error.message} errors={error.errors} />}
      {proposal && <ChangeSetReview cs={proposal} onDone={(cs) => { setProposal(cs); if (cs?.status === "applied") onApplied(); }} />}
    </div>
  );
}

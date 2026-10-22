"use client";
import { useState } from "react";
import { LayoutTemplate, Wand2 } from "lucide-react";
import { ApiError, api } from "@/lib/api";
import type { ChangeSet } from "@/lib/api";
import { useProject } from "@/lib/project-store";
import { AiNotice } from "@/components/canvas/Assistant";
import { ChangeSetReview } from "@/components/canvas/ChangeSetReview";
import { Button, ErrorBox, Textarea } from "@/components/ui";

const EXAMPLES = ["premium dark SaaS dashboard with emerald accents", "compact sidebar enterprise", "mobile-first", "replace cards with a dense data table",
  "rounded, subtle shadows, less clutter", "professional developer tool", "onboarding flow with validation and helpful empty states"];

/** Visual changes are proposed as structured change sets and applied only after review. */
export function DesignAssistant() {
  const { project, head, status, saveNow } = useProject();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [cs, setCs] = useState<ChangeSet | null>(null);
  if (!project) return null;
  async function run(kind: "design" | "pages") {
    setBusy(true);
    setError(null);
    try {
      if (status !== "saved" && !(await saveNow())) throw new ApiError(409, "Save your changes first.");
      setCs(kind === "pages" ? await api.pagesProposal(project!.id, head) : await api.designProposal(project!.id, text, head));
    } catch (e) { setError(e as ApiError); } finally { setBusy(false); }
  }
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-8">
      <div><h2 className="text-base font-semibold">Design assistant</h2><p className="text-sm text-muted">Describe a visual change. You review the exact token and page changes before anything is applied.</p></div>
      <AiNotice />
      <div className="rounded-xl border border-line bg-panel p-4">
        <p className="text-sm font-medium">Generate pages from requirements</p>
        <p className="mt-1 text-xs text-muted">Derives pages, navigation, forms (bound to your API request fields), states and journeys from the saved entities, endpoints and roles. Deterministic in every mode.</p>
        <Button className="mt-3" disabled={busy} onClick={() => void run("pages")}><LayoutTemplate size={13} /> Propose pages</Button>
      </div>
      <label htmlFor="design-req" className="text-xs font-medium text-muted">Visual change request</label>
      <Textarea id="design-req" rows={3} value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} placeholder={EXAMPLES[0]} />
      <div className="flex flex-wrap gap-1.5">{EXAMPLES.map((x) => <button key={x} type="button" className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted hover:text-fg" onClick={() => setText(x)}>{x}</button>)}</div>
      <Button variant="primary" disabled={busy || text.trim().length < 3} onClick={() => void run("design")}><Wand2 size={13} /> {busy ? "Proposing…" : "Propose design change"}</Button>
      {error && <ErrorBox message={error.message} errors={error.errors} />}
      {cs && <ChangeSetReview cs={cs} onDone={setCs} />}
    </div>
  );
}

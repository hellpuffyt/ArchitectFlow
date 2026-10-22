"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, RefreshCw, Save } from "lucide-react";
import { ApiError, api } from "@/lib/api";
import type { PromptResult } from "@/lib/api";
import { useProject } from "@/lib/project-store";
import { ALL_PROMPT_SECTIONS } from "@/lib/types";
import type { PromptMode, PromptPreset, PromptSection, PromptSettings } from "@/lib/types";
import { Badge, Button, ErrorBox, Field, Select, Spinner } from "@/components/ui";

const MODES: [PromptMode, string][] = [
  ["complete_app", "Complete application"], ["frontend", "Frontend only"], ["design_system", "UI design system"],
  ["page", "Individual page"], ["backend_api", "Backend & API"], ["database", "Database"],
  ["architecture_docs", "Architecture documentation"], ["testing_qa", "Testing & QA plan"],
];
const PRESETS: [PromptPreset, string][] = [["claude_code", "Claude Code"], ["openai_codex", "OpenAI Codex"], ["generic_agent", "Generic coding agent"]];

export function PromptView() {
  const { doc, project, head, status, edit, saveNow } = useProject();
  const [preview, setPreview] = useState<PromptResult | null>(null);
  const [versions, setVersions] = useState<PromptResult[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);
  const seq = useRef(0);
  const settings = doc?.prompt_settings;

  // Preview always comes from the server's current *saved* revision.
  useEffect(() => {
    if (!project || !settings || status !== "saved") return;
    const n = ++seq.current;
    api.previewPrompt(project.id, settings).then((p) => { if (n === seq.current) setPreview(p); }).catch((e) => setError(e as ApiError));
  }, [project, settings, head, status, nonce]);
  useEffect(() => { if (project) api.prompts(project.id).then(setVersions).catch(() => {}); }, [project, head]);

  if (!doc || !project || !settings) return null;
  const set = (patch: Partial<PromptSettings>) => edit((d) => ({ ...d, prompt_settings: { ...d.prompt_settings, ...patch } }));
  const toggle = (s: PromptSection) => set({ sections: settings.sections.includes(s) ? settings.sections.filter((x) => x !== s) : ALL_PROMPT_SECTIONS.filter((x) => x === s || settings.sections.includes(x)) });

  async function saveVersion() {
    if (!project || !settings) return;
    setBusy(true);
    setError(null);
    try {
      if (status !== "saved") await saveNow();
      const p = await api.createPrompt(project.id, settings);
      setVersions(await api.prompts(project.id));
      setPreview(p);
    } catch (e) { setError(e as ApiError); } finally { setBusy(false); }
  }
  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  function downloadMd(text: string, rev: number) {
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project?.name.replace(/[^a-z0-9-]+/gi, "-") ?? "prompt"}-r${rev}-${settings?.mode}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-72 shrink-0 space-y-4 overflow-auto border-r border-line bg-panel p-4">
        <Field label="Prompt type" htmlFor="p-mode">
          <Select id="p-mode" value={settings.mode} onChange={(e) => set({ mode: e.target.value as PromptMode })}>
            {MODES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Agent preset" htmlFor="p-preset" hint="Changes formatting and workflow notes only.">
          <Select id="p-preset" value={settings.preset} onChange={(e) => set({ preset: e.target.value as PromptPreset })}>
            {PRESETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <fieldset>
          <legend className="mb-1 text-xs font-medium text-muted">Sections</legend>
          {ALL_PROMPT_SECTIONS.map((s) => (
            <label key={s} className="flex items-center gap-2 py-0.5 text-xs text-muted">
              <input type="checkbox" checked={settings.sections.includes(s)} onChange={() => toggle(s)} /> {s.replace("_", " ")}
            </label>
          ))}
        </fieldset>
        <div className="border-t border-line pt-3">
          <p className="mb-1.5 text-xs font-medium text-muted">Saved versions</p>
          {versions.length === 0 && <p className="text-xs text-faint">None yet.</p>}
          <ul className="space-y-1">
            {versions.map((v) => (
              <li key={v.id}>
                <button type="button" onClick={() => setPreview(v)} className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-panel-2">
                  <span>v{v.version}</span><span className="text-faint">rev {v.source_revision}</span>
                  {v.outdated ? <Badge tone="warn">OUTDATED</Badge> : <Badge tone="ok">current</Badge>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
          {preview ? (
            <>
              <Badge tone="accent">{preview.version ? `Version ${preview.version}` : "Live preview"}</Badge>
              <span className="text-xs text-muted" data-testid="prompt-source">from saved revision {preview.source_revision}</span>
              {preview.outdated && <Badge tone="warn">OUTDATED — the design changed</Badge>}
              <span className="text-xs text-faint">{preview.characters.toLocaleString()} chars · {preview.words.toLocaleString()} words · ~{preview.approx_tokens.toLocaleString()} tokens</span>
            </>
          ) : <Spinner />}
          <div className="ml-auto flex gap-2">
            {status !== "saved" && <span className="self-center text-xs text-warn">Unsaved edits — preview updates after save</span>}
            {preview?.version && <Button size="sm" onClick={() => { setPreview(null); setNonce((n) => n + 1); }}><RefreshCw size={13} /> Live preview</Button>}
            <Button size="sm" disabled={!preview} onClick={() => preview && void copy(preview.content)}>{copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}</Button>
            <Button size="sm" disabled={!preview} onClick={() => preview && downloadMd(preview.content, preview.source_revision)}><Download size={13} /> Markdown</Button>
            <Button size="sm" variant="primary" disabled={busy} onClick={() => void saveVersion()}><Save size={13} /> Save version</Button>
          </div>
        </div>
        {error && <div className="p-4"><ErrorBox message={error.message} errors={error.errors} /></div>}
        <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-5 font-mono text-xs leading-relaxed text-fg" aria-label="Prompt preview" data-testid="prompt-content">{preview?.content}</pre>
      </section>
    </div>
  );
}

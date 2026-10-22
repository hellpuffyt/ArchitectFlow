"use client";
import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowLeft, Boxes, CheckCircle2, ClipboardList, Cloud, CloudOff, Database, FileText, GitBranch,
  History, LayoutDashboard, Lightbulb, Loader2, Network, Palette, Redo2, Route, ShieldCheck, Undo2, Webhook,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useProject } from "@/lib/project-store";
import type { SaveStatus } from "@/lib/project-store";
import type { Finding } from "@/lib/api";
import { Badge, Button, ErrorBox, Input, Spinner } from "./ui";
import { Logo } from "./Logo";
import type { View } from "./views/nav";
import { OverviewView } from "./views/OverviewView";
import { VisionView } from "./views/VisionView";
import { RequirementsView } from "./views/RequirementsView";
import { ArchitectureView } from "./views/ArchitectureView";
import { ValidationView } from "./views/ValidationView";
import { PromptView } from "./views/PromptView";
import { VersionsView } from "./views/VersionsView";
import { JourneysView } from "./views/JourneysView";
import { DatabaseView } from "./views/DatabaseView";
import { ApiView } from "./views/ApiView";
import { SecurityView } from "./views/SecurityView";
import { DesignView } from "./views/DesignView";

const NAV: [View, string, LucideIcon][] = [
  ["overview", "Overview", LayoutDashboard], ["vision", "Product vision", Lightbulb], ["requirements", "Requirements", ClipboardList],
  ["journeys", "User journeys", Route], ["architecture", "System architecture", Network], ["design", "UI/UX design", Palette],
  ["database", "Database design", Database],
  ["api", "API design", Webhook], ["security", "Security & infra", ShieldCheck], ["validation", "Validation findings", CheckCircle2],
  ["prompt", "Implementation prompt", FileText], ["versions", "Versions & exports", History],
];

const STATUS: Record<SaveStatus, [string, LucideIcon, string]> = {
  loading: ["Loading", Loader2, "text-muted"], saved: ["Saved", Cloud, "text-ok"], dirty: ["Unsaved changes", GitBranch, "text-warn"],
  saving: ["Saving…", Loader2, "text-muted"], offline: ["Not saved — server unreachable", CloudOff, "text-err"],
  conflict: ["Conflict", AlertTriangle, "text-err"], invalid: ["Not saved — invalid", AlertTriangle, "text-err"], error: ["Save failed", AlertTriangle, "text-err"],
};

export function Workspace({ sample }: { sample: boolean }) {
  const store = useProject();
  const { project, loadError, doc, head, status, saveError, canUndo, canRedo, undo, redo, saveNow, reloadLatest, keepMine, setSelection } = store;
  const [view, setView] = useState<View>(sample ? "vision" : "overview");
  const [highlight, setHighlight] = useState<Set<string>>(new Set());

  if (loadError) return <div className="mx-auto max-w-lg p-10"><ErrorBox message={loadError.status === 404 ? "Project not found, or you do not have access to it." : loadError.message} /><Link className="mt-4 inline-block text-accent" href="/projects">Back to projects</Link></div>;
  if (!project || !doc) return <div className="flex h-screen items-center justify-center"><Spinner /></div>;
  const [label, Icon, tone] = STATUS[status];

  function showFinding(f: Finding) {
    setHighlight(new Set([...f.node_ids, ...f.edge_ids]));
    setSelection({ nodes: f.node_ids, edges: f.edge_ids });
    setView("architecture");
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-panel px-4 py-2">
        <Link href="/projects" aria-label="Back to projects" className="text-muted hover:text-fg"><ArrowLeft size={16} /></Link>
        <Logo size={16} />
        <span className="text-faint">/</span>
        <ProjectName key={project.name} initial={project.name} onRename={(n) => void store.renameProject(n)} />
        <span className={`flex items-center gap-1.5 text-xs ${tone}`} role="status" aria-live="polite" data-testid="save-status">
          <Icon size={13} className={status === "saving" || status === "loading" ? "animate-spin" : ""} /> {label}
        </span>
        <span className="text-xs text-faint" data-testid="head-revision">r{head}</span>
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" aria-label="Undo" disabled={!canUndo} onClick={undo}><Undo2 size={14} /></Button>
          <Button size="sm" variant="ghost" aria-label="Redo" disabled={!canRedo} onClick={redo}><Redo2 size={14} /></Button>
          <Button size="sm" disabled={status === "saved" || status === "saving"} onClick={() => void saveNow()}>Save now</Button>
        </div>
      </header>
      {(status === "conflict" || status === "invalid" || status === "offline" || status === "error") && saveError && (
        <div className="flex flex-wrap items-center gap-3 border-b border-err/40 bg-err/10 px-4 py-2 text-sm text-err" role="alert">
          <AlertTriangle size={15} />
          <span className="font-medium">{status === "conflict" ? "Someone (or another tab) saved a newer revision. Your edits are kept here but not saved." : saveError.message}</span>
          {saveError.errors.length > 0 && <span className="text-xs">{saveError.errors.slice(0, 3).map((e) => `${e.path}: ${e.message}`).join(" · ")}</span>}
          <div className="ml-auto flex gap-2">
            {status === "conflict" && <><Button size="sm" onClick={() => void reloadLatest()}>Load latest (discard mine)</Button><Button size="sm" variant="primary" onClick={() => void keepMine()}>Save mine as newest</Button></>}
            {(status === "offline" || status === "error") && <Button size="sm" onClick={() => void saveNow()}>Retry save</Button>}
            {status === "invalid" && <Button size="sm" onClick={undo} disabled={!canUndo}>Undo last change</Button>}
          </div>
        </div>
      )}
      <div className="border-b border-line bg-panel px-3 py-2 md:hidden">
        <label className="flex items-center gap-2 text-xs text-muted">Workspace
          <select aria-label="Workspace" className="flex-1 rounded border border-line bg-bg px-2 py-1.5 text-sm text-fg" value={view} onChange={(e) => setView(e.target.value as View)}>
            {NAV.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
          </select>
        </label>
      </div>
      <div className="flex min-h-0 flex-1">
        <nav aria-label="Workspaces" className="hidden w-52 shrink-0 overflow-auto border-r border-line bg-panel py-2 md:block">
          {NAV.map(([key, text, NavIcon]) => (
            <button key={key} type="button" onClick={() => setView(key)} aria-current={view === key ? "page" : undefined}
              className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] ${view === key ? "bg-panel-2 text-fg" : "text-muted hover:text-fg"}`}>
              <NavIcon size={15} aria-hidden /> {text}
              {key === "validation" && highlight.size > 0 && <Badge tone="warn">{highlight.size}</Badge>}
            </button>
          ))}
          <div className="mx-4 mt-3 border-t border-line pt-3 text-[11px] text-faint"><Boxes size={12} className="inline" /> {doc.nodes.length} components · {doc.edges.length} links</div>
        </nav>
        <main className="min-w-0 flex-1 overflow-auto" id="workspace-main">
          {view === "overview" && <OverviewView go={setView} />}
          {view === "vision" && <VisionView prefillSample={sample} onApplied={() => setView("architecture")} />}
          {view === "requirements" && <RequirementsView />}
          {view === "journeys" && <JourneysView />}
          {view === "architecture" && <ArchitectureView highlight={highlight} onGoToVision={() => setView("vision")} />}
          {view === "design" && <DesignView />}
          {view === "database" && <DatabaseView />}
          {view === "api" && <ApiView />}
          {view === "security" && <SecurityView onShow={showFinding} />}
          {view === "validation" && <ValidationView onShow={showFinding} />}
          {view === "prompt" && <PromptView />}
          {view === "versions" && <VersionsView />}
        </main>
      </div>
    </div>
  );
}

function ProjectName({ initial, onRename }: { initial: string; onRename: (name: string) => void }) {
  const [name, setName] = useState(initial);
  return (
    <div className="w-64 max-w-[45vw]"><Input aria-label="Project name" className="h-8 border-transparent bg-transparent font-medium hover:border-line" value={name} maxLength={200}
      onChange={(e) => setName(e.target.value)} onBlur={() => { if (name.trim() && name !== initial) onRename(name.trim()); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} /></div>
  );
}

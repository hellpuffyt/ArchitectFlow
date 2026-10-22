"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Copy, LogOut, Pencil, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { ApiError, api } from "@/lib/api";
import type { ProjectSummary } from "@/lib/api";
import { SessionProvider, useSession } from "@/lib/session";
import { Badge, Button, Dialog, EmptyState, ErrorBox, Field, Input, Spinner } from "@/components/ui";
import { Logo } from "@/components/Logo";

export default function ProjectsPage() {
  return <SessionProvider><Dashboard /></SessionProvider>;
}

function Dashboard() {
  const { me, signOut } = useSession();
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [q, setQ] = useState("");
  const [archived, setArchived] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.listProjects(q, archived).then(
    (p) => { setProjects(p); setError(null); },
    (e) => setError(e as ApiError),
  ), [q, archived]);
  useEffect(() => {
    if (!me) return;
    api.listProjects(q, archived).then((p) => { setProjects(p); setError(null); }, (e) => setError(e as ApiError));
  }, [me, q, archived]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    try { await fn(); await load(); } catch (e) { setError(e as ApiError); } finally { setBusy(false); }
  }

  async function create(sample: boolean) {
    setBusy(true);
    try {
      const p = await api.createProject(sample ? "Jewellery management SaaS (sample)" : name.trim());
      setCreating(false);
      router.push(`/projects/${p.id}${sample ? "?sample=1" : ""}`);
    } catch (e) {
      setError(e as ApiError);
      setBusy(false);
    }
  }

  if (!me) return <div className="flex h-screen items-center justify-center"><Spinner /></div>;
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-line px-6 py-3">
        <Logo />
        <div className="flex items-center gap-3 text-sm text-muted">
          <Badge tone={me.ai.mode === "example" ? "warn" : "ok"}>{me.ai.mode === "example" ? "Example mode" : `AI: ${me.ai.provider}`}</Badge>
          <Link href="/account" className="hover:text-fg">{me.user.email}</Link>
          <Button variant="ghost" size="sm" onClick={() => void signOut()} aria-label="Sign out"><LogOut size={14} /></Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Projects</h1>
          <div className="flex gap-2">
            <Button onClick={() => void create(true)} disabled={busy}><Sparkles size={14} /> Sample project</Button>
            <Button variant="primary" onClick={() => setCreating(true)}><Plus size={14} /> New project</Button>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="relative w-72">
            <Search size={14} className="absolute left-2.5 top-2.5 text-faint" />
            <Input aria-label="Search projects" placeholder="Search projects" className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Show archived
          </label>
        </div>
        {error && <div className="mt-4"><ErrorBox message={error.message} errors={error.errors} /></div>}
        <div className="mt-5">
          {projects === null ? <Spinner /> : projects.length === 0 ? (
            <EmptyState title={archived ? "No archived projects" : q ? "No matching projects" : "No projects yet"}
              body={archived || q ? "Try a different filter." : "Create a project and describe what you want to build, or start from the sample jewellery-management vision."}
              action={!archived && !q ? <Button variant="primary" onClick={() => setCreating(true)}><Plus size={14} /> New project</Button> : undefined} />
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel" aria-label="Projects">
              {projects.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <Link href={`/projects/${p.id}`} className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="text-xs text-faint">Revision {p.head_revision} · updated {new Date(p.updated_at).toLocaleString()}</p>
                  </Link>
                  <Button size="sm" variant="ghost" aria-label={`Rename ${p.name}`} onClick={() => { setRenaming(p); setName(p.name); }}><Pencil size={14} /></Button>
                  <Button size="sm" variant="ghost" aria-label={`Duplicate ${p.name}`} disabled={busy} onClick={() => void act(() => api.duplicateProject(p.id))}><Copy size={14} /></Button>
                  <Button size="sm" variant="ghost" aria-label={`${p.archived ? "Unarchive" : "Archive"} ${p.name}`} disabled={busy}
                    onClick={() => void act(() => api.patchProject(p.id, { archived: !p.archived }))}>
                    {p.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                  </Button>
                  <Button size="sm" variant="ghost" aria-label={`Delete ${p.name}`} onClick={() => setDeleting(p)}><Trash2 size={14} /></Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      <Dialog open={creating} onClose={() => setCreating(false)} title="New project"
        footer={<><Button onClick={() => setCreating(false)}>Cancel</Button>
          <Button variant="primary" disabled={!name.trim() || busy} onClick={() => void create(false)}>Create</Button></>}>
        <Field label="Project name" htmlFor="pname">
          <Input id="pname" autoFocus value={name} maxLength={200} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) void create(false); }} />
        </Field>
      </Dialog>
      <Dialog open={renaming !== null} onClose={() => setRenaming(null)} title="Rename project"
        footer={<><Button onClick={() => setRenaming(null)}>Cancel</Button>
          <Button variant="primary" disabled={!name.trim() || busy} onClick={() => { const p = renaming; setRenaming(null); if (p) void act(() => api.patchProject(p.id, { name: name.trim() })); }}>Save</Button></>}>
        <Field label="New name" htmlFor="rname"><Input id="rname" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} /></Field>
      </Dialog>
      <Dialog open={deleting !== null} onClose={() => setDeleting(null)} title="Delete project?"
        footer={<><Button onClick={() => setDeleting(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => { const p = deleting; setDeleting(null); if (p) void act(() => api.deleteProject(p.id)); }}>Delete permanently</Button></>}>
        <p>“{deleting?.name}” and all of its revisions, prompts and share links will be permanently deleted. This cannot be undone.</p>
      </Dialog>
    </div>
  );
}

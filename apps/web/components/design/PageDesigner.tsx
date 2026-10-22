"use client";
import { useMemo, useState } from "react";
import { History, Plus } from "lucide-react";
import { api } from "@/lib/api";
import type { RevisionSummary } from "@/lib/api";
import { useProject } from "@/lib/project-store";
import type { LayoutKind, LayoutNode, Page, PageStateKind } from "@/lib/design-types";
import { COMPONENTS, CONTAINERS, allIds, cloneWithIds, findNode, findParent, insertNode, moveNode, moveSibling, newNode, removeNode, updateNode } from "@/lib/layout";
import { uniqueId } from "@/lib/graph";
import { themeVars } from "@/lib/theme-css";
import type { ArchitectureDocument } from "@/lib/types";
import { Badge, Button, Dialog, EmptyState, Field, Input } from "@/components/ui";
import { COMPONENT_MIME, PageCanvas } from "./PageRenderer";
import { ElementInspector } from "./ElementInspector";
import { PageSettings } from "./PageSettings";

const WIDTHS = { Desktop: 1280, Tablet: 768, Mobile: 390 } as const;
type Width = keyof typeof WIDTHS;

function withPage(d: ArchitectureDocument, id: string, fn: (p: Page) => Page): ArchitectureDocument {
  return { ...d, design: { ...d.design, pages: d.design.pages.map((p) => (p.id === id ? fn(p) : p)) } };
}

export function PageDesigner() {
  const { doc, project, edit } = useProject();
  const [pageId, setPageId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [width, setWidth] = useState<Width>("Desktop");
  const [state, setState] = useState<PageStateKind | "">("");
  const [mode, setMode] = useState<"edit" | "prototype">("edit");
  const [toast, setToast] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRoute, setNewRoute] = useState("/");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [history, setHistory] = useState<RevisionSummary[] | null>(null);
  const theme = useMemo(() => doc?.design.themes.find((t) => t.id === doc.design.active_theme_id) ?? doc?.design.themes[0] ?? null, [doc]);
  if (!doc || !project) return null;
  const pages = doc.design.pages;
  const page = pages.find((p) => p.id === pageId) ?? pages[0] ?? null;

  function addPage() {
    const id = uniqueId(`page-${newName || "page"}`, [...allIds(pages)]);
    const root = newNode("container", uniqueId(`${id}-root`, [...allIds(pages), id]));
    const p: Page = { id, name: newName.trim() || "Untitled page", route: newRoute.startsWith("/") ? newRoute : `/${newRoute}`, parent_id: null, description: "",
      requires_auth: true, roles: [], states: [], layout: root };
    edit((d) => ({ ...d, design: { ...d.design, pages: [...d.design.pages, p] } }));
    setPageId(id);
    setSelected(null);
    setAdding(false);
  }

  if (!theme || !page) {
    return (
      <div className="p-8">
        <EmptyState title={!theme ? "Pick a theme first" : "No pages yet"}
          body={!theme ? "Open the Theme tab and choose a starting preset; pages render with your theme tokens." : "Generate pages from your requirements in the Design assistant tab, or add a page by hand."}
          action={theme ? <Button variant="primary" onClick={() => setAdding(true)}><Plus size={13} /> Add page</Button> : undefined} />
        <AddPageDialog open={adding} name={newName} route={newRoute} setName={setNewName} setRoute={setNewRoute} onClose={() => setAdding(false)} onAdd={addPage} />
      </div>
    );
  }

  const setLayout = (fn: (root: LayoutNode) => LayoutNode) => edit((d) => withPage(d, page.id, (p) => ({ ...p, layout: fn(p.layout) })));
  const sel = selected ? findNode(page.layout, selected) : null;
  const taken = () => allIds(doc.design.pages);

  function targetContainer(): string {
    if (sel && CONTAINERS.has(sel.kind)) return sel.id;
    if (sel) return findParent(page!.layout, sel.id)?.id ?? page!.layout.id;
    return page!.layout.id;
  }
  function addComponent(kind: LayoutKind, parentId = targetContainer(), index = Number.MAX_SAFE_INTEGER) {
    const id = uniqueId(`${page!.id}-${kind}`, [...taken()]);
    setLayout((root) => insertNode(root, parentId, index, newNode(kind, id)));
    setSelected(id);
  }
  function onDrop(parentId: string, index: number, data: { kind?: string; nodeId?: string }) {
    if (data.kind) addComponent(data.kind as LayoutKind, parentId, index);
    else if (data.nodeId) setLayout((root) => moveNode(root, data.nodeId!, parentId, index));
  }
  function onAction(node: LayoutNode) {
    const inter = node.interaction;
    if (!inter || inter.action === "none") { setToast(`“${String(node.props.label ?? node.kind)}” has no behavior defined.`); return; }
    if (inter.action === "navigate" && inter.implemented && inter.target_page_id && pages.some((p) => p.id === inter.target_page_id)) {
      setPageId(inter.target_page_id);
      setToast(null);
      return;
    }
    const what = inter.action === "call_api" ? `calls ${doc!.api.endpoints.find((e) => e.id === inter.endpoint_id)?.path ?? "an API"}` : inter.action.replace("_", " ");
    setToast(`Visual only: this ${node.kind} ${what}; the prototype does not perform it.`);
  }
  async function showHistory() { setHistory(await api.revisions(project!.id)); }
  async function restorePage(n: number) {
    const r = await api.revision(project!.id, n);
    const old = r.document.design?.pages.find((p) => p.id === page!.id);
    if (old) edit((d) => withPage(d, page!.id, () => old));
    else setToast(`Revision ${n} does not contain this page.`);
    setHistory(null);
  }

  const ordered = [...pages].sort((a, b) => a.route.localeCompare(b.route));
  const depth = (p: Page) => { let d = 0; let cur = p; while (cur.parent_id && d < 6) { const parent = pages.find((x) => x.id === cur.parent_id); if (!parent) break; cur = parent; d++; } return d; };
  const scale = Math.min(1, 860 / WIDTHS[width]);
  const previewMode = theme.appearance === "dark" ? "dark" : "light";

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-60 shrink-0 overflow-auto border-r border-line bg-panel" aria-label="Pages and components">
        <div className="flex items-center justify-between px-3 pt-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-faint">Pages & routes</p>
          <Button size="sm" variant="ghost" aria-label="Add page" onClick={() => setAdding(true)}><Plus size={12} /></Button></div>
        <ul className="px-1.5 py-1" aria-label="Pages">
          {ordered.map((p) => (
            <li key={p.id}><button type="button" onClick={() => { setPageId(p.id); setSelected(null); }} aria-current={p.id === page.id}
              className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs ${p.id === page.id ? "bg-panel-2 text-fg" : "text-muted hover:text-fg"}`} style={{ paddingLeft: 8 + depth(p) * 12 }}>
              <span className="truncate">{p.name}</span><code className="ml-auto truncate text-[10px] text-faint">{p.route}</code>
            </button></li>
          ))}
        </ul>
        <p className="px-3 pt-3 text-[10px] font-semibold uppercase tracking-wider text-faint">Components</p>
        <p className="px-3 text-[10px] text-faint">Drag onto the page, or click to add inside the selection.</p>
        {(["Layout", "Content", "Forms", "Data", "Feedback"] as const).map((g) => (
          <div key={g} className="px-1.5 py-1">
            <p className="px-1.5 text-[10px] text-faint">{g}</p>
            <div className="grid grid-cols-2 gap-1">
              {COMPONENTS.filter((c) => c.group === g).map((c) => (
                <button key={c.kind} type="button" draggable onDragStart={(e) => { e.dataTransfer.setData(COMPONENT_MIME, c.kind); e.dataTransfer.effectAllowed = "copy"; }}
                  onClick={() => addComponent(c.kind)} aria-label={`Add ${c.label}`} data-testid={`lib-${c.kind}`}
                  className="rounded border border-line px-1.5 py-1 text-left text-[11px] text-muted hover:border-line-strong hover:text-fg">{c.label}</button>
              ))}
            </div>
          </div>
        ))}
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2 text-xs">
          <div role="group" aria-label="Mode" className="flex gap-1">
            {(["edit", "prototype"] as const).map((m) => <button key={m} type="button" aria-pressed={mode === m} onClick={() => { setMode(m); setToast(null); }} className={`rounded px-2 py-1 ${mode === m ? "bg-panel-2 text-fg" : "text-muted"}`}>{m === "edit" ? "Edit" : "Prototype"}</button>)}
          </div>
          <div role="group" aria-label="Breakpoint" className="flex gap-1">
            {(Object.keys(WIDTHS) as Width[]).map((w) => <button key={w} type="button" aria-pressed={width === w} onClick={() => setWidth(w)} className={`rounded px-2 py-1 ${width === w ? "bg-panel-2 text-fg" : "text-muted"}`}>{w} {WIDTHS[w]}</button>)}
          </div>
          <label className="flex items-center gap-1 text-muted">State
            <select aria-label="Preview state" className="rounded border border-line bg-bg px-1 py-0.5" value={state} onChange={(e) => setState(e.target.value as PageStateKind | "")}>
              <option value="">default</option>{page.states.map((s) => <option key={s.kind} value={s.kind}>{s.kind.replace("_", " ")}</option>)}
            </select>
          </label>
          <Button size="sm" variant="ghost" onClick={() => void showHistory()}><History size={12} /> Page history</Button>
          <span className="ml-auto text-faint">{page.route} · {page.requires_auth ? (page.roles.length ? `roles: ${page.roles.join(", ")}` : "signed-in") : "public"}</span>
        </div>
        {toast && <div role="status" className="border-b border-warn/30 bg-warn/10 px-4 py-1.5 text-xs text-warn" data-testid="prototype-toast">{toast}</div>}
        <div className="min-h-0 flex-1 overflow-auto bg-[#07090d] p-6" onClick={() => setSelected(null)}>
          <div style={{ width: WIDTHS[width] * scale, height: "auto" }} className="mx-auto">
            <div style={{ ...themeVars(theme, previewMode), transform: `scale(${scale})`, transformOrigin: "top left", width: WIDTHS[width] }}
              className="overflow-hidden rounded-lg border border-line shadow-2xl">
              <PageCanvas page={page} theme={theme} mode={previewMode} width={WIDTHS[width]} state={state || null} editing={mode === "edit"} selected={selected}
                onSelect={setSelected} onDrop={onDrop} onAction={onAction} />
            </div>
          </div>
        </div>
      </section>
      <aside className="w-80 shrink-0 overflow-auto border-l border-line bg-panel" aria-label="Page and element inspector">
        {sel ? (
          <>
            <div className="flex items-center gap-2 border-b border-line px-4 py-2 text-xs"><button type="button" className="text-accent" onClick={() => setSelected(null)}>← Page settings</button><Badge>{sel.kind}</Badge></div>
            <ElementInspector page={page} node={sel}
              onChange={(patch) => setLayout((root) => updateNode(root, sel.id, patch))}
              onRemove={() => { setLayout((root) => removeNode(root, sel.id)); setSelected(null); }}
              onDuplicate={() => { const parent = findParent(page.layout, sel.id); if (!parent) return; const copy = cloneWithIds(sel, taken()); const idx = parent.children.findIndex((c) => c.id === sel.id) + 1; setLayout((root) => insertNode(root, parent.id, idx, copy)); setSelected(copy.id); }}
              onMove={(dlt) => setLayout((root) => moveSibling(root, sel.id, dlt))} />
          </>
        ) : (
          <PageSettings page={page} onChange={(patch) => edit((d) => withPage(d, page.id, (p) => ({ ...p, ...patch })))}
            onDelete={() => setConfirmDelete(true)}
            onDuplicate={() => {
              const ids = taken();
              const id = uniqueId(`${page.id}-copy`, [...ids]);
              ids.add(id);
              const copy: Page = { ...structuredClone(page), id, name: `${page.name} (copy)`, route: `${page.route.replace(/\/$/, "")}-copy`, layout: cloneWithIds(page.layout, ids) };
              edit((d) => ({ ...d, design: { ...d.design, pages: [...d.design.pages, copy] } }));
              setPageId(id);
            }} />
        )}
      </aside>
      <AddPageDialog open={adding} name={newName} route={newRoute} setName={setNewName} setRoute={setNewRoute} onClose={() => setAdding(false)} onAdd={addPage} />
      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title={`Delete page “${page.name}”?`}
        footer={<><Button onClick={() => setConfirmDelete(false)}>Cancel</Button><Button variant="danger" onClick={() => {
          edit((d) => ({ ...d, design: { ...d.design,
            pages: d.design.pages.filter((p) => p.id !== page.id).map((p) => (p.parent_id === page.id ? { ...p, parent_id: null } : p)),
            journeys: d.design.journeys.map((j) => ({ ...j, steps: j.steps.filter((s) => s.page_id !== page.id) })) } }));
          setConfirmDelete(false); setPageId(null); setSelected(null);
        }}>Delete</Button></>}>
        <p>The page is removed; child pages move to the top level and journey steps that pointed to it are removed. Links from other pages to it will be reported by validation. You can undo this or restore an earlier revision.</p>
      </Dialog>
      <Dialog open={history !== null} onClose={() => setHistory(null)} title={`Restore “${page.name}” from a revision`}>
        <ul className="space-y-1">{(history ?? []).map((r) => <li key={r.number}><button type="button" className="w-full rounded px-2 py-1 text-left text-sm hover:bg-panel-2" onClick={() => void restorePage(r.number)}>r{r.number} · {r.source} · {new Date(r.created_at).toLocaleString()}</button></li>)}</ul>
      </Dialog>
    </div>
  );
}

function AddPageDialog({ open, name, route, setName, setRoute, onClose, onAdd }: { open: boolean; name: string; route: string; setName: (v: string) => void; setRoute: (v: string) => void; onClose: () => void; onAdd: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Add page"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!name.trim() || !route.trim()} onClick={onAdd}>Add page</Button></>}>
      <div className="space-y-3">
        <Field label="Page name" htmlFor="np-name"><Input id="np-name" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Route" htmlFor="np-route"><Input id="np-route" className="font-mono" value={route} maxLength={200} onChange={(e) => setRoute(e.target.value.replace(/[^A-Za-z0-9_\-/{}:.[\]]/g, ""))} /></Field>
      </div>
    </Dialog>
  );
}

"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, History, Pencil, RotateCcw, Trash2, Upload } from "lucide-react";
import { ApiError, api } from "@/lib/api";
import type { RevisionSummary } from "@/lib/api";
import { useProject } from "@/lib/project-store";
import { PALETTE_KEYS } from "@/lib/design-types";
import type { Palette, Theme } from "@/lib/design-types";
import { uniqueId } from "@/lib/graph";
import type { ArchitectureDocument } from "@/lib/types";
import { Badge, Button, Dialog, ErrorBox, Input } from "@/components/ui";
import { Choice, ColorEditor, ContrastRow, Slider } from "./controls";
import { ThemePreview } from "./ThemePreview";

const FONTS = ["Inter, system-ui, sans-serif", "system-ui, sans-serif", "Georgia, serif", "\"IBM Plex Sans\", sans-serif", "\"Source Serif 4\", serif", "ui-monospace, Menlo, monospace"];
const WIDTHS = { Desktop: 1180, Tablet: 768, Mobile: 390 } as const;

function setTheme(d: ArchitectureDocument, theme: Theme): ArchitectureDocument {
  return { ...d, design: { ...d.design, themes: d.design.themes.map((t) => (t.id === theme.id ? theme : t)) } };
}

export function ThemeEditor() {
  const { doc, project, edit, transientEdit, status } = useProject();
  const [presets, setPresets] = useState<Theme[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [colorKey, setColorKey] = useState<keyof Palette>("primary");
  const [paletteMode, setPaletteMode] = useState<"light" | "dark">("light");
  const [width, setWidth] = useState<keyof typeof WIDTHS>("Desktop");
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [revs, setRevs] = useState<RevisionSummary[]>([]);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { api.presets().then(setPresets).catch((e) => setError(e as ApiError)); }, []);

  const theme = useMemo(() => doc?.design.themes.find((t) => t.id === doc.design.active_theme_id) ?? doc?.design.themes[0] ?? null, [doc]);
  const [name, setName] = useState("");
  if (!doc || !project) return null;

  function addFromPreset(preset: Theme) {
    const id = uniqueId(`theme-${preset.preset || preset.id}`, doc!.design.themes.map((t) => t.id));
    edit((d) => ({ ...d, design: { ...d.design, themes: [...d.design.themes, { ...structuredClone(preset), id }], active_theme_id: id } }));
  }

  if (!theme) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-8">
        <h2 className="text-base font-semibold">Choose a starting theme</h2>
        <p className="text-sm text-muted">Presets are starting points; every token stays editable.</p>
        {error && <ErrorBox message={error.message} />}
        <div className="grid gap-3 sm:grid-cols-3">
          {presets.map((p) => (
            <button key={p.preset} type="button" onClick={() => addFromPreset(p)} className="rounded-xl border border-line bg-panel p-3 text-left hover:border-line-strong" aria-label={`Use preset ${p.name}`}>
              <div className="mb-2 flex gap-1">{(["primary", "accent", "background", "surface", "text"] as const).map((k) => <span key={k} className="h-5 w-5 rounded border border-line" style={{ background: (p.appearance === "dark" ? p.dark : p.light)[k] }} />)}</div>
              <p className="text-sm font-medium">{p.name}</p><p className="text-xs text-faint">{p.appearance}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const t = theme;
  const palette = paletteMode === "dark" ? t.dark : t.light;
  const update = (fn: (x: Theme) => Theme, transient = false) => (transient ? transientEdit : edit)((d) => {
    const cur = d.design.themes.find((x) => x.id === t.id);
    return cur ? setTheme(d, fn(cur)) : d;
  });
  const previewMode: "light" | "dark" = t.appearance === "system" ? paletteMode : t.appearance;
  const shown = previewMode === "dark" ? t.dark : t.light;

  async function exportTheme(kind: "tokens" | "css") {
    const url = api.exportUrl(project!.id, kind);
    const a = document.createElement("a");
    a.href = url;
    a.click();
  }
  async function importTokens(f: File | undefined) {
    if (!f) return;
    setError(null);
    try {
      const raw = JSON.parse(await f.text());
      const incoming: Theme[] = Array.isArray(raw?.themes) ? raw.themes : raw?.id && raw?.light ? [raw] : [];
      if (incoming.length === 0) throw new ApiError(422, "No themes found. Expected an ArchitectFlow tokens.json or a single theme object.");
      const taken = doc!.design.themes.map((x) => x.id);
      const renamed = incoming.slice(0, 10).map((th) => ({ ...th, id: uniqueId(th.id || "theme", taken.concat(incoming.map((x) => x.id))) }));
      const next = { ...doc!, design: { ...doc!.design, themes: [...doc!.design.themes, ...renamed], active_theme_id: renamed[0].id } };
      await api.validateDocument(project!.id, next); // server validates every token before we apply it
      edit(() => next);
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(422, "The file is not valid JSON."));
    } finally { if (file.current) file.current.value = ""; }
  }
  async function openRestore() {
    setRestoreOpen(true);
    setRevs(await api.revisions(project!.id));
  }
  async function restoreFrom(n: number) {
    const r = await api.revision(project!.id, n);
    const old = r.document.design?.themes.find((x) => x.id === t.id);
    if (!old) { setError(new ApiError(404, `Revision ${n} has no theme “${t.name}”.`)); return; }
    update(() => old);
    setRestoreOpen(false);
  }
  const preset = presets.find((p) => p.preset === t.preset);

  return (
    <div className="flex h-full min-h-0">
      <aside className="w-[360px] shrink-0 space-y-4 overflow-auto border-r border-line bg-panel p-4" aria-label="Theme tokens">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <select aria-label="Active theme" className="flex-1 rounded border border-line bg-bg px-2 py-1.5 text-sm" value={t.id}
              onChange={(e) => edit((d) => ({ ...d, design: { ...d.design, active_theme_id: e.target.value } }))}>
              {doc.design.themes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            {status === "dirty" || status === "saving" ? <Badge tone="warn">unsaved</Badge> : <Badge tone="ok">saved</Badge>}
          </div>
          <div className="flex flex-wrap gap-1">
            <select aria-label="New theme from preset" className="rounded border border-line bg-bg px-1.5 py-1 text-xs" value=""
              onChange={(e) => { const p = presets.find((x) => x.preset === e.target.value); if (p) addFromPreset(p); }}>
              <option value="">+ New from preset…</option>
              {presets.map((p) => <option key={p.preset} value={p.preset}>{p.name}</option>)}
            </select>
            <Button size="sm" variant="ghost" aria-label="Duplicate theme" onClick={() => { const id = uniqueId(`${t.id}-copy`, doc.design.themes.map((x) => x.id)); edit((d) => ({ ...d, design: { ...d.design, themes: [...d.design.themes, { ...structuredClone(t), id, name: `${t.name} (copy)` }], active_theme_id: id } })); }}><Copy size={12} /></Button>
            <Button size="sm" variant="ghost" aria-label="Rename theme" onClick={() => { setName(t.name); setRenaming(true); }}><Pencil size={12} /></Button>
            <Button size="sm" variant="ghost" aria-label="Reset theme to preset" disabled={!preset} title={preset ? `Reset to ${preset.name}` : "Not based on a preset"} onClick={() => preset && update(() => ({ ...structuredClone(preset), id: t.id, name: t.name }))}><RotateCcw size={12} /></Button>
            <Button size="sm" variant="ghost" aria-label="Restore theme from a revision" onClick={() => void openRestore()}><History size={12} /></Button>
            <Button size="sm" variant="ghost" aria-label="Import theme tokens" onClick={() => file.current?.click()}><Upload size={12} /></Button>
            <Button size="sm" variant="ghost" aria-label="Export tokens JSON" onClick={() => void exportTheme("tokens")}><Download size={12} /> JSON</Button>
            <Button size="sm" variant="ghost" aria-label="Export CSS variables" onClick={() => void exportTheme("css")}><Download size={12} /> CSS</Button>
            <Button size="sm" variant="ghost" aria-label="Delete theme" disabled={doc.design.themes.length < 2} onClick={() => setDeleting(true)}><Trash2 size={12} /></Button>
            <input ref={file} type="file" accept=".json,application/json" className="hidden" aria-label="Theme file" onChange={(e) => void importTokens(e.target.files?.[0])} />
          </div>
          {error && <ErrorBox message={error.message} errors={error.errors} />}
        </div>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-faint">Appearance & colors</h3>
          <Choice label="Appearance" value={t.appearance} options={["light", "dark", "system"] as const} onChange={(v) => update((x) => ({ ...x, appearance: v }))} />
          <div className="flex gap-1 text-xs" role="tablist" aria-label="Palette">
            {(["light", "dark"] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={paletteMode === m} onClick={() => setPaletteMode(m)}
                className={`rounded px-2 py-1 ${paletteMode === m ? "bg-panel-2 text-fg" : "text-muted"}`}>{m} palette</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1">
            {PALETTE_KEYS.map((k) => (
              <button key={k} type="button" onClick={() => setColorKey(k)} aria-pressed={colorKey === k} aria-label={`Edit ${k.replace("_", " ")} color`}
                className={`flex items-center gap-2 rounded px-1.5 py-1 text-left text-xs ${colorKey === k ? "bg-panel-2 ring-1 ring-accent" : "hover:bg-panel-2"}`}>
                <span className="h-4 w-4 shrink-0 rounded border border-line" style={{ background: palette[k] }} />
                <span className="truncate">{k.replace("_", " ")}</span><code className="ml-auto text-[10px] text-faint">{palette[k]}</code>
              </button>
            ))}
          </div>
          <ColorEditor name={colorKey.replace("_", " ")} value={palette[colorKey]} onChange={(hex) => update((x) => ({ ...x, [paletteMode]: { ...x[paletteMode], [colorKey]: hex } }))} />
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-faint">Typography</h3>
          <Choice label="Heading font" value={t.typography.heading_font} options={[...new Set([t.typography.heading_font, ...FONTS])]} onChange={(v) => update((x) => ({ ...x, typography: { ...x.typography, heading_font: v } }))} />
          <Choice label="Body font" value={t.typography.body_font} options={[...new Set([t.typography.body_font, ...FONTS])]} onChange={(v) => update((x) => ({ ...x, typography: { ...x.typography, body_font: v } }))} />
          <Slider label="Base size" unit="px" value={t.typography.base_size} min={12} max={22} onChange={(v, tr) => update((x) => ({ ...x, typography: { ...x.typography, base_size: v } }), tr)} />
          <Slider label="Scale ratio" value={t.typography.scale_ratio} min={1.05} max={1.6} step={0.01} onChange={(v, tr) => update((x) => ({ ...x, typography: { ...x.typography, scale_ratio: v } }), tr)} />
          <Slider label="Heading weight" value={t.typography.heading_weight} min={300} max={900} step={50} onChange={(v, tr) => update((x) => ({ ...x, typography: { ...x.typography, heading_weight: v } }), tr)} />
          <Slider label="Body weight" value={t.typography.body_weight} min={300} max={700} step={50} onChange={(v, tr) => update((x) => ({ ...x, typography: { ...x.typography, body_weight: v } }), tr)} />
          <Slider label="Line height" value={t.typography.line_height} min={1.1} max={2.2} step={0.05} onChange={(v, tr) => update((x) => ({ ...x, typography: { ...x.typography, line_height: v } }), tr)} />
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-faint">Spacing, shape, elevation</h3>
          <Slider label="Spacing unit" unit="px" value={t.spacing.unit} min={2} max={12} onChange={(v, tr) => update((x) => ({ ...x, spacing: { ...x.spacing, unit: v } }), tr)} />
          <Choice label="Density" value={t.spacing.density} options={["compact", "comfortable", "spacious"] as const} onChange={(v) => update((x) => ({ ...x, spacing: { ...x.spacing, density: v } }))} />
          {(["sm", "md", "lg"] as const).map((k) => (
            <Slider key={k} label={`Radius ${k}`} unit="px" value={t.radii[k]} min={0} max={40} onChange={(v, tr) => update((x) => ({ ...x, radii: { ...x.radii, [k]: v } }), tr)} />
          ))}
          <Choice label="Shadows" value={t.elevation.shadow} options={["none", "subtle", "medium", "strong"] as const} onChange={(v) => update((x) => ({ ...x, elevation: { ...x.elevation, shadow: v } }))} />
          <Slider label="Border width" unit="px" value={t.elevation.border_width} min={0} max={4} onChange={(v, tr) => update((x) => ({ ...x, elevation: { ...x.elevation, border_width: v } }), tr)} />
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-faint">Components</h3>
          <Choice label="Buttons" value={t.components.button} options={["solid", "outline", "soft"] as const} onChange={(v) => update((x) => ({ ...x, components: { ...x.components, button: v } }))} />
          <Choice label="Button radius" value={t.components.button_radius} options={["sm", "md", "lg", "full"] as const} onChange={(v) => update((x) => ({ ...x, components: { ...x.components, button_radius: v } }))} />
          <Choice label="Inputs" value={t.components.input} options={["outline", "filled", "underline"] as const} onChange={(v) => update((x) => ({ ...x, components: { ...x.components, input: v } }))} />
          <Choice label="Cards" value={t.components.card} options={["elevated", "outlined", "flat"] as const} onChange={(v) => update((x) => ({ ...x, components: { ...x.components, card: v } }))} />
          <Choice label="Navigation" value={t.components.navigation} options={["sidebar", "topbar"] as const} onChange={(v) => update((x) => ({ ...x, components: { ...x.components, navigation: v } }))} />
          <Choice label="Tables" value={t.components.table_density} options={["compact", "comfortable"] as const} onChange={(v) => update((x) => ({ ...x, components: { ...x.components, table_density: v } }))} />
          <Slider label="Icon stroke" value={t.components.icon_stroke} min={1} max={3} step={0.25} onChange={(v, tr) => update((x) => ({ ...x, components: { ...x.components, icon_stroke: v } }), tr)} />
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-faint">Layout & breakpoints</h3>
          <Slider label="Max width" unit="px" value={t.layout.max_width} min={480} max={2400} step={20} onChange={(v, tr) => update((x) => ({ ...x, layout: { ...x.layout, max_width: v } }), tr)} />
          <Slider label="Grid columns" value={t.layout.grid_columns} min={1} max={24} onChange={(v, tr) => update((x) => ({ ...x, layout: { ...x.layout, grid_columns: v } }), tr)} />
          <Slider label="Gutter" unit="px" value={t.layout.gutter} min={0} max={64} onChange={(v, tr) => update((x) => ({ ...x, layout: { ...x.layout, gutter: v } }), tr)} />
          <Slider label="Breakpoint sm" unit="px" value={t.layout.breakpoints.sm} min={320} max={1200} step={10} onChange={(v, tr) => update((x) => ({ ...x, layout: { ...x.layout, breakpoints: { ...x.layout.breakpoints, sm: v } } }), tr)} />
          <Slider label="Breakpoint md" unit="px" value={t.layout.breakpoints.md} min={480} max={1600} step={10} onChange={(v, tr) => update((x) => ({ ...x, layout: { ...x.layout, breakpoints: { ...x.layout.breakpoints, md: v } } }), tr)} />
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-faint">Motion</h3>
          <Choice label="Intensity" value={t.motion.intensity} options={["none", "subtle", "standard", "expressive"] as const} onChange={(v) => update((x) => ({ ...x, motion: { ...x.motion, intensity: v } }))} />
          <Slider label="Duration" unit="ms" value={t.motion.duration_ms} min={0} max={1000} step={10} onChange={(v, tr) => update((x) => ({ ...x, motion: { ...x.motion, duration_ms: v } }), tr)} />
          <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={t.motion.respect_reduced_motion} onChange={(e) => update((x) => ({ ...x, motion: { ...x.motion, respect_reduced_motion: e.target.checked } }))} /> Respect reduced-motion preference</label>
        </section>

        <section aria-label="Accessibility checks">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-faint">Contrast ({previewMode})</h3>
          <table className="w-full text-xs">
            <tbody>
              <ContrastRow label="Text on background" fg={shown.text} bg={shown.background} min={4.5} />
              <ContrastRow label="Text on surface" fg={shown.text} bg={shown.surface} min={4.5} />
              <ContrastRow label="Muted text" fg={shown.muted_text} bg={shown.background} min={4.5} />
              <ContrastRow label="Button text" fg={shown.on_primary} bg={shown.primary} min={4.5} />
              <ContrastRow label="Danger on background" fg={shown.danger} bg={shown.background} min={3} />
            </tbody>
          </table>
          {t.typography.base_size < 14 && <p className="mt-1 text-xs text-warn">Body text below 14px is hard to read.</p>}
        </section>
      </aside>
      <section className="min-w-0 flex-1 overflow-auto bg-bg p-6" aria-label="Live preview">
        <div className="mb-3 flex items-center gap-2 text-xs">
          <span className="text-muted">Live preview from saved tokens of “{t.name}”</span>
          <div className="ml-auto flex gap-1" role="group" aria-label="Preview size">
            {(Object.keys(WIDTHS) as (keyof typeof WIDTHS)[]).map((w) => (
              <button key={w} type="button" aria-pressed={width === w} onClick={() => setWidth(w)} className={`rounded px-2 py-1 ${width === w ? "bg-panel-2 text-fg" : "text-muted"}`}>{w} {WIDTHS[w]}</button>
            ))}
          </div>
        </div>
        <ThemePreview theme={t} mode={previewMode} width={WIDTHS[width]} />
      </section>
      <Dialog open={renaming} onClose={() => setRenaming(false)} title="Rename theme"
        footer={<><Button onClick={() => setRenaming(false)}>Cancel</Button><Button variant="primary" disabled={!name.trim()} onClick={() => { update((x) => ({ ...x, name: name.trim().slice(0, 200) })); setRenaming(false); }}>Save</Button></>}>
        <Input aria-label="Theme name" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
      </Dialog>
      <Dialog open={deleting} onClose={() => setDeleting(false)} title={`Delete theme “${t.name}”?`}
        footer={<><Button onClick={() => setDeleting(false)}>Cancel</Button><Button variant="danger" onClick={() => { edit((d) => { const rest = d.design.themes.filter((x) => x.id !== t.id); return { ...d, design: { ...d.design, themes: rest, active_theme_id: rest[0]?.id ?? null } }; }); setDeleting(false); }}>Delete</Button></>}>
        <p>The theme is removed from the current design. Earlier revisions still contain it and can be restored.</p>
      </Dialog>
      <Dialog open={restoreOpen} onClose={() => setRestoreOpen(false)} title={`Restore “${t.name}” from a revision`}>
        <ul className="space-y-1">
          {revs.map((r) => (
            <li key={r.number}><button type="button" className="w-full rounded px-2 py-1 text-left text-sm hover:bg-panel-2" onClick={() => void restoreFrom(r.number)}>r{r.number} · {r.source} · {new Date(r.created_at).toLocaleString()}</button></li>
          ))}
        </ul>
      </Dialog>
    </div>
  );
}


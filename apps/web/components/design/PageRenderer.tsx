"use client";
import { useState } from "react";
import type { CSSProperties, DragEvent, ReactNode } from "react";
import type { LayoutNode, Page, PageStateKind } from "@/lib/design-types";
import { effectiveRule } from "@/lib/layout";
import type { Breakpoint } from "@/lib/layout";
import { Alert, Bars, Btn, Field, K, SAMPLE_ROWS, Table, cardStyle, inputStyle, s } from "./kit";
import type { Theme } from "@/lib/design-types";

export const COMPONENT_MIME = "application/x-af-component";
export const NODE_MIME = "application/x-af-node";

interface Ctx {
  theme: Theme;
  bp: Breakpoint;
  state: PageStateKind | null;
  page: Page;
  editing: boolean;
  selected: string | null;
  onSelect: (id: string) => void;
  onDrop: (parentId: string, index: number, data: { kind?: string; nodeId?: string }) => void;
  onAction: (node: LayoutNode) => void;
}

function msg(page: Page, kind: PageStateKind, fallback: string) {
  return page.states.find((x) => x.kind === kind)?.message || fallback;
}

function DropZone({ ctx, parentId, index, horizontal }: { ctx: Ctx; parentId: string; index: number; horizontal: boolean }) {
  const [over, setOver] = useState(false);
  if (!ctx.editing) return null;
  const accept = (e: DragEvent) => e.dataTransfer.types.includes(COMPONENT_MIME) || e.dataTransfer.types.includes(NODE_MIME);
  return (
    <div data-testid={`drop-${parentId}-${index}`} aria-hidden
      onDragOver={(e) => { if (accept(e)) { e.preventDefault(); e.stopPropagation(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault(); e.stopPropagation(); setOver(false);
        ctx.onDrop(parentId, index, { kind: e.dataTransfer.getData(COMPONENT_MIME) || undefined, nodeId: e.dataTransfer.getData(NODE_MIME) || undefined });
      }}
      style={{ flex: "0 0 auto", alignSelf: "stretch", minWidth: horizontal ? 8 : undefined, minHeight: horizontal ? undefined : 8,
        background: over ? "var(--accent)" : "transparent", borderRadius: 3, outline: over ? "none" : "1px dashed transparent" }} />
  );
}

function Children({ node, ctx, horizontal }: { node: LayoutNode; ctx: Ctx; horizontal: boolean }) {
  const out: ReactNode[] = [];
  node.children.forEach((c, i) => {
    out.push(<DropZone key={`d${i}`} ctx={ctx} parentId={node.id} index={i} horizontal={horizontal} />);
    out.push(<Render key={c.id} node={c} ctx={ctx} />);
  });
  out.push(<DropZone key="dend" ctx={ctx} parentId={node.id} index={node.children.length} horizontal={horizontal} />);
  if (ctx.editing && node.children.length === 0) out.push(<span key="hint" style={{ fontSize: 11, color: "var(--t-muted-text)", opacity: 0.7 }}>Drop components here</span>);
  return <>{out}</>;
}

function str(v: unknown, d = ""): string { return v === undefined || v === null ? d : String(v); }

export function Render({ node, ctx }: { node: LayoutNode; ctx: Ctx }) {
  const rule = effectiveRule(node, ctx.bp);
  const p = node.props;
  const theme = ctx.theme;
  const sel = ctx.editing && ctx.selected === node.id;
  const wrap = (content: ReactNode, style: CSSProperties = {}) => (
    <div data-testid={`el-${node.id}`} data-kind={node.kind}
      onClick={ctx.editing ? (e) => { e.stopPropagation(); ctx.onSelect(node.id); } : undefined}
      draggable={ctx.editing && node.id !== ctx.page.layout.id}
      onDragStart={ctx.editing ? (e) => { e.stopPropagation(); e.dataTransfer.setData(NODE_MIME, node.id); } : undefined}
      style={{ position: "relative", outline: sel ? "2px solid var(--accent)" : ctx.editing ? "1px dashed transparent" : undefined, outlineOffset: 2, borderRadius: 4, ...style }}
      className={ctx.editing ? "af-editable" : undefined}>
      {content}
    </div>
  );
  if (rule.hidden) {
    return ctx.editing
      ? <div data-testid={`hidden-${node.id}`} onClick={(e) => { e.stopPropagation(); ctx.onSelect(node.id); }}
          style={{ fontSize: 10, color: "var(--t-muted-text)", border: "1px dashed var(--t-border)", padding: "2px 6px", borderRadius: 4, outline: sel ? "2px solid var(--accent)" : undefined }}>
          {node.kind} hidden at this breakpoint</div>
      : null;
  }
  const loading = ctx.state === "loading";
  const dataEmpty = ctx.state === "empty";
  const vErr = ctx.state === "validation_error";
  switch (node.kind) {
    case "container":
      return wrap(<div style={{ display: "flex", flexDirection: "column", gap: s(4), maxWidth: p.max_width ? Number(p.max_width) : "var(--t-max)", margin: p.align === "center" ? "0 auto" : undefined, width: "100%" }}><Children node={node} ctx={ctx} horizontal={false} /></div>);
    case "stack": {
      const dir = rule.direction ?? str(p.direction, "column");
      return wrap(<div data-direction={dir} style={{ display: "flex", flexDirection: dir === "row" ? "row" : "column", gap: s(Number(p.gap ?? 3)), alignItems: dir === "row" ? "center" : "stretch", justifyContent: p.justify === "between" ? "space-between" : "flex-start", flexWrap: "wrap" }}><Children node={node} ctx={ctx} horizontal={dir === "row"} /></div>);
    }
    case "grid": {
      const cols = rule.columns ?? Number(p.columns ?? 3);
      return wrap(<div data-columns={cols} style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: "var(--t-gutter)" }}><Children node={node} ctx={ctx} horizontal={false} /></div>);
    }
    case "card":
      return wrap(<div style={{ ...cardStyle(theme.components.card), display: "flex", flexDirection: "column", gap: s(3) }}>{p.title ? <h3 style={K.h(3)}>{str(p.title)}</h3> : null}<Children node={node} ctx={ctx} horizontal={false} /></div>);
    case "nav": {
      const side = theme.components.navigation === "sidebar" && ctx.bp === "base";
      return wrap(<nav aria-label={str(p.label, "Navigation")} style={{ display: "flex", flexDirection: side ? "column" : "row", gap: s(1), padding: s(2), background: "var(--t-surface)", border: "var(--t-bw) solid var(--t-border)", borderRadius: "var(--t-r-md)", overflowX: "auto" }}><Children node={node} ctx={ctx} horizontal={!side} /></nav>);
    }
    case "tabs": {
      const tabs = str(p.tabs, "Tab").split(",").map((t) => t.trim()).filter(Boolean);
      return wrap(<div><div role="tablist" style={{ display: "flex", gap: s(3), borderBottom: "var(--t-bw) solid var(--t-border)", marginBottom: s(3) }}>{tabs.map((t, i) => <span role="tab" aria-selected={i === 0} key={t} style={{ padding: `${s(1)} 0`, borderBottom: i === 0 ? "2px solid var(--t-primary)" : undefined, color: i === 0 ? "var(--t-text)" : "var(--t-muted-text)", fontWeight: 600, fontSize: "0.9em" }}>{t}</span>)}</div><Children node={node} ctx={ctx} horizontal={false} /></div>);
    }
    case "modal":
      return wrap(<div role="dialog" aria-label={str(p.title)} style={{ ...cardStyle("elevated"), boxShadow: "var(--t-shadow)", border: "var(--t-bw) solid var(--t-border)", maxWidth: 480 }}><h3 style={K.h(3)}>{str(p.title)}</h3><div style={{ marginTop: s(3), display: "flex", flexDirection: "column", gap: s(3) }}><Children node={node} ctx={ctx} horizontal={false} /></div></div>);
    case "form":
      return wrap(<form onSubmit={(e) => e.preventDefault()} aria-label={str(p.label, "Form")} style={{ display: "grid", gridTemplateColumns: rule.columns && rule.columns > 1 ? `repeat(${rule.columns}, 1fr)` : "1fr", gap: s(3) }}>{vErr ? <Alert tone="danger">{msg(ctx.page, "validation_error", "Please fix the highlighted fields.")}</Alert> : null}<Children node={node} ctx={ctx} horizontal={false} /></form>);
    case "list":
      return wrap(<div><p style={{ ...K.muted, fontSize: "0.85em", margin: 0 }}>{str(p.label)}</p><ul style={{ margin: 0, paddingLeft: 18 }}>{dataEmpty ? <li style={K.muted}>{msg(ctx.page, "empty", "Nothing here yet.")}</li> : loading ? <li style={K.muted}>Loading…</li> : ["First item", "Second item", "Third item"].map((t) => <li key={t}>{t}</li>)}</ul><Children node={node} ctx={ctx} horizontal={false} /></div>);
    case "heading":
      return wrap(<h2 style={K.h(Number(p.level ?? 2))}>{str(p.text, "Heading")}</h2>);
    case "text":
      return wrap(<p style={{ margin: 0, ...(p.muted ? K.muted : {}) }}>{str(p.text)}</p>);
    case "badge":
      return wrap(<span style={{ display: "inline-block", padding: `0 ${s(2)}`, borderRadius: 999, background: "color-mix(in srgb, var(--t-accent) 18%, transparent)", color: "var(--t-text)", fontSize: "0.8em", fontWeight: 600 }}>{str(p.text)}</span>);
    case "divider":
      return wrap(<hr style={{ border: 0, borderTop: "var(--t-bw) solid var(--t-border)", margin: 0 }} />);
    case "image":
      return wrap(<div role="img" aria-label={str(p.alt, "Image")} style={{ height: 120, borderRadius: "var(--t-r-md)", background: "linear-gradient(135deg, color-mix(in srgb, var(--t-primary) 30%, var(--t-surface)), var(--t-surface))", display: "flex", alignItems: "center", justifyContent: "center", ...K.muted, fontSize: "0.8em" }}>{str(p.alt, "Image")}</div>);
    case "icon":
      return wrap(<span aria-label={str(p.name)} style={{ display: "inline-flex", width: 24, height: 24, borderRadius: 6, border: `${theme.components.icon_stroke}px solid var(--t-primary)` }} />);
    case "input": {
      const fieldErr = vErr && p.required ? `${str(p.label)} is required.` : undefined;
      return wrap(<Field label={str(p.label, "Field") + (p.required ? " *" : "")} error={fieldErr} help={str(p.help) || undefined}>
        <input aria-label={str(p.label, "Field")} readOnly={ctx.editing} type={str(p.type, "text") === "password" ? "password" : "text"} placeholder={str(p.placeholder)} style={inputStyle(theme.components.input, !!fieldErr)} disabled={!!p.disabled} />
      </Field>);
    }
    case "select": {
      const opts = str(p.options, "").split(",").map((o) => o.trim()).filter(Boolean);
      return wrap(<Field label={str(p.label, "Select")}><select aria-label={str(p.label, "Select")} style={inputStyle(theme.components.input)} disabled={ctx.editing || !!p.disabled}>{opts.map((o) => <option key={o}>{o}</option>)}</select></Field>);
    }
    case "checkbox":
      return wrap(<label style={{ display: "flex", gap: s(2), alignItems: "center" }}><input type="checkbox" disabled={ctx.editing} style={{ accentColor: "var(--t-primary)" }} /> {str(p.label)}</label>);
    case "button": {
      const inter = node.interaction;
      const visual = inter && inter.action !== "none" && !inter.implemented;
      return wrap(<Btn variant={str(p.variant, "primary")} style={theme.components.button} disabled={!!p.disabled || (loading && inter?.action === "call_api")}
        testId={`btn-${node.id}`} title={!inter || inter.action === "none" ? "No behavior defined" : visual ? "Visual only in the prototype" : undefined}
        onClick={ctx.editing ? undefined : () => ctx.onAction(node)}>{loading && inter?.action === "call_api" ? "Saving…" : str(p.label, "Button")}</Btn>);
    }
    case "table": {
      const cols = str(p.columns, "name").split(",").map((c) => c.trim()).filter(Boolean).slice(0, 8);
      const dense = p.density === "compact" || theme.components.table_density === "compact";
      const rows = dataEmpty ? [] : [0, 1, 2].map((i) => cols.map((c) => (i === 0 ? SAMPLE_ROWS[c] ?? "Sample" : `${SAMPLE_ROWS[c] ?? "Sample"}`)));
      return wrap(<Table columns={cols} rows={rows} dense={dense} loading={loading} empty={msg(ctx.page, "empty", "No rows yet.")} />);
    }
    case "stat":
      return wrap(<div style={{ ...cardStyle(theme.components.card) }}><p style={{ ...K.muted, margin: 0, fontSize: "0.85em" }}>{str(p.label)}</p><p style={{ ...K.h(1), marginTop: s(1) }}>{loading ? "…" : dataEmpty ? "0" : str(p.value, "128")}</p></div>);
    case "chart":
      return wrap(<div style={{ ...cardStyle(theme.components.card) }}><p style={{ ...K.muted, margin: 0, marginBottom: s(2), fontSize: "0.85em" }}>{str(p.label)}</p>{loading ? <p style={K.muted}>Loading…</p> : dataEmpty ? <p style={K.muted}>{msg(ctx.page, "empty", "No data yet.")}</p> : <Bars values={[4, 7, 5, 9, 6, 11, 8, 12, 10, 14]} />}</div>);
    case "alert":
      return wrap(<Alert tone={(["info", "success", "warning", "danger"].includes(str(p.tone)) ? str(p.tone) : "info") as "info"}>{str(p.text)}</Alert>);
    case "empty_state":
      return wrap(<div style={{ textAlign: "center", padding: s(6), border: "var(--t-bw) dashed var(--t-border)", borderRadius: "var(--t-r-lg)" }}><p style={{ ...K.h(3) }}>{str(p.title)}</p><p style={{ ...K.muted, marginTop: s(1) }}>{str(p.text)}</p></div>);
  }
}

export function PageCanvas({ page, theme, mode, width, state, editing, selected, onSelect, onDrop, onAction }: {
  page: Page; theme: Theme; mode: "light" | "dark"; width: number; state: PageStateKind | null; editing: boolean; selected: string | null;
  onSelect: (id: string) => void; onDrop: Ctx["onDrop"]; onAction: (n: LayoutNode) => void;
}) {
  const bp: Breakpoint = width < theme.layout.breakpoints.sm ? "sm" : width < theme.layout.breakpoints.md ? "md" : "base";
  const ctx: Ctx = { theme, bp, state, page, editing, selected, onSelect, onDrop, onAction };
  void mode;
  return (
    <div data-testid="page-canvas" data-breakpoint={bp} style={{ ...K.root, width, minHeight: 480, padding: s(5), boxSizing: "border-box" }}>
      {state === "permission_denied" ? (
        <div style={{ textAlign: "center", padding: s(10) }}><p style={K.h(2)}>Access denied</p><p style={K.muted}>{msg(page, "permission_denied", "You do not have permission to view this page.")}</p></div>
      ) : (
        <>
          {state === "error" && <div style={{ marginBottom: s(3) }}><Alert tone="danger">{msg(page, "error", "Something went wrong.")}</Alert></div>}
          {state === "success" && <div style={{ marginBottom: s(3) }}><Alert tone="success">{msg(page, "success", "Saved.")}</Alert></div>}
          <Render node={page.layout} ctx={ctx} />
        </>
      )}
    </div>
  );
}

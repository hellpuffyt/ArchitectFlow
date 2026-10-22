"use client";
// Interactive preview built from the actual tokens (via CSS variables): navigation, buttons,
// inputs, cards, table, dialog, dropdown, chart, empty/error states, notification, mobile nav.
import { useState } from "react";
import type { Theme } from "@/lib/design-types";
import { themeVars } from "@/lib/theme-css";
import { Alert, Bars, Btn, Field, K, Table, cardStyle, inputStyle, s } from "./kit";

export function ThemePreview({ theme, mode, width }: { theme: Theme; mode: "light" | "dark"; width: number }) {
  const [dialog, setDialog] = useState(false);
  const [toast, setToast] = useState(false);
  const [tab, setTab] = useState("Overview");
  const mobile = width < theme.layout.breakpoints.sm;
  const side = theme.components.navigation === "sidebar" && !mobile;
  const navItems = ["Dashboard", "Inventory", "Billing", "Branches"];
  return (
    <div data-testid="theme-preview" data-mode={mode} style={{ ...themeVars(theme, mode), ...K.root, width, minHeight: 620, display: "flex", flexDirection: side ? "row" : "column", borderRadius: 10, overflow: "hidden", position: "relative" }}>
      <nav aria-label="Preview navigation" style={{ background: "var(--t-surface)", borderRight: side ? "var(--t-bw) solid var(--t-border)" : undefined, borderBottom: side ? undefined : "var(--t-bw) solid var(--t-border)",
        display: "flex", flexDirection: side ? "column" : "row", gap: s(1), padding: s(3), width: side ? 190 : undefined, overflowX: "auto" }}>
        <span style={{ ...K.h(3), marginBottom: side ? s(3) : 0, marginRight: side ? 0 : s(3), whiteSpace: "nowrap" }}>Acme</span>
        {(mobile ? navItems.slice(0, 3) : navItems).map((n, i) => (
          <span key={n} style={{ padding: `${s(1.5)} ${s(2.5)}`, borderRadius: "var(--t-r-sm)", fontSize: "0.9em", whiteSpace: "nowrap",
            background: i === 0 ? "color-mix(in srgb, var(--t-primary) 14%, transparent)" : undefined, color: i === 0 ? "var(--t-primary)" : "var(--t-muted-text)", fontWeight: i === 0 ? 600 : 400 }}>{n}</span>
        ))}
        {mobile && <span aria-label="Open menu" style={{ marginLeft: "auto", padding: s(1) }}>☰</span>}
      </nav>
      <main style={{ flex: 1, padding: s(5), display: "flex", flexDirection: "column", gap: s(4), minWidth: 0 }}>
        <div style={{ display: "flex", flexDirection: mobile ? "column" : "row", justifyContent: "space-between", gap: s(3), alignItems: mobile ? "stretch" : "center" }}>
          <div><h1 style={K.h(1)} data-testid="preview-heading">Dashboard</h1><p style={{ ...K.muted, margin: 0 }}>Muted secondary text for descriptions.</p></div>
          <div style={{ display: "flex", gap: s(2) }}>
            <Btn variant="secondary" style={theme.components.button} onClick={() => setToast(true)}>Notify</Btn>
            <Btn variant="primary" style={theme.components.button} onClick={() => setDialog(true)} testId="preview-primary">Open dialog</Btn>
          </div>
        </div>
        <div role="tablist" style={{ display: "flex", gap: s(4), borderBottom: "var(--t-bw) solid var(--t-border)" }}>
          {["Overview", "Activity", "Settings"].map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => setTab(t)} style={{ background: "none", border: 0, font: "inherit", cursor: "pointer", padding: `${s(1.5)} 0`,
              color: tab === t ? "var(--t-text)" : "var(--t-muted-text)", borderBottom: tab === t ? "2px solid var(--t-primary)" : "2px solid transparent", fontWeight: 600 }}>{t}</button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(3, minmax(0,1fr))", gap: "var(--t-gutter)" }}>
          {[["Stock value", "184,220"], ["Open invoices", "37"], ["Branches", "6"]].map(([l, v]) => (
            <div key={l} style={cardStyle(theme.components.card)}><p style={{ ...K.muted, margin: 0, fontSize: "0.85em" }}>{l}</p><p style={{ ...K.h(1), marginTop: s(1) }}>{v}</p></div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "3fr 2fr", gap: "var(--t-gutter)" }}>
          <div style={cardStyle(theme.components.card)}><p style={{ ...K.muted, marginTop: 0, fontSize: "0.85em" }}>Sales (30 days)</p><Bars values={[5, 8, 6, 10, 7, 12, 9, 13, 11, 15, 12, 16]} /></div>
          <div style={{ ...cardStyle(theme.components.card), display: "flex", flexDirection: "column", gap: s(3) }}>
            <Field label="Search"><input aria-label="Search" placeholder="SKU or name" style={inputStyle(theme.components.input)} /></Field>
            <Field label="Branch"><select aria-label="Branch" style={inputStyle(theme.components.input)}><option>All branches</option><option>Downtown</option></select></Field>
            <Field label="Email" error="Enter a valid email address."><input aria-label="Email" defaultValue="not-an-email" style={inputStyle(theme.components.input, true)} /></Field>
            <Btn variant="primary" style={theme.components.button} disabled>Disabled</Btn>
          </div>
        </div>
        <Table columns={["SKU", "Item", "Qty", "Price"]} dense={theme.components.table_density === "compact"}
          rows={[["RNG-0182", "Gold ring 18k", "14", "1,240.00"], ["NCK-0311", "Silver necklace", "6", "380.00"], ["EAR-0907", "Pearl earrings", "22", "210.00"]]} />
        <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: "var(--t-gutter)" }}>
          <div style={{ textAlign: "center", padding: s(5), border: "var(--t-bw) dashed var(--t-border)", borderRadius: "var(--t-r-lg)" }}><p style={K.h(3)}>No transfers yet</p><p style={K.muted}>Transfers between branches will appear here.</p></div>
          <div style={{ display: "flex", flexDirection: "column", gap: s(2) }}>
            <Alert tone="danger">Could not sync 3 offline changes. Retry.</Alert>
            <Alert tone="warning">Stock for 4 items is low.</Alert>
            <Alert tone="success">Invoice INV-2041 paid.</Alert>
          </div>
        </div>
      </main>
      {dialog && (
        <div style={{ position: "absolute", inset: 0, background: "rgb(0 0 0 / .45)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setDialog(false)}>
          <div role="dialog" aria-label="Preview dialog" onClick={(e) => e.stopPropagation()} style={{ ...cardStyle("elevated"), boxShadow: "var(--t-shadow)", width: 340, background: "var(--t-background)" }}>
            <h3 style={K.h(3)}>Delete item?</h3><p style={K.muted}>This cannot be undone.</p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: s(2), marginTop: s(3) }}>
              <Btn variant="secondary" style="outline" onClick={() => setDialog(false)}>Cancel</Btn>
              <Btn variant="danger" style={theme.components.button} onClick={() => setDialog(false)}>Delete</Btn>
            </div>
          </div>
        </div>
      )}
      {toast && <div role="status" style={{ position: "absolute", right: 16, bottom: 16, ...cardStyle("elevated"), boxShadow: "var(--t-shadow)", background: "var(--t-background)" }} onClick={() => setToast(false)}>Notification: export finished.</div>}
    </div>
  );
}

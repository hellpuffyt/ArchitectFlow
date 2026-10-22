"use client";
// Token-driven UI kit. Every style reads CSS variables set by lib/theme-css.ts, so the preview is
// produced by the actual saved tokens (no screenshots, no hard-coded colors).
import type { CSSProperties, ReactNode } from "react";

const fs = (step: number) => `calc(var(--t-size) * pow(var(--t-scale), ${step}))`;
export const s = (n: number) => `calc(var(--t-space) * ${n})`;

export const K = {
  root: { background: "var(--t-background)", color: "var(--t-text)", fontFamily: "var(--t-font-body)", fontSize: "var(--t-size)",
    lineHeight: "var(--t-lh)", fontWeight: "var(--t-w-body)" as unknown as number } satisfies CSSProperties,
  h: (level: number): CSSProperties => ({ fontFamily: "var(--t-font-heading)", fontWeight: "var(--t-w-heading)" as unknown as number,
    fontSize: fs(Math.max(0, 4 - level)), margin: 0, lineHeight: 1.2, color: "var(--t-text)" }),
  muted: { color: "var(--t-muted-text)" } satisfies CSSProperties,
  surface: { background: "var(--t-surface)", border: "var(--t-bw) solid var(--t-border)", borderRadius: "var(--t-r-lg)" } satisfies CSSProperties,
};

export function Btn({ variant = "primary", style = "solid", children, onClick, disabled, title, testId }: {
  variant?: string; style?: "solid" | "outline" | "soft"; children: ReactNode; onClick?: () => void; disabled?: boolean; title?: string; testId?: string;
}) {
  const color = variant === "danger" ? "var(--t-danger)" : variant === "secondary" || variant === "ghost" ? "var(--t-secondary)" : "var(--t-primary)";
  const solid = style === "solid" && variant !== "ghost";
  const css: CSSProperties = {
    background: solid ? color : style === "soft" ? `color-mix(in srgb, ${color} 14%, transparent)` : "transparent",
    color: solid ? (variant === "primary" ? "var(--t-on-primary)" : "#fff") : color,
    border: `var(--t-bw) solid ${style === "outline" || variant === "ghost" ? (variant === "ghost" ? "transparent" : color) : "transparent"}`,
    borderRadius: "var(--t-r-btn)", padding: `${s(2)} ${s(4)}`, fontWeight: 600, fontSize: "0.92em", cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1, transition: "filter var(--t-dur), transform var(--t-dur)", fontFamily: "inherit",
  };
  return <button type="button" style={css} onClick={onClick} disabled={disabled} title={title} data-testid={testId} className="af-btn">{children}</button>;
}

export function Field({ label, children, error, help }: { label: string; children: ReactNode; error?: string; help?: string }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: s(1), fontSize: "0.9em" }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      {children}
      {error ? <span style={{ color: "var(--t-danger)", fontSize: "0.85em" }}>{error}</span> : help ? <span style={{ ...K.muted, fontSize: "0.85em" }}>{help}</span> : null}
    </label>
  );
}

export function inputStyle(kind: "outline" | "filled" | "underline", error = false): CSSProperties {
  const border = error ? "var(--t-danger)" : "var(--t-border)";
  const base: CSSProperties = { font: "inherit", color: "var(--t-text)", padding: `${s(2)} ${s(3)}`, outlineColor: "var(--t-primary)", width: "100%" };
  if (kind === "underline") return { ...base, background: "transparent", border: "none", borderBottom: `var(--t-bw) solid ${border}`, borderRadius: 0 };
  if (kind === "filled") return { ...base, background: "var(--t-surface)", border: `var(--t-bw) solid transparent`, borderBottomColor: border, borderRadius: "var(--t-r-sm)" };
  return { ...base, background: "var(--t-background)", border: `var(--t-bw) solid ${border}`, borderRadius: "var(--t-r-sm)" };
}

export function cardStyle(kind: "elevated" | "outlined" | "flat"): CSSProperties {
  return {
    background: "var(--t-surface)", borderRadius: "var(--t-r-lg)", padding: s(4),
    border: kind === "outlined" ? "var(--t-bw) solid var(--t-border)" : "var(--t-bw) solid transparent",
    boxShadow: kind === "elevated" ? "var(--t-shadow)" : "none",
  };
}

export function Alert({ tone, children }: { tone: "info" | "success" | "warning" | "danger"; children: ReactNode }) {
  const c = `var(--t-${tone})`;
  return <div role="alert" style={{ borderLeft: `3px solid ${c}`, background: `color-mix(in srgb, ${c} 10%, var(--t-background))`, color: "var(--t-text)",
    padding: `${s(2)} ${s(3)}`, borderRadius: "var(--t-r-sm)", fontSize: "0.92em" }}>{children}</div>;
}

export function Table({ columns, rows, dense, loading, empty }: { columns: string[]; rows: string[][]; dense: boolean; loading?: boolean; empty?: string }) {
  const pad = dense ? `${s(1)} ${s(2)}` : `${s(2)} ${s(3)}`;
  return (
    <div style={{ border: "var(--t-bw) solid var(--t-border)", borderRadius: "var(--t-r-md)", overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9em" }}>
        <thead><tr>{columns.map((c) => <th key={c} style={{ textAlign: "left", padding: pad, background: "var(--t-surface)", color: "var(--t-muted-text)", fontWeight: 600, borderBottom: "var(--t-bw) solid var(--t-border)" }}>{c}</th>)}</tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={columns.length} style={{ padding: pad, ...K.muted }}>Loading…</td></tr>
            : rows.length === 0 ? <tr><td colSpan={columns.length} style={{ padding: s(4), textAlign: "center", ...K.muted }}>{empty ?? "No rows"}</td></tr>
              : rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} style={{ padding: pad, borderTop: i ? "var(--t-bw) solid var(--t-border)" : undefined }}>{v}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

export function Bars({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: s(1), height: 90 }} aria-label="Bar chart">
      {values.map((v, i) => <div key={i} style={{ flex: 1, height: `${(v / max) * 100}%`, background: i % 3 === 0 ? "var(--t-accent)" : "var(--t-primary)", borderRadius: "var(--t-r-sm) var(--t-r-sm) 0 0", opacity: 0.85 }} />)}
    </div>
  );
}

export const SAMPLE_ROWS: Record<string, string> = {
  name: "Gold ring 18k", status: "Active", updated: "2 h ago", sku: "RNG-0182", quantity: "14", unit_price: "1,240.00",
  number: "INV-2041", total: "3,880.00", issued_at: "Oct 21", address: "12 Market St", description: "—", created_at: "Oct 20",
};

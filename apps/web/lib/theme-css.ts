// Map design tokens to CSS custom properties for the live preview. The preview components
// read ONLY these variables, so every token change is visible immediately.
import type { CSSProperties } from "react";
import type { Palette, Theme } from "./design-types";

const SHADOW = { none: "none", subtle: "0 1px 2px rgb(0 0 0 / .08)", medium: "0 4px 14px rgb(0 0 0 / .14)", strong: "0 10px 30px rgb(0 0 0 / .25)" };
const DENSITY = { compact: 0.85, comfortable: 1, spacious: 1.25 };

export function themeVars(theme: Theme, mode: "light" | "dark"): CSSProperties {
  const p: Palette = mode === "dark" ? theme.dark : theme.light;
  const unit = theme.spacing.unit * DENSITY[theme.spacing.density];
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(p)) vars[`--t-${k.replace("_", "-")}`] = v;
  const btnRadius = { sm: theme.radii.sm, md: theme.radii.md, lg: theme.radii.lg, full: 999 }[theme.components.button_radius];
  Object.assign(vars, {
    "--t-font-heading": theme.typography.heading_font,
    "--t-font-body": theme.typography.body_font,
    "--t-font-mono": theme.typography.mono_font,
    "--t-size": `${theme.typography.base_size}px`,
    "--t-scale": String(theme.typography.scale_ratio),
    "--t-lh": String(theme.typography.line_height),
    "--t-w-heading": String(theme.typography.heading_weight),
    "--t-w-body": String(theme.typography.body_weight),
    "--t-space": `${unit}px`,
    "--t-r-sm": `${theme.radii.sm}px`,
    "--t-r-md": `${theme.radii.md}px`,
    "--t-r-lg": `${theme.radii.lg}px`,
    "--t-r-btn": `${btnRadius}px`,
    "--t-shadow": SHADOW[theme.elevation.shadow],
    "--t-bw": `${theme.elevation.border_width}px`,
    "--t-max": `${theme.layout.max_width}px`,
    "--t-gutter": `${theme.layout.gutter}px`,
    "--t-dur": `${theme.motion.intensity === "none" ? 0 : theme.motion.duration_ms}ms`,
  });
  return vars as CSSProperties;
}

export function previewMode(theme: Theme, systemDark: boolean): "light" | "dark" {
  return theme.appearance === "system" ? (systemDark ? "dark" : "light") : theme.appearance;
}

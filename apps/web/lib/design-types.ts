// Mirror of apps/api/architectflow/schema/design.py (checked by lib/types.test.ts).
import type { PropValue } from "./types";

export interface Palette {
  primary: string; on_primary: string; secondary: string; accent: string; background: string;
  surface: string; text: string; muted_text: string; border: string; success: string;
  warning: string; danger: string; info: string;
}
export const PALETTE_KEYS: (keyof Palette)[] = [
  "primary", "on_primary", "secondary", "accent", "background", "surface", "text", "muted_text",
  "border", "success", "warning", "danger", "info",
];
export interface Typography {
  heading_font: string; body_font: string; mono_font: string; base_size: number;
  scale_ratio: number; heading_weight: number; body_weight: number; line_height: number;
}
export interface Theme {
  id: string;
  name: string;
  preset: string;
  appearance: "light" | "dark" | "system";
  light: Palette;
  dark: Palette;
  typography: Typography;
  spacing: { unit: number; density: "compact" | "comfortable" | "spacious" };
  radii: { sm: number; md: number; lg: number };
  elevation: { shadow: "none" | "subtle" | "medium" | "strong"; border_width: number };
  components: {
    button: "solid" | "outline" | "soft";
    button_radius: "sm" | "md" | "lg" | "full";
    input: "outline" | "filled" | "underline";
    card: "elevated" | "outlined" | "flat";
    navigation: "sidebar" | "topbar";
    icon_stroke: number;
    table_density: "compact" | "comfortable";
  };
  layout: { max_width: number; grid_columns: number; gutter: number; breakpoints: { sm: number; md: number } };
  motion: { intensity: "none" | "subtle" | "standard" | "expressive"; duration_ms: number; respect_reduced_motion: boolean };
}

export type LayoutKind =
  | "container" | "stack" | "grid" | "nav" | "tabs" | "form" | "card" | "modal" | "list"
  | "heading" | "text" | "button" | "input" | "select" | "checkbox" | "table" | "image" | "icon"
  | "chart" | "stat" | "alert" | "badge" | "divider" | "empty_state";
export interface ResponsiveRule { hidden?: boolean | null; columns?: number | null; direction?: "row" | "column" | null }
export interface Interaction {
  trigger: "click" | "submit";
  action: "navigate" | "call_api" | "open_modal" | "close_modal" | "none";
  target_page_id: string | null;
  endpoint_id: string | null;
  implemented: boolean;
}
export interface LayoutNode {
  id: string;
  kind: LayoutKind;
  props: Record<string, PropValue>;
  children: LayoutNode[];
  responsive: { sm: ResponsiveRule | null; md: ResponsiveRule | null };
  endpoint_id: string | null;
  entity_id: string | null;
  binding: { entity_id: string | null; entity_field: string | null } | null;
  interaction: Interaction | null;
}
export type PageStateKind = "loading" | "empty" | "success" | "error" | "validation_error" | "permission_denied";
export const PAGE_STATE_KINDS: PageStateKind[] = ["loading", "empty", "success", "error", "validation_error", "permission_denied"];
export interface Page {
  id: string;
  name: string;
  route: string;
  parent_id: string | null;
  description: string;
  requires_auth: boolean;
  roles: string[];
  states: { kind: PageStateKind; message: string }[];
  layout: LayoutNode;
}
export interface UiJourney { id: string; name: string; role_id: string | null; steps: { page_id: string; action: string }[] }
export interface DesignDocument { themes: Theme[]; active_theme_id: string | null; pages: Page[]; journeys: UiJourney[] }

type Keys<T> = Record<keyof T, true>;
export const DESIGN_SCHEMA_KEYS = {
  Theme: { id: true, name: true, preset: true, appearance: true, light: true, dark: true, typography: true, spacing: true,
    radii: true, elevation: true, components: true, layout: true, motion: true } satisfies Keys<Theme>,
  Palette: Object.fromEntries(PALETTE_KEYS.map((k) => [k, true])) as Keys<Palette>,
  LayoutNode: { id: true, kind: true, props: true, children: true, responsive: true, endpoint_id: true, entity_id: true,
    binding: true, interaction: true } satisfies Keys<LayoutNode>,
  Page: { id: true, name: true, route: true, parent_id: true, description: true, requires_auth: true, roles: true,
    states: true, layout: true } satisfies Keys<Page>,
  Interaction: { trigger: true, action: true, target_page_id: true, endpoint_id: true, implemented: true } satisfies Keys<Interaction>,
  DesignDocument: { themes: true, active_theme_id: true, pages: true, journeys: true } satisfies Keys<DesignDocument>,
} as const;

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemePreview } from "./ThemePreview";
import { PageCanvas } from "./PageRenderer";
import type { Page, Theme } from "@/lib/design-types";
import { newNode } from "@/lib/layout";

const palette = { primary: "#3f5bf0", on_primary: "#ffffff", secondary: "#64748b", accent: "#14b8a6", background: "#ffffff", surface: "#f6f7f9",
  text: "#111827", muted_text: "#4b5563", border: "#d9dde5", success: "#15803d", warning: "#b45309", danger: "#b91c1c", info: "#1d4ed8" };
const theme: Theme = {
  id: "t", name: "T", preset: "", appearance: "light", light: palette, dark: { ...palette, background: "#0d1117", text: "#e6edf3" },
  typography: { heading_font: "Inter", body_font: "Inter", mono_font: "monospace", base_size: 15, scale_ratio: 1.25, heading_weight: 650, body_weight: 400, line_height: 1.5 },
  spacing: { unit: 4, density: "comfortable" }, radii: { sm: 4, md: 8, lg: 14 }, elevation: { shadow: "subtle", border_width: 1 },
  components: { button: "solid", button_radius: "md", input: "outline", card: "outlined", navigation: "sidebar", icon_stroke: 1.75, table_density: "comfortable" },
  layout: { max_width: 1200, grid_columns: 12, gutter: 16, breakpoints: { sm: 640, md: 1024 } },
  motion: { intensity: "subtle", duration_ms: 160, respect_reduced_motion: true },
};

describe("ThemePreview", () => {
  it("is driven by the token values (CSS variables)", () => {
    const { rerender } = render(<ThemePreview theme={theme} mode="light" width={1180} />);
    const root = screen.getByTestId("theme-preview");
    expect(root.style.getPropertyValue("--t-primary")).toBe("#3f5bf0");
    expect(root.style.getPropertyValue("--t-r-btn")).toBe("8px");
    rerender(<ThemePreview theme={{ ...theme, light: { ...palette, primary: "#047857" }, components: { ...theme.components, button_radius: "full" } }} mode="light" width={1180} />);
    expect(screen.getByTestId("theme-preview").style.getPropertyValue("--t-primary")).toBe("#047857");
    expect(screen.getByTestId("theme-preview").style.getPropertyValue("--t-r-btn")).toBe("999px");
  });
  it("switches palettes by mode", () => {
    render(<ThemePreview theme={theme} mode="dark" width={1180} />);
    expect(screen.getByTestId("theme-preview").style.getPropertyValue("--t-background")).toBe("#0d1117");
  });
  it("collapses navigation on mobile widths", () => {
    render(<ThemePreview theme={theme} mode="light" width={390} />);
    expect(screen.getByLabelText("Open menu")).toBeInTheDocument();
  });
});

describe("PageCanvas", () => {
  const grid = { ...newNode("grid", "g"), props: { columns: 3 }, responsive: { sm: { columns: 1 }, md: { columns: 2 } },
    children: [newNode("card", "c1"), newNode("card", "c2"), newNode("card", "c3")] };
  const side = { ...newNode("text", "side"), responsive: { sm: { hidden: true }, md: null } };
  const page: Page = { id: "p", name: "P", route: "/", parent_id: null, description: "", requires_auth: false, roles: [],
    states: [{ kind: "empty", message: "Nothing yet" }], layout: { ...newNode("container", "root"), children: [grid, side, { ...newNode("table", "tbl"), props: { columns: "name" } }] } };
  const noop = () => {};
  const renderAt = (width: number, state: "empty" | null = null) =>
    render(<PageCanvas page={page} theme={theme} mode="light" width={width} state={state} editing={false} selected={null} onSelect={noop} onDrop={noop} onAction={noop} />);

  it("applies breakpoint rules from the theme's breakpoints", () => {
    const { unmount } = renderAt(1280);
    expect(screen.getByTestId("el-g").firstElementChild).toHaveAttribute("data-columns", "3");
    expect(screen.getByTestId("el-side")).toBeInTheDocument();
    unmount();
    const t2 = renderAt(768);
    expect(screen.getByTestId("el-g").firstElementChild).toHaveAttribute("data-columns", "2");
    t2.unmount();
    renderAt(390);
    expect(screen.getByTestId("page-canvas")).toHaveAttribute("data-breakpoint", "sm");
    expect(screen.getByTestId("el-g").firstElementChild).toHaveAttribute("data-columns", "1");
    expect(screen.queryByTestId("el-side")).toBeNull();
  });
  it("renders page states from the saved messages", () => {
    renderAt(1280, "empty");
    expect(screen.getByText("Nothing yet")).toBeInTheDocument();
  });
});

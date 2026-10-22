// Pure operations on page layout trees (typed data — never generated JSX).
import type { LayoutKind, LayoutNode, Page, ResponsiveRule } from "./design-types";

export const CONTAINERS: ReadonlySet<LayoutKind> = new Set(["container", "stack", "grid", "nav", "tabs", "form", "card", "modal", "list"]);

export interface ComponentSpec { kind: LayoutKind; label: string; group: "Layout" | "Content" | "Forms" | "Data" | "Feedback"; defaults: Record<string, string | number | boolean> }

// Component library. To add a primitive: add it to LayoutKind in schema/design.py and here,
// then render it in components/design/PageRenderer.tsx (see docs/DESIGN_STUDIO.md).
export const COMPONENTS: ComponentSpec[] = [
  { kind: "container", label: "Container", group: "Layout", defaults: {} },
  { kind: "stack", label: "Stack", group: "Layout", defaults: { direction: "column", gap: 3 } },
  { kind: "grid", label: "Grid", group: "Layout", defaults: { columns: 3, gap: 3 } },
  { kind: "card", label: "Card", group: "Layout", defaults: { title: "Card title" } },
  { kind: "nav", label: "Navigation", group: "Layout", defaults: { label: "Main navigation" } },
  { kind: "tabs", label: "Tabs", group: "Layout", defaults: { tabs: "Overview, Details, History" } },
  { kind: "modal", label: "Modal", group: "Layout", defaults: { title: "Dialog title" } },
  { kind: "heading", label: "Heading", group: "Content", defaults: { text: "Heading", level: 2 } },
  { kind: "text", label: "Text", group: "Content", defaults: { text: "Body text" } },
  { kind: "image", label: "Image", group: "Content", defaults: { alt: "Image description" } },
  { kind: "icon", label: "Icon", group: "Content", defaults: { name: "star" } },
  { kind: "badge", label: "Badge", group: "Content", defaults: { text: "New" } },
  { kind: "divider", label: "Divider", group: "Content", defaults: {} },
  { kind: "form", label: "Form", group: "Forms", defaults: { label: "Form" } },
  { kind: "input", label: "Input", group: "Forms", defaults: { label: "Label", name: "field", placeholder: "" } },
  { kind: "select", label: "Select", group: "Forms", defaults: { label: "Choose", name: "choice", options: "One, Two, Three" } },
  { kind: "checkbox", label: "Checkbox", group: "Forms", defaults: { label: "I agree", name: "agree" } },
  { kind: "button", label: "Button", group: "Forms", defaults: { label: "Button", variant: "primary" } },
  { kind: "table", label: "Table", group: "Data", defaults: { columns: "name, status, updated" } },
  { kind: "list", label: "List", group: "Data", defaults: { label: "Items" } },
  { kind: "stat", label: "Stat", group: "Data", defaults: { label: "Metric", value: "128" } },
  { kind: "chart", label: "Chart", group: "Data", defaults: { label: "Chart" } },
  { kind: "alert", label: "Alert", group: "Feedback", defaults: { text: "Something to know", tone: "info" } },
  { kind: "empty_state", label: "Empty state", group: "Feedback", defaults: { title: "Nothing here yet", text: "Create your first item." } },
];

export function newNode(kind: LayoutKind, id: string): LayoutNode {
  const spec = COMPONENTS.find((c) => c.kind === kind);
  return { id, kind, props: { ...(spec?.defaults ?? {}) }, children: [], responsive: { sm: null, md: null },
    endpoint_id: null, entity_id: null, binding: null, interaction: null };
}

export function allIds(pages: Page[]): Set<string> {
  const ids = new Set<string>();
  const walk = (n: LayoutNode) => { ids.add(n.id); n.children.forEach(walk); };
  pages.forEach((p) => { ids.add(p.id); walk(p.layout); });
  return ids;
}

export function findNode(root: LayoutNode, id: string): LayoutNode | null {
  if (root.id === id) return root;
  for (const c of root.children) {
    const hit = findNode(c, id);
    if (hit) return hit;
  }
  return null;
}

export function findParent(root: LayoutNode, id: string): LayoutNode | null {
  for (const c of root.children) {
    if (c.id === id) return root;
    const hit = findParent(c, id);
    if (hit) return hit;
  }
  return null;
}

function map(root: LayoutNode, fn: (n: LayoutNode) => LayoutNode): LayoutNode {
  const next = fn(root);
  return { ...next, children: next.children.map((c) => map(c, fn)) };
}

export function updateNode(root: LayoutNode, id: string, patch: Partial<LayoutNode>): LayoutNode {
  return map(root, (n) => (n.id === id ? { ...n, ...patch } : n));
}

export function removeNode(root: LayoutNode, id: string): LayoutNode {
  if (root.id === id) return root; // the page root cannot be removed
  return map(root, (n) => ({ ...n, children: n.children.filter((c) => c.id !== id) }));
}

function contains(root: LayoutNode, id: string): boolean {
  return findNode(root, id) !== null;
}

/** Insert ``node`` into container ``parentId`` at ``index`` (clamped). */
export function insertNode(root: LayoutNode, parentId: string, index: number, node: LayoutNode): LayoutNode {
  return map(root, (n) => {
    if (n.id !== parentId || !CONTAINERS.has(n.kind)) return n;
    const kids = [...n.children];
    kids.splice(Math.max(0, Math.min(index, kids.length)), 0, node);
    return { ...n, children: kids };
  });
}

/** Move an existing node into ``parentId`` at ``index``. Refuses moves into its own subtree. */
export function moveNode(root: LayoutNode, id: string, parentId: string, index: number): LayoutNode {
  const node = findNode(root, id);
  const target = findNode(root, parentId);
  if (!node || !target || root.id === id || contains(node, parentId) || !CONTAINERS.has(target.kind)) return root;
  const oldParent = findParent(root, id);
  let idx = index;
  if (oldParent?.id === parentId) {
    const from = oldParent.children.findIndex((c) => c.id === id);
    if (from < index) idx -= 1;
  }
  return insertNode(removeNode(root, id), parentId, idx, node);
}

export function moveSibling(root: LayoutNode, id: string, delta: -1 | 1): LayoutNode {
  const parent = findParent(root, id);
  if (!parent) return root;
  const from = parent.children.findIndex((c) => c.id === id);
  const to = from + delta;
  if (to < 0 || to >= parent.children.length) return root;
  return moveNode(root, id, parent.id, delta > 0 ? to + 1 : to);
}

/** Deep-copy a subtree with fresh ids. */
export function cloneWithIds(node: LayoutNode, taken: Set<string>): LayoutNode {
  let n = 2;
  let id = `${node.id}-copy`;
  while (taken.has(id)) id = `${node.id}-copy-${n++}`;
  taken.add(id);
  return { ...structuredClone(node), id, children: node.children.map((c) => cloneWithIds(c, taken)) };
}

export type Breakpoint = "base" | "md" | "sm";

/** Which breakpoint's rules apply at ``width`` (mirrors the theme's breakpoint tokens). */
export function breakpointFor(width: number, bp: { sm: number; md: number }): Breakpoint {
  if (width < bp.sm) return "sm";
  if (width < bp.md) return "md";
  return "base";
}

/** Effective responsive values: sm inherits md (smaller screens get both rules). */
export function effectiveRule(node: LayoutNode, bp: Breakpoint): ResponsiveRule {
  const md = node.responsive.md ?? {};
  const sm = node.responsive.sm ?? {};
  if (bp === "base") return {};
  if (bp === "md") return { ...md };
  const out: ResponsiveRule = { ...md };
  for (const [k, v] of Object.entries(sm)) if (v !== null && v !== undefined) (out as Record<string, unknown>)[k] = v;
  return out;
}

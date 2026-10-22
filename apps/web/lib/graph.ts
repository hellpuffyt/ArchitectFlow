// Pure document operations used by the editor. Each returns a new document.
import type { ArchEdge, ArchNode, ArchitectureDocument, Group } from "./types";
import { nodeTypeInfo } from "./registry";

export function uniqueId(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "item";
  let candidate = /^[a-z0-9]/.test(slug) ? slug : `n-${slug}`;
  let n = 2;
  while (used.has(candidate)) candidate = `${slug}-${n++}`;
  return candidate;
}

function allIds(doc: ArchitectureDocument): string[] {
  return [...doc.nodes.map((n) => n.id), ...doc.edges.map((e) => e.id), ...doc.groups.map((g) => g.id)];
}

export function addNode(doc: ArchitectureDocument, type: string, position: { x: number; y: number }): [ArchitectureDocument, string] {
  const info = nodeTypeInfo(type);
  const id = uniqueId(info.label, allIds(doc));
  const node: ArchNode = {
    id, type, label: info.label, description: "", technology: "", position: { x: Math.round(position.x), y: Math.round(position.y) },
    size: null, group_id: null, public: null, owner: "", replicas: 1, properties: {},
  };
  return [{ ...doc, nodes: [...doc.nodes, node] }, id];
}

export function updateNode(doc: ArchitectureDocument, id: string, patch: Partial<ArchNode>): ArchitectureDocument {
  return { ...doc, nodes: doc.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) };
}

export function moveNodes(doc: ArchitectureDocument, moves: Record<string, { x: number; y: number }>): ArchitectureDocument {
  return {
    ...doc,
    nodes: doc.nodes.map((n) => (moves[n.id] ? { ...n, position: { x: Math.round(moves[n.id].x * 100) / 100, y: Math.round(moves[n.id].y * 100) / 100 } } : n)),
  };
}

export function duplicateNodes(doc: ArchitectureDocument, ids: string[]): [ArchitectureDocument, string[]] {
  const taken = allIds(doc);
  const copies: ArchNode[] = [];
  for (const n of doc.nodes.filter((x) => ids.includes(x.id))) {
    const id = uniqueId(`${n.id}-copy`, [...taken, ...copies.map((c) => c.id)]);
    copies.push({ ...structuredClone(n), id, label: `${n.label} (copy)`.slice(0, 200), group_id: null,
      position: { x: n.position.x + 40, y: n.position.y + 40 } });
  }
  return [{ ...doc, nodes: [...doc.nodes, ...copies] }, copies.map((c) => c.id)];
}

/** What deleting these nodes would affect, for the confirmation dialog. */
export function deletionImpact(doc: ArchitectureDocument, ids: string[]) {
  const set = new Set(ids);
  return {
    nodes: doc.nodes.filter((n) => set.has(n.id)).map((n) => n.label),
    edges: doc.edges.filter((e) => set.has(e.source) || set.has(e.target)).length,
    entities: doc.database.entities.filter((e) => e.node_id && set.has(e.node_id)).map((e) => e.name),
    endpoints: doc.api.endpoints.filter((e) => e.service_node_id && set.has(e.service_node_id)).map((e) => `${e.method} ${e.path}`),
  };
}

/** Delete nodes and their edges; detach (never delete) entities/endpoints that referenced them. */
export function deleteElements(doc: ArchitectureDocument, nodeIds: string[], edgeIds: string[]): ArchitectureDocument {
  const nodes = new Set(nodeIds);
  const edges = new Set(edgeIds);
  return {
    ...doc,
    nodes: doc.nodes.filter((n) => !nodes.has(n.id)),
    edges: doc.edges.filter((e) => !edges.has(e.id) && !nodes.has(e.source) && !nodes.has(e.target)),
    groups: doc.groups.map((g) => ({ ...g, node_ids: g.node_ids.filter((id) => !nodes.has(id)) })),
    workflows: doc.workflows.map((w) => ({ ...w, steps: w.steps.filter((s) => !nodes.has(s)) })),
    database: { entities: doc.database.entities.map((e) => (e.node_id && nodes.has(e.node_id) ? { ...e, node_id: null } : e)) },
    api: { endpoints: doc.api.endpoints.map((e) => (e.service_node_id && nodes.has(e.service_node_id) ? { ...e, service_node_id: null } : e)) },
  };
}

export function addEdge(doc: ArchitectureDocument, source: string, target: string): [ArchitectureDocument, string | null] {
  if (source === target) return [doc, null];
  if (doc.edges.some((e) => e.source === source && e.target === target)) return [doc, null];
  const id = uniqueId(`e-${source}-${target}`, allIds(doc));
  const edge: ArchEdge = { id, source, target, protocol: "HTTPS", label: "", direction: "one_way", synchronous: true, encrypted: true, data: "", properties: {} };
  return [{ ...doc, edges: [...doc.edges, edge] }, id];
}

export function updateEdge(doc: ArchitectureDocument, id: string, patch: Partial<ArchEdge>): ArchitectureDocument {
  return { ...doc, edges: doc.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) };
}

export function groupNodes(doc: ArchitectureDocument, ids: string[], label: string): [ArchitectureDocument, string] {
  const id = uniqueId(`group-${label}`, allIds(doc));
  const members = doc.nodes.filter((n) => ids.includes(n.id)).map((n) => n.id);
  const group: Group = { id, label: label.slice(0, 200) || "Group", kind: "boundary", node_ids: members };
  return [{
    ...doc,
    groups: [...doc.groups.map((g) => ({ ...g, node_ids: g.node_ids.filter((n) => !members.includes(n)) })), group],
    nodes: doc.nodes.map((n) => (members.includes(n.id) ? { ...n, group_id: id } : n)),
  }, id];
}

export function ungroup(doc: ArchitectureDocument, groupId: string): ArchitectureDocument {
  return {
    ...doc,
    groups: doc.groups.filter((g) => g.id !== groupId),
    nodes: doc.nodes.map((n) => (n.group_id === groupId ? { ...n, group_id: null } : n)),
  };
}

/** Bounding box of a group's members (for rendering the group frame). */
export function groupBounds(doc: ArchitectureDocument, group: Group, pad = 28) {
  const members = doc.nodes.filter((n) => group.node_ids.includes(n.id));
  if (members.length === 0) return null;
  const xs = members.map((n) => n.position.x);
  const ys = members.map((n) => n.position.y);
  const x2 = members.map((n) => n.position.x + (n.size?.width ?? 200));
  const y2 = members.map((n) => n.position.y + (n.size?.height ?? 64));
  return { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad - 18, width: Math.max(...x2) - Math.min(...xs) + pad * 2, height: Math.max(...y2) - Math.min(...ys) + pad * 2 + 18 };
}

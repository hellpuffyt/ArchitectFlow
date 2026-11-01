// Diagram generation (spec section 5). Produces Mermaid sources from the modelled
// architecture and the raw facts. Every diagram is derived from discovered
// relationships — nothing is drawn that is not backed by a node/edge/entity the
// modeller emitted. C4 concepts (context / container / component) are used where
// they fit. The ArchitectFlow web app renders these; the CLI also writes the .mmd.

import { scrubSecrets } from "./privacy.ts";
import type { AnalysisFacts, ArchitectureDocument, AfNode } from "../types.ts";

function mid(id: string): string {
  return "n_" + id.replace(/[^A-Za-z0-9_]/g, "_");
}
function q(label: string): string {
  return scrubSecrets(label).replace(/["\n]/g, " ").slice(0, 60);
}

const DATA_TYPES = new Set(["database", "cache", "search_index", "message_broker", "object_storage"]);
const EXT_TYPES = new Set(["external_api", "observability", "secrets_manager", "cloud_resource"]);
const SVC_TYPES = new Set(["service", "worker", "api_gateway", "load_balancer", "auth_service"]);

export function generateDiagrams(doc: ArchitectureDocument, facts: AnalysisFacts): Record<string, string> {
  return {
    context: contextDiagram(doc),
    container: containerDiagram(doc),
    component: componentDiagram(facts),
    "service-dependencies": serviceDependencyDiagram(doc),
    "entity-relationship": erDiagram(doc),
    "data-flow": dataFlowDiagram(doc),
    "auth-sequence": authSequenceDiagram(doc, facts),
    deployment: deploymentDiagram(facts),
  };
}

function contextDiagram(doc: ArchitectureDocument): string {
  const L = ["flowchart LR"];
  for (const a of doc.actors) L.push(`  ${mid(a.id)}(["${q(a.name)}"])`);
  const sysNodes = doc.nodes.filter((n) => !EXT_TYPES.has(n.type));
  L.push(`  subgraph SYSTEM["System"]`);
  for (const n of sysNodes.slice(0, 40)) L.push(`    ${mid(n.id)}["${q(n.label)}"]`);
  L.push(`  end`);
  for (const n of doc.nodes.filter((n) => EXT_TYPES.has(n.type))) L.push(`  ${mid(n.id)}[["${q(n.label)}"]]`);
  const client = doc.nodes.find((n) => n.type === "web_client" || n.type === "mobile_client");
  for (const a of doc.actors) if (client) L.push(`  ${mid(a.id)} --> ${mid(client.id)}`);
  for (const e of doc.edges) {
    const t = doc.nodes.find((n) => n.id === e.target);
    if (t && EXT_TYPES.has(t.type)) L.push(`  ${mid(e.source)} --> ${mid(e.target)}`);
  }
  return L.join("\n");
}

function containerDiagram(doc: ArchitectureDocument): string {
  const L = ["flowchart LR"];
  const groups: [string, (n: AfNode) => boolean][] = [
    ["Clients", (n) => n.type === "web_client" || n.type === "mobile_client"],
    ["Edge", (n) => n.type === "cdn" || n.type === "waf" || n.type === "load_balancer" || n.type === "api_gateway"],
    ["Services", (n) => SVC_TYPES.has(n.type) && n.type !== "api_gateway" && n.type !== "load_balancer"],
    ["Data", (n) => DATA_TYPES.has(n.type)],
    ["External", (n) => EXT_TYPES.has(n.type)],
  ];
  for (const [title, pred] of groups) {
    const ns = doc.nodes.filter(pred);
    if (!ns.length) continue;
    L.push(`  subgraph ${title.replace(/\s/g, "_")}["${title}"]`);
    for (const n of ns) L.push(`    ${mid(n.id)}["${q(n.label)}<br/><small>${q(n.technology ?? n.type)}</small>"]`);
    L.push(`  end`);
  }
  for (const e of doc.edges) L.push(`  ${mid(e.source)} -->|${q(e.label ?? e.protocol ?? "")}| ${mid(e.target)}`);
  return L.join("\n");
}

function componentDiagram(facts: AnalysisFacts): string {
  // Module dependencies between top-level source directories, from real imports.
  const L = ["flowchart TD"];
  const edgeSet = new Set<string>();
  const topDir = (rel: string) => {
    const parts = rel.split("/");
    return parts.length > 1 ? parts.slice(0, 2).join("/") : parts[0] ?? rel;
  };
  const dirs = new Set<string>();
  for (const imp of facts.imports) {
    if (!imp.toRel) continue;
    const a = topDir(imp.fromRel);
    const b = topDir(imp.toRel);
    if (a === b) continue;
    dirs.add(a); dirs.add(b);
    edgeSet.add(`${a}\u0000${b}`);
  }
  for (const d of [...dirs].slice(0, 60)) L.push(`  ${mid(d)}["${q(d)}"]`);
  let count = 0;
  for (const e of edgeSet) {
    if (count++ > 120) break;
    const [a, b] = e.split("\u0000");
    L.push(`  ${mid(a!)} --> ${mid(b!)}`);
  }
  if (dirs.size === 0) L.push("  empty[\"No internal module edges traced\"]");
  return L.join("\n");
}

function serviceDependencyDiagram(doc: ArchitectureDocument): string {
  const L = ["flowchart LR"];
  const svc = new Set(doc.nodes.filter((n) => SVC_TYPES.has(n.type) || DATA_TYPES.has(n.type) || EXT_TYPES.has(n.type)).map((n) => n.id));
  for (const n of doc.nodes) if (svc.has(n.id)) L.push(`  ${mid(n.id)}["${q(n.label)}"]`);
  for (const e of doc.edges) if (svc.has(e.source) && svc.has(e.target)) L.push(`  ${mid(e.source)} -->|${q(e.protocol ?? "")}| ${mid(e.target)}`);
  return L.join("\n");
}

function erDiagram(doc: ArchitectureDocument): string {
  const L = ["erDiagram"];
  for (const ent of doc.database.entities) {
    L.push(`  ${ent.name} {`);
    for (const f of ent.fields.slice(0, 30)) {
      const key = f.primary_key ? "PK" : f.foreign_key ? "FK" : "";
      L.push(`    ${f.type} ${f.name} ${key}`.trimEnd());
    }
    L.push(`  }`);
  }
  for (const ent of doc.database.entities) {
    for (const f of ent.fields) {
      if (f.foreign_key) {
        const target = doc.database.entities.find((e) => e.id === f.foreign_key!.entity_id);
        if (target) L.push(`  ${ent.name} }o--|| ${target.name} : "${f.name}"`);
      }
    }
  }
  if (!doc.database.entities.length) L.push("  NO_ENTITIES { text note }");
  return L.join("\n");
}

function dataFlowDiagram(doc: ArchitectureDocument): string {
  const L = ["flowchart LR"];
  for (const n of doc.nodes) L.push(`  ${mid(n.id)}["${q(n.label)}"]`);
  for (const e of doc.edges) {
    const label = e.data || e.label || e.protocol || "data";
    L.push(`  ${mid(e.source)} -->|${q(label)}| ${mid(e.target)}`);
  }
  return L.join("\n");
}

function authSequenceDiagram(doc: ArchitectureDocument, facts: AnalysisFacts): string {
  if (!facts.auth.length) return "sequenceDiagram\n  note over Client: No authentication implementation detected";
  const mech = facts.auth.map((a) => a.mechanism).join(", ");
  const client = doc.nodes.find((n) => n.type === "web_client" || n.type === "mobile_client")?.label ?? "Client";
  const api = doc.nodes.find((n) => SVC_TYPES.has(n.type))?.label ?? "API";
  const db = doc.nodes.find((n) => n.type === "database")?.label ?? "Database";
  const L = ["sequenceDiagram"];
  L.push(`  participant C as ${q(client)}`);
  L.push(`  participant A as ${q(api)}`);
  L.push(`  participant D as ${q(db)}`);
  L.push(`  note over C,A: Mechanism — ${q(mech)} (inferred from auth code)`);
  L.push("  C->>A: Credentials");
  L.push("  A->>D: Verify user");
  L.push("  D-->>A: User record");
  L.push("  A-->>C: Session / token");
  L.push("  C->>A: Request + credential");
  L.push("  A-->>C: Authorized response");
  return L.join("\n");
}

function deploymentDiagram(facts: AnalysisFacts): string {
  const L = ["flowchart TD"];
  if (!facts.infra.length) { L.push("  unknown[\"Deployment topology not declared in repo\"]"); return L.join("\n"); }
  const byKind = new Map<string, string[]>();
  for (const i of facts.infra) (byKind.get(i.kind) ?? byKind.set(i.kind, []).get(i.kind)!).push(i.name);
  for (const [kind, names] of byKind) {
    L.push(`  subgraph ${mid(kind)}["${q(kind)}"]`);
    for (const n of [...new Set(names)].slice(0, 20)) L.push(`    ${mid(kind + "_" + n)}["${q(n)}"]`);
    L.push(`  end`);
  }
  return L.join("\n");
}

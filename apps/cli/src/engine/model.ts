// Architecture modelling (spec section 3, step 13; section 7 evidence). Turns the
// deterministic facts into an ArchitectureDocument that validates against the
// ArchitectFlow schema, and a parallel evidence ledger. Observed facts and
// inferences are kept distinct via the confidence label on every element.

import { slugId, uniqueId, dbName, normalizePath, sourceRef } from "../util/ids.ts";
import type { NodeType } from "../registry.ts";
import type {
  AnalysisFacts, ArchitectureDocument, AfNode, AfEdge, AfEntity, AfEndpoint,
  AfActor, Confidence, Evidence, EvidenceRecord, Properties,
} from "../types.ts";

const LAYER_X: Record<string, number> = {
  web_client: 0, mobile_client: 0, cdn: 0, waf: 120,
  api_gateway: 320, load_balancer: 320,
  service: 560, worker: 560, auth_service: 560,
  database: 820, cache: 820, search_index: 820, message_broker: 820, object_storage: 820,
  external_api: 1080, observability: 1080, secrets_manager: 1080, cloud_resource: 1080,
};

function sourceOf(ev: Evidence): string {
  return sourceRef(ev.path, ev.lineStart, ev.lineEnd);
}

export function buildModel(facts: AnalysisFacts): { document: ArchitectureDocument; evidence: EvidenceRecord[] } {
  const ids = new Set<string>();
  const nodes: AfNode[] = [];
  const edges: AfEdge[] = [];
  const evidence: EvidenceRecord[] = [];
  const layerCounts = new Map<string, number>();

  function place(type: NodeType): { x: number; y: number } {
    const n = layerCounts.get(type) ?? 0;
    layerCounts.set(type, n + 1);
    const col = LAYER_X[type] ?? 560;
    // Stagger within a layer by node type to avoid exact overlaps.
    const base = col;
    return { x: base, y: 80 + n * 140 + (Object.keys(LAYER_X).indexOf(type) % 2) * 40 };
  }

  function addNode(rawId: string, type: NodeType, label: string, opts: { description?: string; technology?: string; confidence: Confidence; evidence: Evidence[] }): AfNode {
    const id = uniqueId(slugId(rawId), ids);
    const props: Properties = { confidence: opts.confidence };
    if (opts.evidence[0]) props.source = sourceOf(opts.evidence[0]);
    if (opts.evidence.length) props.evidence_count = opts.evidence.length;
    const node: AfNode = { id, type, label: label.slice(0, 200), position: place(type), properties: props };
    if (opts.description) node.description = opts.description.slice(0, 4000);
    if (opts.technology) node.technology = opts.technology.slice(0, 200);
    nodes.push(node);
    evidence.push({ elementId: id, elementKind: "node", label, confidence: opts.confidence, evidence: opts.evidence });
    return node;
  }

  function addEdge(source: string, target: string, opts: { label?: string; protocol?: string; data?: string; confidence: Confidence; evidence: Evidence[]; synchronous?: boolean }): void {
    const id = uniqueId(slugId(`${source}-${target}`), ids);
    const props: Properties = { confidence: opts.confidence };
    if (opts.evidence[0]) props.source = sourceOf(opts.evidence[0]);
    const edge: AfEdge = { id, source, target, direction: "one_way", properties: props };
    if (opts.label) edge.label = opts.label.slice(0, 200);
    if (opts.protocol) edge.protocol = opts.protocol;
    if (opts.data) edge.data = opts.data.slice(0, 200);
    if (opts.synchronous != null) edge.synchronous = opts.synchronous;
    edges.push(edge);
    evidence.push({ elementId: id, elementKind: "edge", label: opts.label ?? `${source}→${target}`, confidence: opts.confidence, evidence: opts.evidence });
  }

  // --- Frontends (web_client) -------------------------------------------
  const frontendNodes: AfNode[] = [];
  for (const ep of facts.entryPoints.filter((e) => e.kind === "frontend")) {
    const n = addNode(`web-${ep.framework ?? "client"}-${ep.rel}`, "web_client", `${ep.framework ?? "Web"} client`, {
      technology: ep.framework, confidence: "verified", evidence: [ep.evidence],
    });
    frontendNodes.push(n);
  }

  // --- Backends (service / auth_service) --------------------------------
  const backendNodes: AfNode[] = [];
  for (const ep of facts.entryPoints.filter((e) => e.kind === "backend")) {
    const n = addNode(`api-${ep.framework ?? "service"}-${ep.rel}`, "service", `${ep.framework ?? "Backend"} service`, {
      technology: ep.framework, confidence: "verified", evidence: [ep.evidence],
      description: `Application entry at ${ep.rel}`,
    });
    backendNodes.push(n);
  }
  // Workers
  for (const ep of facts.entryPoints.filter((e) => e.kind === "worker")) {
    addNode(`worker-${ep.rel}`, "worker", `${ep.framework ?? "Worker"}`, { technology: ep.framework, confidence: "verified", evidence: [ep.evidence] });
  }
  // If HTTP routes were found but no explicit application entrypoint (e.g. a bare
  // Express/Nest app), synthesise one service node so endpoints have an owner.
  if (backendNodes.length === 0 && facts.routes.length) {
    const rf = facts.routes[0]!;
    backendNodes.push(addNode(`api-${rf.framework}`, "service", `${rf.framework} service`, {
      technology: rf.framework, confidence: "inferred", evidence: [rf.evidence],
      description: "Synthesised from detected HTTP routes; no explicit application entrypoint was found.",
    }));
  }

  const primaryBackend = backendNodes[0];

  // --- Data stores from integrations ------------------------------------
  const integrationNodes = new Map<NodeType, AfNode>();
  let databaseNode: AfNode | undefined;
  for (const integ of facts.integrations) {
    const n = addNode(`int-${integ.name}`, integ.category, integ.name, {
      technology: integ.name, confidence: "verified", evidence: [integ.evidence],
    });
    if (!integrationNodes.has(integ.category)) integrationNodes.set(integ.category, n);
    if (integ.category === "database" && !databaseNode) databaseNode = n;
  }

  // If entities exist but no database integration was declared, model a database
  // node from the ORM evidence itself (the store is clearly present).
  if (!databaseNode && facts.entities.length) {
    const ev = facts.entities[0]!.evidence;
    databaseNode = addNode("database", "database", "Database", { confidence: "inferred", evidence: [ev], description: `Inferred from ${facts.entities.length} ORM/SQL model(s)` });
  }

  // --- Edges: client -> backend -----------------------------------------
  for (const fe of frontendNodes) {
    if (primaryBackend) {
      addEdge(fe.id, primaryBackend.id, { label: "API calls", protocol: "HTTPS", confidence: "inferred", evidence: [{ path: fe.properties?.source as string ?? "", relationship: "frontend and backend both present; direct client→API call not individually traced" }] });
    }
  }
  // backend -> database
  if (primaryBackend && databaseNode) {
    addEdge(primaryBackend.id, databaseNode.id, { label: "reads/writes", protocol: "SQL", synchronous: true, confidence: facts.entities.length ? "verified" : "inferred", evidence: facts.entities.slice(0, 1).map((e) => e.evidence) });
  }
  // backend -> other integrations (cache/broker/storage/external/observability)
  if (primaryBackend) {
    for (const [cat, node] of integrationNodes) {
      if (cat === "database") continue;
      const proto = cat === "cache" ? "Redis" : cat === "message_broker" ? "AMQP/Kafka" : cat === "object_storage" ? "S3" : "HTTPS";
      addEdge(primaryBackend.id, node.id, { label: node.label, protocol: proto, confidence: "verified", evidence: evidenceForNode(evidence, node.id) });
    }
  }

  // --- Entities ---------------------------------------------------------
  const entityIds = new Map<string, string>(); // dbName -> id
  const entities: AfEntity[] = [];
  for (const ef of facts.entities.slice(0, 300)) {
    const id = uniqueId(slugId(ef.name), ids);
    entityIds.set(ef.name, id);
  }
  for (const ef of facts.entities.slice(0, 300)) {
    const id = entityIds.get(ef.name)!;
    const fieldIds = new Set<string>();
    const fields = ef.fields.slice(0, 200).map((f) => {
      const fid = uniqueId(slugId(`${ef.name}-${f.name}`), fieldIds);
      const fkTarget = f.fk ? entityIds.get(dbName(f.fk)) : undefined;
      return {
        id: fid, name: f.name, type: f.type,
        primary_key: !!f.primaryKey, nullable: f.nullable !== false, unique: !!f.unique,
        foreign_key: fkTarget ? { entity_id: fkTarget, field: "id", on_delete: "restrict" as const } : null,
      };
    });
    entities.push({ id, name: ef.name, label: ef.name, node_id: databaseNode?.id ?? null, fields, description: `${ef.source} model` });
    evidence.push({ elementId: id, elementKind: "entity", label: ef.name, confidence: "verified", evidence: [ef.evidence] });
  }

  // --- Endpoints --------------------------------------------------------
  const endpoints: AfEndpoint[] = [];
  const epIds = new Set<string>();
  for (const rf of facts.routes.slice(0, 500)) {
    const p = normalizePath(rf.path);
    if (!p) continue;
    const id = uniqueId(slugId(`ep-${rf.method}-${p}`), epIds);
    // The schema's Endpoint model has no `properties` field (unlike Node/Edge), so
    // evidence/framework for an endpoint lives in the sidecar and the summary only.
    endpoints.push({
      id, method: rf.method, path: p,
      summary: `${rf.framework} route`.slice(0, 200),
      service_node_id: primaryBackend?.id ?? null,
      auth: rf.auth ?? "authenticated",
    });
    evidence.push({ elementId: id, elementKind: "endpoint", label: `${rf.method} ${p}`, confidence: "verified", evidence: [rf.evidence] });
  }

  // --- Actors / roles ---------------------------------------------------
  const actors: AfActor[] = [];
  const actorIds = new Set<string>();
  actors.push({ id: uniqueId("user", actorIds), name: "User", description: "Generic end user (inferred).", is_role: false });
  const roles = facts.auth.flatMap((a) => a.roles);
  for (const role of [...new Set(roles)].slice(0, 20)) {
    const id = uniqueId(slugId(`role-${role}`), actorIds);
    actors.push({ id, name: role, description: "Application role observed in auth code.", is_role: true });
    evidence.push({ elementId: id, elementKind: "actor", label: role, confidence: "inferred", evidence: facts.auth[0] ? [facts.auth[0].evidence] : [] });
  }

  // --- Decisions / assumptions / open questions -------------------------
  const decisions = buildDecisions(facts, ids);
  const assumptions: ArchitectureDocument["assumptions"] = [];
  const openQuestions: string[] = [];

  if (frontendNodes.length && primaryBackend) assumptions.push({ id: slugId("assume-client-api"), text: "The web client calls the backend over HTTP; the exact call sites were not individually traced.", confirmed: false });
  if (!facts.infra.length) openQuestions.push("No deployment/CI configuration was found; the deployment topology is unknown and externally configured.");
  if (facts.auth.length === 0) openQuestions.push("No authentication implementation was detected; confirm whether auth is handled elsewhere (gateway, external IdP).");
  if (facts.entities.length >= 300) openQuestions.push("Entity list truncated at 300; the schema is larger than modelled.");

  const document: ArchitectureDocument = {
    schema_version: 1,
    vision: `Source-grounded system design for "${repoName(facts)}", reverse-engineered from the repository by ArchitectFlow. Languages: ${facts.stack.languages.map((l) => l.name).join(", ") || "n/a"}. This is observed implementation, not a product vision.`,
    requirements: { functional: [], nonfunctional: [], acceptance_criteria: [] },
    actors,
    workflows: [],
    integrations: facts.integrations.map((i) => i.name).slice(0, 100),
    technology_preferences: [...new Set([...facts.stack.frameworks.map((f) => f.name), ...facts.stack.languages.map((l) => l.name)])].slice(0, 100),
    constraints: [],
    assumptions,
    open_questions: openQuestions.slice(0, 100),
    decisions,
    nodes: nodes.slice(0, 500),
    edges: edges.slice(0, 2000),
    groups: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    database: { entities },
    api: { endpoints },
    design: { themes: [], active_theme_id: null, pages: [], journeys: [] },
    prompt_settings: { mode: "architecture_docs", preset: "claude_code", sections: ["overview", "components", "connections", "data", "api", "security", "deployment", "decisions", "open_questions"], page_id: null },
  };

  return { document, evidence };
}

function evidenceForNode(records: EvidenceRecord[], id: string): Evidence[] {
  return records.find((r) => r.elementId === id)?.evidence ?? [];
}

function repoName(facts: AnalysisFacts): string {
  const root = facts.root.split("/").filter(Boolean).pop() ?? "repository";
  return root;
}

function buildDecisions(facts: AnalysisFacts, ids: Set<string>): ArchitectureDocument["decisions"] {
  const out: ArchitectureDocument["decisions"] = [];
  const orm = facts.entities[0]?.source;
  if (orm) out.push({ id: uniqueId(slugId("decision-orm"), ids), title: `Persistence via ${orm}`, rationale: `${facts.entities.length} model(s) defined with ${orm}.`, status: "accepted" });
  if (facts.stack.monorepo) out.push({ id: uniqueId(slugId("decision-monorepo"), ids), title: "Monorepo layout", rationale: `${facts.stack.workspaces.length} workspace(s): ${facts.stack.workspaces.map((w) => w.name).slice(0, 8).join(", ")}.`, status: "accepted" });
  const mig = facts.migrations[0];
  if (mig) out.push({ id: uniqueId(slugId("decision-migrations"), ids), title: `Schema migrations with ${mig.tool}`, rationale: `${mig.count} migration(s) under ${mig.dir}.`, status: "accepted" });
  return out.slice(0, 100);
}

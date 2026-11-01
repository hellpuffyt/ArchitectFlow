// Shared types: the subset of the ArchitectFlow ArchitectureDocument the engine
// emits (must validate against apps/api/architectflow/schema/architecture.py),
// the internal analysis facts, and the evidence model (spec section 7).

import type { NodeType } from "./registry.ts";

// ---------------------------------------------------------------------------
// Evidence & confidence  (spec section 7 — source traceability)
// ---------------------------------------------------------------------------

/** How strongly the implementation supports a claim. */
export type Confidence = "verified" | "inferred" | "recommendation" | "unknown";

export interface Evidence {
  /** Repository-relative file path. */
  path: string;
  /** Symbol (class/function/config key) when known. */
  symbol?: string;
  lineStart?: number;
  lineEnd?: number;
  /** What this evidence supports about the element. */
  relationship: string;
}

export interface EvidenceRecord {
  elementId: string;
  elementKind: "node" | "edge" | "entity" | "endpoint" | "actor" | "claim";
  label: string;
  confidence: Confidence;
  evidence: Evidence[];
}

// ---------------------------------------------------------------------------
// ArchitectureDocument subset  (schema_version 1)
// ---------------------------------------------------------------------------

export type PropValue = string | number | boolean;
export type Properties = Record<string, PropValue>;

export interface AfNode {
  id: string;
  type: NodeType;
  label: string;
  description?: string;
  technology?: string;
  position: { x: number; y: number };
  group_id?: string;
  properties?: Properties;
}

export type EdgeDirection = "one_way" | "two_way";

export interface AfEdge {
  id: string;
  source: string;
  target: string;
  protocol?: string;
  label?: string;
  direction?: EdgeDirection;
  synchronous?: boolean;
  data?: string;
  properties?: Properties;
}

export type FieldType =
  | "uuid" | "text" | "varchar" | "integer" | "bigint" | "numeric"
  | "boolean" | "date" | "timestamp" | "json" | "bytes";

export interface AfEntityField {
  id: string;
  name: string;
  type: FieldType;
  primary_key?: boolean;
  nullable?: boolean;
  unique?: boolean;
  foreign_key?: { entity_id: string; field: string; on_delete?: "restrict" | "cascade" | "set_null" } | null;
  description?: string;
}

export interface AfEntity {
  id: string;
  name: string;
  label?: string;
  node_id?: string | null;
  fields: AfEntityField[];
  indexes?: { fields: string[]; unique?: boolean; reason?: string }[];
  description?: string;
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface AfEndpoint {
  id: string;
  method: HttpMethod;
  path: string;
  summary?: string;
  service_node_id?: string | null;
  auth?: "public" | "authenticated" | "roles";
  roles?: string[];
  // NB: the schema's Endpoint model forbids extra fields and has no `properties`.
}

export interface AfActor {
  id: string;
  name: string;
  description?: string;
  is_role?: boolean;
}

export interface AfDecision {
  id: string;
  title: string;
  rationale?: string;
  tradeoffs?: string;
  status?: "proposed" | "accepted" | "superseded";
}

export interface AfAssumption {
  id: string;
  text: string;
  confirmed?: boolean;
}

export interface ArchitectureDocument {
  schema_version: 1;
  vision: string;
  requirements: { functional: unknown[]; nonfunctional: unknown[]; acceptance_criteria: unknown[] };
  actors: AfActor[];
  workflows: unknown[];
  integrations: string[];
  technology_preferences: string[];
  constraints: unknown[];
  assumptions: AfAssumption[];
  open_questions: string[];
  decisions: AfDecision[];
  nodes: AfNode[];
  edges: AfEdge[];
  groups: unknown[];
  viewport: { x: number; y: number; zoom: number };
  database: { entities: AfEntity[] };
  api: { endpoints: AfEndpoint[] };
  design: { themes: unknown[]; active_theme_id: string | null; pages: unknown[]; journeys: unknown[] };
  prompt_settings: { mode: string; preset: string; sections: string[]; page_id: string | null };
}

// ---------------------------------------------------------------------------
// Internal analysis facts (deterministic layer output, before modelling)
// ---------------------------------------------------------------------------

export interface DiscoveredFile {
  rel: string;       // repository-relative path
  abs: string;
  size: number;
  ext: string;
}

export interface Workspace {
  /** Repository-relative directory of a package/service in a monorepo ("" = root). */
  rel: string;
  manifest: string;  // the manifest file that defines it (package.json, pyproject.toml, ...)
  name: string;
}

export interface DetectedStack {
  languages: { name: string; files: number }[];
  packageManagers: string[];
  buildSystems: string[];
  frameworks: { name: string; evidence: Evidence }[];
  workspaces: Workspace[];
  monorepo: boolean;
}

export interface ImportEdge {
  fromRel: string;
  /** Resolved internal target (repo-relative) or null for an external dependency. */
  toRel: string | null;
  specifier: string;
  line: number;
}

export interface EntryPoint {
  rel: string;
  kind: "frontend" | "backend" | "worker" | "cli" | "unknown";
  evidence: Evidence;
  framework?: string;
}

export interface RouteFact {
  method: HttpMethod;
  path: string;
  framework: string;
  evidence: Evidence;
  auth?: "public" | "authenticated" | "roles";
}

export interface EntityFact {
  name: string;
  source: "prisma" | "sqlalchemy" | "django" | "typeorm" | "sequelize" | "sql" | "mongoose";
  fields: { name: string; type: FieldType; primaryKey?: boolean; nullable?: boolean; unique?: boolean; fk?: string }[];
  evidence: Evidence;
}

export interface MigrationInfo {
  tool: "alembic" | "prisma" | "django" | "knex" | "typeorm" | "sql";
  dir: string;
  count: number;
  evidence: Evidence;
}

export interface Integration {
  name: string;
  category: NodeType; // external_api / cache / object_storage / message_broker / ...
  evidence: Evidence;
}

export interface InfraFact {
  kind: "dockerfile" | "compose_service" | "ci" | "vercel" | "netlify" | "kubernetes" | "caddy" | "nginx";
  name: string;
  evidence: Evidence;
  detail?: string;
}

export interface AuthFact {
  mechanism: string;      // "session cookie", "jwt", "oauth2", ...
  evidence: Evidence;
  roles: string[];
}

export interface AnalysisFacts {
  root: string;
  files: DiscoveredFile[];
  stack: DetectedStack;
  entryPoints: EntryPoint[];
  imports: ImportEdge[];
  routes: RouteFact[];
  entities: EntityFact[];
  migrations: MigrationInfo[];
  integrations: Integration[];
  infra: InfraFact[];
  auth: AuthFact[];
  skipped: { path: string; reason: string }[];
}

export interface AnalysisResult {
  document: ArchitectureDocument;
  evidence: EvidenceRecord[];
  facts: AnalysisFacts;
  diagrams: Record<string, string>; // name -> mermaid source
  markdown: string;
  fingerprint: Fingerprint;
  generatedAt: string;
}

export interface Fingerprint {
  version: number;
  repoHash: string;
  files: Record<string, string>; // rel -> content hash
  fileCount: number;
}

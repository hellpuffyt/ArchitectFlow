// Hand-written mirror of the server's pydantic schema (apps/api/architectflow/schema).
// `lib/types.test.ts` checks every *_KEYS list below against lib/generated/architecture.schema.json,
// and `satisfies Record<keyof T, true>` makes tsc check the same lists against these types.
// Regenerate the JSON with: (cd apps/api && uv run python -m architectflow.schema.export).
import type { DesignDocument } from "./design-types";

export type PropValue = string | number | boolean;

export interface Requirement {
  id: string;
  text: string;
  priority: "must" | "should" | "could";
  category: string;
  status: "confirmed" | "assumption";
}
export interface AcceptanceCriterion { id: string; text: string }
export interface Requirements {
  functional: Requirement[];
  nonfunctional: Requirement[];
  acceptance_criteria: AcceptanceCriterion[];
}
export interface Actor { id: string; name: string; description: string; is_role: boolean }
export interface Workflow {
  id: string;
  name: string;
  actor_id: string | null;
  steps: string[];
  description: string;
}
export interface Constraint {
  id: string;
  text: string;
  kind: "requires_component" | "forbids_technology" | "note";
  value: string;
}
export interface Assumption { id: string; text: string; confirmed: boolean }
export interface Decision {
  id: string;
  title: string;
  rationale: string;
  tradeoffs: string;
  status: "proposed" | "accepted" | "superseded";
}
export interface Position { x: number; y: number }
export interface Size { width: number; height: number }
export interface ArchNode {
  id: string;
  type: string;
  label: string;
  description: string;
  technology: string;
  position: Position;
  size: Size | null;
  group_id: string | null;
  public: boolean | null;
  owner: string;
  replicas: number;
  properties: Record<string, PropValue>;
}
export interface ArchEdge {
  id: string;
  source: string;
  target: string;
  protocol: string;
  label: string;
  direction: "one_way" | "two_way";
  synchronous: boolean;
  encrypted: boolean | null;
  data: string;
  properties: Record<string, PropValue>;
}
export interface Group {
  id: string;
  label: string;
  kind: "boundary" | "deployment" | "team";
  node_ids: string[];
}
export type FieldType =
  | "uuid" | "text" | "varchar" | "integer" | "bigint" | "numeric" | "boolean" | "date"
  | "timestamp" | "json" | "bytes";
export const FIELD_TYPES: FieldType[] = [
  "uuid", "text", "varchar", "integer", "bigint", "numeric", "boolean", "date", "timestamp",
  "json", "bytes",
];
export interface ForeignKey {
  entity_id: string;
  field: string;
  on_delete: "restrict" | "cascade" | "set_null";
}
export interface EntityField {
  id: string;
  name: string;
  type: FieldType;
  primary_key: boolean;
  nullable: boolean;
  unique: boolean;
  foreign_key: ForeignKey | null;
  description: string;
}
export interface Index { fields: string[]; unique: boolean; reason: string }
export interface Entity {
  id: string;
  name: string;
  label: string;
  node_id: string | null;
  fields: EntityField[];
  indexes: Index[];
  description: string;
}
export interface ApiField {
  name: string;
  type: FieldType;
  required: boolean;
  entity_id: string | null;
  entity_field: string | null;
}
export interface ApiError { status: number; description: string }
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export interface Endpoint {
  id: string;
  method: HttpMethod;
  path: string;
  summary: string;
  service_node_id: string | null;
  auth: "public" | "authenticated" | "roles";
  roles: string[];
  request_fields: ApiField[];
  response_entity_id: string | null;
  response_fields: ApiField[];
  response_is_list: boolean;
  paginated: boolean;
  filters: string[];
  errors: ApiError[];
}
export interface Viewport { x: number; y: number; zoom: number }
export type PromptMode =
  | "complete_app" | "frontend" | "design_system" | "page" | "backend_api" | "database"
  | "architecture_docs" | "testing_qa";
export type PromptPreset = "claude_code" | "openai_codex" | "generic_agent";
export type PromptSection =
  | "overview" | "requirements" | "journeys" | "components" | "connections" | "data" | "api"
  | "security" | "deployment" | "design" | "pages" | "testing" | "decisions" | "open_questions";
export const ALL_PROMPT_SECTIONS: PromptSection[] = [
  "overview", "requirements", "journeys", "components", "connections", "data", "api", "security",
  "deployment", "design", "pages", "testing", "decisions", "open_questions",
];
export interface PromptSettings {
  mode: PromptMode;
  preset: PromptPreset;
  sections: PromptSection[];
  page_id: string | null;
}
export interface ArchitectureDocument {
  schema_version: 1;
  vision: string;
  requirements: Requirements;
  actors: Actor[];
  workflows: Workflow[];
  integrations: string[];
  technology_preferences: string[];
  constraints: Constraint[];
  assumptions: Assumption[];
  open_questions: string[];
  decisions: Decision[];
  nodes: ArchNode[];
  edges: ArchEdge[];
  groups: Group[];
  viewport: Viewport;
  database: { entities: Entity[] };
  api: { endpoints: Endpoint[] };
  design: DesignDocument;
  prompt_settings: PromptSettings;
}

type Keys<T> = Record<keyof T, true>;
export const SCHEMA_KEYS = {
  ArchitectureDocument: {
    schema_version: true, vision: true, requirements: true, actors: true, workflows: true,
    integrations: true, technology_preferences: true, constraints: true, assumptions: true,
    open_questions: true, decisions: true, nodes: true, edges: true, groups: true,
    viewport: true, database: true, api: true, design: true, prompt_settings: true,
  } satisfies Keys<ArchitectureDocument>,
  Node: {
    id: true, type: true, label: true, description: true, technology: true, position: true,
    size: true, group_id: true, public: true, owner: true, replicas: true, properties: true,
  } satisfies Keys<ArchNode>,
  Edge: {
    id: true, source: true, target: true, protocol: true, label: true, direction: true,
    synchronous: true, encrypted: true, data: true, properties: true,
  } satisfies Keys<ArchEdge>,
  Requirement: {
    id: true, text: true, priority: true, category: true, status: true,
  } satisfies Keys<Requirement>,
  Entity: {
    id: true, name: true, label: true, node_id: true, fields: true, indexes: true,
    description: true,
  } satisfies Keys<Entity>,
  EntityField: {
    id: true, name: true, type: true, primary_key: true, nullable: true, unique: true,
    foreign_key: true, description: true,
  } satisfies Keys<EntityField>,
  Endpoint: {
    id: true, method: true, path: true, summary: true, service_node_id: true, auth: true,
    roles: true, request_fields: true, response_entity_id: true, response_fields: true,
    response_is_list: true, paginated: true, filters: true, errors: true,
  } satisfies Keys<Endpoint>,
  ApiField: {
    name: true, type: true, required: true, entity_id: true, entity_field: true,
  } satisfies Keys<ApiField>,
  Group: { id: true, label: true, kind: true, node_ids: true } satisfies Keys<Group>,
  Actor: { id: true, name: true, description: true, is_role: true } satisfies Keys<Actor>,
  Assumption: { id: true, text: true, confirmed: true } satisfies Keys<Assumption>,
  PromptSettings: {
    mode: true, preset: true, sections: true, page_id: true,
  } satisfies Keys<PromptSettings>,
} as const;

export function emptyDocument(): ArchitectureDocument {
  return {
    schema_version: 1, vision: "",
    requirements: { functional: [], nonfunctional: [], acceptance_criteria: [] },
    actors: [], workflows: [], integrations: [], technology_preferences: [], constraints: [],
    assumptions: [], open_questions: [], decisions: [], nodes: [], edges: [], groups: [],
    viewport: { x: 0, y: 0, zoom: 1 }, database: { entities: [] }, api: { endpoints: [] },
    design: { themes: [], active_theme_id: null, pages: [], journeys: [] },
    prompt_settings: {
      mode: "complete_app", preset: "claude_code", sections: [...ALL_PROMPT_SECTIONS],
      page_id: null,
    },
  };
}

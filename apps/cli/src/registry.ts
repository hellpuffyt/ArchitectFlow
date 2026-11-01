// The closed set of node types the ArchitectFlow document schema accepts, mirrored
// from apps/api/architectflow/schema/registry.py. A Node.type outside this set is
// rejected by the integrity gate, so the modeller only ever emits these keys.

export const NODE_TYPES = [
  "web_client",
  "mobile_client",
  "api_gateway",
  "load_balancer",
  "service",
  "worker",
  "database",
  "cache",
  "search_index",
  "message_broker",
  "auth_service",
  "object_storage",
  "cdn",
  "external_api",
  "observability",
  "secrets_manager",
  "waf",
  "cloud_resource",
] as const;

export type NodeType = (typeof NODE_TYPES)[number];

export function isNodeType(x: string): x is NodeType {
  return (NODE_TYPES as readonly string[]).includes(x);
}

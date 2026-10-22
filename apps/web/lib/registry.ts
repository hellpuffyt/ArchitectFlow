// Mirror of apps/api/architectflow/schema/registry.py — checked by lib/registry.test.ts.
// To add a component type: add it in registry.py, re-export the JSON, then add it here with an icon.
import {
  Boxes, Cloud, Cpu, Database, Globe, KeyRound, Layers, LineChart, Lock, MessagesSquare,
  Network, PlugZap, Search, Server, Shield, Smartphone, Split, Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type Category =
  | "client" | "edge" | "compute" | "data" | "messaging" | "identity" | "storage" | "external"
  | "operations" | "security" | "infrastructure";

export interface NodeTypeInfo {
  key: string;
  label: string;
  category: Category;
  icon: LucideIcon;
}

export const NODE_TYPES: NodeTypeInfo[] = [
  { key: "web_client", label: "Web client", category: "client", icon: Globe },
  { key: "mobile_client", label: "Mobile client", category: "client", icon: Smartphone },
  { key: "api_gateway", label: "API gateway", category: "edge", icon: Network },
  { key: "load_balancer", label: "Load balancer", category: "edge", icon: Split },
  { key: "service", label: "Backend service", category: "compute", icon: Server },
  { key: "worker", label: "Background worker", category: "compute", icon: Cpu },
  { key: "database", label: "Database", category: "data", icon: Database },
  { key: "cache", label: "Cache", category: "data", icon: Zap },
  { key: "search_index", label: "Search index", category: "data", icon: Search },
  { key: "message_broker", label: "Message broker", category: "messaging", icon: MessagesSquare },
  { key: "auth_service", label: "Identity / auth", category: "identity", icon: KeyRound },
  { key: "object_storage", label: "Object storage", category: "storage", icon: Boxes },
  { key: "cdn", label: "CDN", category: "storage", icon: Layers },
  { key: "external_api", label: "External service", category: "external", icon: PlugZap },
  { key: "observability", label: "Observability", category: "operations", icon: LineChart },
  { key: "secrets_manager", label: "Secrets manager", category: "security", icon: Lock },
  { key: "waf", label: "WAF / firewall", category: "security", icon: Shield },
  { key: "cloud_resource", label: "Cloud resource", category: "infrastructure", icon: Cloud },
];

export const CATEGORY_LABEL: Record<Category, string> = {
  client: "Clients", edge: "Edge", compute: "Compute", data: "Data", messaging: "Messaging",
  identity: "Identity", storage: "Storage & delivery", external: "External",
  operations: "Operations", security: "Security", infrastructure: "Infrastructure",
};

// Category accent colors (CSS custom properties defined in globals.css).
export const CATEGORY_COLOR: Record<Category, string> = {
  client: "var(--cat-client)", edge: "var(--cat-edge)", compute: "var(--cat-compute)",
  data: "var(--cat-data)", messaging: "var(--cat-messaging)", identity: "var(--cat-identity)",
  storage: "var(--cat-storage)", external: "var(--cat-external)",
  operations: "var(--cat-operations)", security: "var(--cat-security)",
  infrastructure: "var(--cat-infra)",
};

const BY_KEY = new Map(NODE_TYPES.map((t) => [t.key, t]));
export function nodeTypeInfo(key: string): NodeTypeInfo {
  return BY_KEY.get(key) ?? { key, label: key, category: "infrastructure", icon: Cloud };
}

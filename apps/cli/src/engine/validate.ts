// Local structural validation of a generated ArchitectureDocument against the hard
// rules the ArchitectFlow import gate enforces (apps/api/.../schema/architecture.py +
// validation/integrity.py). Catching violations here means `analyze` never writes a
// design that the web app would reject, and gives `doctor` something concrete to check.

import { NODE_TYPES } from "../registry.ts";
import type { ArchitectureDocument } from "../types.ts";

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const NAME_RE = /^[a-z_][a-z0-9_]{0,62}$/;
const PATH_RE = /^\/[A-Za-z0-9_\-/{}.:]*$/;
const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

export function validateDocument(doc: ArchitectureDocument): string[] {
  const errs: string[] = [];
  if (doc.schema_version !== 1) errs.push(`schema_version must be 1 (got ${doc.schema_version})`);
  if (doc.nodes.length > 500) errs.push(`too many nodes: ${doc.nodes.length} > 500`);
  if (doc.edges.length > 2000) errs.push(`too many edges: ${doc.edges.length} > 2000`);

  const nodeIds = new Set<string>();
  for (const n of doc.nodes) {
    if (!ID_RE.test(n.id)) errs.push(`invalid node id: ${JSON.stringify(n.id)}`);
    if (nodeIds.has(n.id)) errs.push(`duplicate node id: ${n.id}`);
    nodeIds.add(n.id);
    if (!(NODE_TYPES as readonly string[]).includes(n.type)) errs.push(`unknown node type on ${n.id}: ${n.type}`);
    if (n.label.length > 200) errs.push(`node label too long: ${n.id}`);
    if (n.properties) for (const v of Object.values(n.properties)) if (!["string", "number", "boolean"].includes(typeof v)) errs.push(`non-scalar property on node ${n.id}`);
  }
  for (const e of doc.edges) {
    if (!ID_RE.test(e.id)) errs.push(`invalid edge id: ${e.id}`);
    if (!nodeIds.has(e.source)) errs.push(`edge ${e.id} source missing: ${e.source}`);
    if (!nodeIds.has(e.target)) errs.push(`edge ${e.id} target missing: ${e.target}`);
    if (e.direction && !["one_way", "two_way"].includes(e.direction)) errs.push(`edge ${e.id} bad direction`);
  }
  const entityIds = new Set<string>();
  for (const ent of doc.database.entities) {
    if (!ID_RE.test(ent.id)) errs.push(`invalid entity id: ${ent.id}`);
    if (!NAME_RE.test(ent.name)) errs.push(`invalid entity name: ${JSON.stringify(ent.name)}`);
    entityIds.add(ent.id);
    for (const f of ent.fields) {
      if (!NAME_RE.test(f.name)) errs.push(`invalid field name on ${ent.name}: ${JSON.stringify(f.name)}`);
      if (f.foreign_key && !doc.database.entities.some((x) => x.id === f.foreign_key!.entity_id)) errs.push(`dangling FK on ${ent.name}.${f.name}`);
    }
    if (ent.node_id && !nodeIds.has(ent.node_id)) errs.push(`entity ${ent.name} node_id dangling: ${ent.node_id}`);
  }
  for (const ep of doc.api.endpoints) {
    if (!ID_RE.test(ep.id)) errs.push(`invalid endpoint id: ${ep.id}`);
    if (!METHODS.has(ep.method)) errs.push(`bad method on ${ep.id}: ${ep.method}`);
    if (!PATH_RE.test(ep.path)) errs.push(`bad path on ${ep.id}: ${JSON.stringify(ep.path)}`);
    if (ep.service_node_id && !nodeIds.has(ep.service_node_id)) errs.push(`endpoint ${ep.id} service_node_id dangling`);
    // The schema's Endpoint model forbids a `properties` field (only Node/Edge allow it).
    if ("properties" in ep) errs.push(`endpoint ${ep.id} must not carry a properties field`);
  }
  for (const a of doc.actors) if (!ID_RE.test(a.id)) errs.push(`invalid actor id: ${a.id}`);
  return errs;
}

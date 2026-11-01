// Identifier and name normalisers. The ArchitectFlow document schema constrains
// ids and names tightly (apps/api/architectflow/schema/architecture.py), and a
// document that violates them is rejected whole by the import gate. Every id the
// engine mints flows through here so generated designs always validate.

const ID_MAX = 64;

/** Node/edge/design id: ^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$ */
export function slugId(raw: string, fallback = "x"): string {
  let s = raw
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9_.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+/, "");
  if (!s) s = fallback;
  if (!/^[A-Za-z0-9]/.test(s)) s = "n" + s;
  return s.slice(0, ID_MAX);
}

/** Entity/field name: ^[a-z_][a-z0-9_]{0,62}$ */
export function dbName(raw: string, fallback = "entity"): string {
  let s = raw
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!s) s = fallback;
  if (!/^[a-z_]/.test(s)) s = "t_" + s;
  return s.slice(0, 63);
}

/** Ensure uniqueness within a set, appending -2, -3, ... as needed. */
export function uniqueId(candidate: string, taken: Set<string>): string {
  let id = candidate;
  let n = 2;
  while (taken.has(id)) {
    const suffix = "-" + n++;
    id = candidate.slice(0, ID_MAX - suffix.length) + suffix;
  }
  taken.add(id);
  return id;
}

/** Normalise a framework route to the schema path pattern ^/[A-Za-z0-9_\-/{}.:]*$ */
export function normalizePath(raw: string): string | null {
  if (!raw) return null;
  let p = raw.trim();
  // Next.js [id] / [...slug]  ->  {id} / {slug}
  p = p.replace(/\[\.\.\.([^\]]+)\]/g, "{$1}").replace(/\[([^\]]+)\]/g, "{$1}");
  // Django <int:id> / <id>  ->  {id}
  p = p.replace(/<(?:[a-z_]+:)?([a-zA-Z_][\w]*)>/g, "{$1}");
  // Express :id stays valid ( ':' is allowed ), but strip regex constraints :id(\d+)
  p = p.replace(/:([a-zA-Z_][\w]*)\([^)]*\)/g, ":$1");
  if (!p.startsWith("/")) p = "/" + p;
  p = p.replace(/\/{2,}/g, "/");
  // Drop anything the pattern forbids.
  if (!/^\/[A-Za-z0-9_\-/{}.:]*$/.test(p)) {
    p = "/" + p.replace(/[^A-Za-z0-9_\-/{}.:]/g, "");
  }
  return p.slice(0, 200) || "/";
}

/** A short "path:start-end" or "path:line" source reference for document properties. */
export function sourceRef(relPath: string, start?: number, end?: number): string {
  if (start == null) return relPath;
  if (end == null || end === start) return `${relPath}:${start}`;
  return `${relPath}:${start}-${end}`;
}

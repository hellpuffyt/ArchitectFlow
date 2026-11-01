// Small text helpers shared by the extraction modules.

/** 1-based line number of a character offset within text. */
export function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === "\n") line++;
  return line;
}

/** Parse JSON, returning undefined on failure (never throws). */
export function tryJson<T = unknown>(text: string): T | undefined {
  try { return JSON.parse(text) as T; } catch { return undefined; }
}

/** Collect dependency names from a package.json-style deps object. */
export function depNames(pkg: Record<string, unknown> | undefined): Set<string> {
  const out = new Set<string>();
  if (!pkg) return out;
  for (const key of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    const d = pkg[key];
    if (d && typeof d === "object") for (const name of Object.keys(d as object)) out.add(name);
  }
  return out;
}

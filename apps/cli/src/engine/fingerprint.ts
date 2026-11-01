// Incremental analysis support (spec section 8). A repository fingerprint is a map
// of file -> content hash plus an aggregate. Comparing two fingerprints yields the
// added / removed / modified file sets, which drives change summaries and stale-
// evidence detection on `update` without re-reasoning the whole repo from scratch.

import crypto from "node:crypto";
import { readTextSafe } from "./discovery.ts";
import type { DiscoveredFile, Fingerprint } from "../types.ts";

export function fingerprint(files: DiscoveredFile[]): Fingerprint {
  const map: Record<string, string> = {};
  const agg = crypto.createHash("sha256");
  for (const f of files) {
    const h = crypto.createHash("sha256").update(readTextSafe(f.abs)).digest("hex").slice(0, 16);
    map[f.rel] = h;
    agg.update(f.rel).update(h);
  }
  return { version: 1, repoHash: agg.digest("hex").slice(0, 32), files: map, fileCount: files.length };
}

export interface FingerprintDiff {
  added: string[];
  removed: string[];
  modified: string[];
  unchanged: number;
}

export function diffFingerprints(prev: Fingerprint | null, next: Fingerprint): FingerprintDiff {
  const added: string[] = [], removed: string[] = [], modified: string[] = [];
  let unchanged = 0;
  const prevFiles = prev?.files ?? {};
  for (const [rel, h] of Object.entries(next.files)) {
    if (!(rel in prevFiles)) added.push(rel);
    else if (prevFiles[rel] !== h) modified.push(rel);
    else unchanged++;
  }
  for (const rel of Object.keys(prevFiles)) if (!(rel in next.files)) removed.push(rel);
  return { added: added.sort(), removed: removed.sort(), modified: modified.sort(), unchanged };
}

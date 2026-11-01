// Repository discovery (spec section 10, stage 1). Walks the tree once, honouring
// .gitignore + .architectflowignore and the default skip set, never opening
// sensitive files, and bounding the work so a huge repo cannot hang the agent.

import fs from "node:fs";
import path from "node:path";
import { IgnoreSet, DEFAULT_SKIP_DIRS } from "./ignore.ts";
import { isSensitivePath } from "./privacy.ts";
import type { DiscoveredFile } from "../types.ts";

export interface DiscoveryOptions {
  maxFiles?: number;
  maxFileBytes?: number;
}

export interface DiscoveryResult {
  files: DiscoveredFile[];
  skipped: { path: string; reason: string }[];
  ignore: IgnoreSet;
}

export function findRepoRoot(start: string): string {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(start); // no .git: treat start as root
    dir = parent;
  }
}

function loadIgnore(root: string): IgnoreSet {
  const ig = new IgnoreSet();
  for (const name of [".gitignore", ".architectflowignore"]) {
    const p = path.join(root, name);
    try {
      if (fs.existsSync(p)) ig.add(fs.readFileSync(p, "utf8"));
    } catch { /* unreadable ignore file: skip */ }
  }
  return ig;
}

export function discover(root: string, opts: DiscoveryOptions = {}): DiscoveryResult {
  const maxFiles = opts.maxFiles ?? 20000;
  const maxFileBytes = opts.maxFileBytes ?? 2_000_000;
  const ig = loadIgnore(root);
  const files: DiscoveredFile[] = [];
  const skipped: { path: string; reason: string }[] = [];

  const stack: string[] = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const abs = path.join(dir, ent.name);
      const rel = path.relative(root, abs).split(path.sep).join("/");
      const isDir = ent.isDirectory();
      if (ent.isSymbolicLink()) { skipped.push({ path: rel, reason: "symlink" }); continue; }
      if (isDir && DEFAULT_SKIP_DIRS.has(ent.name)) continue;
      if (ig.ignored(rel, isDir)) continue;
      if (isDir) { stack.push(abs); continue; }
      if (!ent.isFile()) continue;
      if (isSensitivePath(rel)) { skipped.push({ path: rel, reason: "sensitive (not read)" }); continue; }
      let size = 0;
      try { size = fs.statSync(abs).size; } catch { continue; }
      if (size > maxFileBytes) { skipped.push({ path: rel, reason: "too large" }); continue; }
      files.push({ rel, abs, size, ext: path.extname(ent.name).toLowerCase() });
      if (files.length >= maxFiles) {
        skipped.push({ path: "(further files)", reason: `file cap ${maxFiles} reached` });
        return { files, skipped, ignore: ig };
      }
    }
  }
  files.sort((a, b) => a.rel.localeCompare(b.rel));
  return { files, skipped, ignore: ig };
}

/** Read a text file defensively; returns "" on any failure. Never called on
 *  sensitive paths because discovery already filtered them out. */
export function readTextSafe(abs: string, maxBytes = 2_000_000): string {
  try {
    const buf = fs.readFileSync(abs);
    if (buf.length > maxBytes) return buf.subarray(0, maxBytes).toString("utf8");
    // Reject binary: a NUL in the first 8 KiB means not source.
    const probe = buf.subarray(0, 8192);
    if (probe.includes(0)) return "";
    return buf.toString("utf8");
  } catch {
    return "";
  }
}

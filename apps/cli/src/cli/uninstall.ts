import fs from "node:fs";
import path from "node:path";
import { findRepoRoot } from "../engine/discovery.ts";
import { AF_DIR } from "../engine/analyze.ts";
import { heading, ok, info, warn } from "./console.ts";
import { SKILL_DIR, readManifest } from "./install.ts";

export function runUninstall(dir: string, purge: boolean): number {
  const root = findRepoRoot(dir);
  heading(`uninstall — ${root}`);
  const manifest = readManifest(root);
  if (!manifest) { warn("no ArchitectFlow installation manifest found; nothing removed."); return 0; }

  let removed = 0;
  for (const rel of manifest.ownedFiles) {
    const abs = path.join(root, rel);
    if (fs.existsSync(abs)) { fs.rmSync(abs); ok(`removed ${rel}`); removed++; }
  }
  // Remove the (now empty) skill directory, but never a non-empty one.
  const skillDirAbs = path.join(root, SKILL_DIR);
  try { if (fs.existsSync(skillDirAbs) && fs.readdirSync(skillDirAbs).length === 0) { fs.rmdirSync(skillDirAbs); ok(`removed ${SKILL_DIR}/`); } } catch { /* leave it */ }

  if (purge) {
    const afAbs = path.join(root, AF_DIR);
    if (fs.existsSync(afAbs)) { fs.rmSync(afAbs, { recursive: true, force: true }); ok(`purged ${AF_DIR}/ (generated designs)`); }
  } else info(`generated designs kept in ${AF_DIR}/ — re-run with --purge to remove them too.`);

  ok(`done — ${removed} owned file(s) removed. No other files were touched.`);
  return 0;
}

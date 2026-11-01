import fs from "node:fs";
import path from "node:path";
import { findRepoRoot, discover } from "../engine/discovery.ts";
import { validateDocument } from "../engine/validate.ts";
import { AF_DIR } from "../engine/analyze.ts";
import { heading, ok, info, warn, fail } from "./console.ts";
import { SKILL_REL, readManifest, skillTemplatePath } from "./install.ts";
import type { ArchitectureDocument } from "../types.ts";

export function runDoctor(dir: string): number {
  const root = findRepoRoot(dir);
  heading(`doctor — ${root}`);
  let problems = 0;

  // Environment
  const [maj, min] = process.versions.node.split(".").map(Number) as [number, number];
  if (maj > 20 || (maj === 20 && min >= 9)) ok(`Node ${process.versions.node}`);
  else { fail(`Node ${process.versions.node} < 20.9 required`); problems++; }

  // Installation
  const manifest = readManifest(root);
  if (!manifest) { warn("not installed here — run `npx architectflow init`"); }
  else {
    ok(`installed v${manifest.version} (updated ${manifest.updatedAt})`);
    const skillAbs = path.join(root, SKILL_REL);
    if (!fs.existsSync(skillAbs)) { fail(`skill file missing: ${SKILL_REL}`); problems++; }
    else {
      const drift = fs.readFileSync(skillAbs, "utf8") !== fs.readFileSync(skillTemplatePath(), "utf8");
      if (drift) warn("skill file differs from this CLI version — run init to update"); else ok("skill file matches CLI version");
    }
    for (const f of manifest.ownedFiles) if (!fs.existsSync(path.join(root, f))) { warn(`owned file missing: ${f}`); }
  }

  // Engine smoke test
  try {
    const { files, skipped } = discover(root, { maxFiles: 5000 });
    ok(`engine reads the repository: ${files.length} files in scope, ${skipped.length} skipped`);
  } catch (e) { fail(`engine failed to read repository: ${(e as Error).message}`); problems++; }

  // Last analysis
  const designPath = path.join(root, AF_DIR, "design.json");
  if (fs.existsSync(designPath)) {
    try {
      const doc = JSON.parse(fs.readFileSync(designPath, "utf8")) as ArchitectureDocument;
      const errs = validateDocument(doc);
      if (errs.length) { warn(`last design has ${errs.length} validation issue(s)`); } else ok("last design validates against the schema");
    } catch { warn("last design.json is unreadable"); }
  } else info("no analysis yet — run `npx architectflow analyze`");

  // AI mode
  const provider = process.env.ARCHITECTFLOW_AI_PROVIDER;
  info(`AI mode: ${provider && provider !== "example" ? `${provider} (set)` : "local / non-AI (default) — full analysis works without a provider"}`);

  console.log("");
  if (problems) { fail(`${problems} problem(s) found`); return 1; }
  ok("healthy");
  return 0;
}

import fs from "node:fs";
import path from "node:path";
import { findRepoRoot } from "../engine/discovery.ts";
import { heading, ok, info, warn } from "./console.ts";
import {
  SKILL_DIR, SKILL_REL, IGNORE_REL, INSTALLER_VERSION, detectAgents,
  skillTemplatePath, readManifest, writeManifest, IGNORE_TEMPLATE, type InstallManifest,
} from "./install.ts";

export function runInit(dir: string): number {
  const root = findRepoRoot(dir);
  heading(`init — ${root}`);

  const agents = detectAgents(root);
  for (const a of agents) {
    if (a.supported) info(`${a.label}: target ${SKILL_REL}`);
    else if (a.detected) warn(`${a.label}: detected, integration not yet available — skipped (no files written).`);
  }

  const template = fs.readFileSync(skillTemplatePath(), "utf8");
  const skillAbs = path.join(root, SKILL_REL);
  const existing = readManifest(root);
  const already = fs.existsSync(skillAbs) ? fs.readFileSync(skillAbs, "utf8") : null;

  fs.mkdirSync(path.join(root, SKILL_DIR), { recursive: true });
  let action: string;
  if (already === template) action = "up to date";
  else if (already != null) action = "updated";
  else action = "installed";
  fs.writeFileSync(skillAbs, template);

  // .architectflowignore — created only if absent; existing user config preserved.
  const ignoreAbs = path.join(root, IGNORE_REL);
  let createdIgnore = existing?.createdIgnore ?? false;
  if (!fs.existsSync(ignoreAbs)) { fs.writeFileSync(ignoreAbs, IGNORE_TEMPLATE); createdIgnore = true; }
  else info(`${IGNORE_REL} already present — left unchanged.`);

  const ownedFiles = [SKILL_REL, `${SKILL_DIR}/.architectflow-install.json`];
  if (createdIgnore) ownedFiles.push(IGNORE_REL);
  const now = new Date().toISOString();
  const manifest: InstallManifest = {
    version: INSTALLER_VERSION,
    installedAt: existing?.installedAt ?? now,
    updatedAt: now,
    ownedFiles,
    createdIgnore,
  };
  writeManifest(root, manifest);

  ok(`Claude Code skill ${action}: ${SKILL_REL}`);
  if (createdIgnore) ok(`Created ${IGNORE_REL}`);

  console.log("");
  info("Privacy: analysis runs locally and uploads nothing. .env files, keys and secrets are");
  info("never read. Repository scripts are never executed. Syncing to an ArchitectFlow account");
  info("happens only when you explicitly ask.");
  console.log("");
  ok("Next: run `npx architectflow analyze`, then invoke the skill in Claude Code (/architectflow).");
  return 0;
}

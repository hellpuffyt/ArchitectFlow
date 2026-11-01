// Installation bookkeeping shared by init / doctor / uninstall. ArchitectFlow only
// ever touches files it owns, and records exactly which ones in a manifest so that
// uninstall can remove precisely those and nothing else (spec section 2).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SKILL_DIR = ".claude/skills/architectflow";
export const SKILL_REL = `${SKILL_DIR}/SKILL.md`;
export const MANIFEST_REL = `${SKILL_DIR}/.architectflow-install.json`;
export const IGNORE_REL = ".architectflowignore";
export const INSTALLER_VERSION = "0.1.0";

export interface InstallManifest {
  version: string;
  installedAt: string;
  updatedAt: string;
  ownedFiles: string[];     // repo-relative files ArchitectFlow created and may remove
  createdIgnore: boolean;   // whether we created .architectflowignore (vs. it pre-existing)
}

export interface AgentEnv {
  id: "claude-code" | "codex" | "cursor";
  label: string;
  detected: boolean;
  supported: boolean;
}

export function detectAgents(root: string): AgentEnv[] {
  const has = (p: string) => fs.existsSync(path.join(root, p));
  return [
    { id: "claude-code", label: "Claude Code", detected: has(".claude") || has("CLAUDE.md"), supported: true },
    { id: "codex", label: "Codex", detected: has(".codex") || has("AGENTS.md"), supported: false },
    { id: "cursor", label: "Cursor", detected: has(".cursor") || has(".cursorrules"), supported: false },
  ];
}

export function skillTemplatePath(): string {
  // Module dir is <pkg>/src/cli (dev) or <pkg>/dist/cli (built); skill-template is
  // at the package root in both layouts.
  // Walk up from this module until skill-template/SKILL.md is found. Robust across
  // the dev layout (src/cli/) and the published layout (dist/src/cli/), where the
  // template sits at the package root alongside dist/.
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, "skill-template", "SKILL.md");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("skill-template/SKILL.md not found relative to the CLI package");
}

export function readManifest(root: string): InstallManifest | null {
  try {
    const p = path.join(root, MANIFEST_REL);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8")) as InstallManifest;
  } catch { return null; }
}

export function writeManifest(root: string, m: InstallManifest): void {
  fs.writeFileSync(path.join(root, MANIFEST_REL), JSON.stringify(m, null, 2));
}

export const IGNORE_TEMPLATE = `# ArchitectFlow ignore file — paths here are excluded from analysis IN ADDITION to
# .gitignore. One glob per line (gitignore syntax). Nothing here is ever read.
# Examples:
# **/*.generated.ts
# docs/vendor/
# packages/legacy/
`;

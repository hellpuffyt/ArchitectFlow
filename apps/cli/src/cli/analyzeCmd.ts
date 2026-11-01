import { analyze, writeArtifacts, AF_DIR } from "../engine/analyze.ts";
import { findRepoRoot } from "../engine/discovery.ts";
import { heading, ok, info, warn, fail } from "./console.ts";

export function runAnalyze(dir: string, mode: "analyze" | "update", asJson = false): number {
  const root = findRepoRoot(dir);
  const result = analyze(root);
  const w = writeArtifacts(root, result);

  if (asJson) {
    console.log(JSON.stringify({
      root, generatedAt: result.generatedAt,
      counts: { files: result.facts.files.length, nodes: result.document.nodes.length, edges: result.document.edges.length, entities: result.document.database.entities.length, endpoints: result.document.api.endpoints.length },
      change: w.changeSummary, validationErrors: w.validationErrors, files: w.files,
    }, null, 2));
    return w.validationErrors.length ? 1 : 0;
  }

  heading(`${mode} — ${root}`);
  const S = result.facts.stack;
  info(`${result.facts.files.length} files · ${S.languages.map((l) => l.name).join(", ") || "—"}${S.monorepo ? ` · monorepo (${S.workspaces.length} workspaces)` : ""}`);
  info(`frameworks: ${S.frameworks.map((f) => f.name).join(", ") || "none detected"}`);
  ok(`${result.document.nodes.length} components · ${result.document.edges.length} connections · ${result.document.database.entities.length} entities · ${result.document.api.endpoints.length} endpoints`);
  if (mode === "update" && w.changeSummary) {
    info(`changes since last run: +${w.changeSummary.added} / -${w.changeSummary.removed} / ~${w.changeSummary.modified} files (${w.changeSummary.unchanged} unchanged)`);
    if (w.versionSaved) info(`previous design snapshotted → ${w.versionSaved}`);
  }
  if (w.validationErrors.length) { warn(`${w.validationErrors.length} validation issue(s) — the design may not import cleanly:`); for (const e of w.validationErrors.slice(0, 10)) fail(e); }
  else ok("design validates against the ArchitectFlow schema rules");
  console.log("");
  ok(`Artifacts in ${AF_DIR}/: design.json, architecture.md, evidence.json, diagrams/*.mmd`);
  return w.validationErrors.length ? 1 : 0;
}

// Analysis orchestrator (spec section 10). Runs the deterministic stages in order
// and assembles the result. Pure function of the repository on disk — no network,
// no execution of repo code. AI interpretation, when a provider is configured, is a
// layer ON TOP of this (see SKILL.md); the engine itself always works without AI.

import fs from "node:fs";
import path from "node:path";
import { findRepoRoot, discover, type DiscoveryOptions } from "./discovery.ts";
import { detectStack, detectIntegrations } from "./detect.ts";
import { extractImports, detectEntryPoints, extractRoutes } from "./symbols.ts";
import { extractEntities, detectMigrations } from "./database.ts";
import { discoverInfra } from "./infra.ts";
import { detectAuth } from "./auth.ts";
import { buildModel } from "./model.ts";
import { generateDiagrams } from "./diagrams.ts";
import { generateMarkdown } from "./document.ts";
import { fingerprint, diffFingerprints } from "./fingerprint.ts";
import { validateDocument } from "./validate.ts";
import type { AnalysisFacts, AnalysisResult, Fingerprint } from "../types.ts";

export const AF_DIR = ".architectflow";

export function analyze(startDir: string, opts: DiscoveryOptions = {}): AnalysisResult {
  const root = findRepoRoot(startDir);
  const { files, skipped } = discover(root, opts);

  const stack = detectStack(root, files);
  const facts: AnalysisFacts = {
    root,
    files,
    stack,
    entryPoints: detectEntryPoints(root, files),
    imports: extractImports(root, files),
    routes: extractRoutes(root, files),
    entities: extractEntities(root, files),
    migrations: detectMigrations(root, files),
    integrations: detectIntegrations(root, files),
    infra: discoverInfra(root, files),
    auth: detectAuth(root, files),
    skipped,
  };

  const { document, evidence } = buildModel(facts);
  const diagrams = generateDiagrams(document, facts);
  const generatedAt = new Date().toISOString();
  const markdown = generateMarkdown(document, facts, evidence, diagrams, generatedAt);
  const fp = fingerprint(files);

  return { document, evidence, facts, diagrams, markdown, fingerprint: fp, generatedAt };
}

export interface WriteResult {
  outDir: string;
  files: string[];
  validationErrors: string[];
  changeSummary?: { added: number; removed: number; modified: number; unchanged: number };
  versionSaved?: string;
}

/** Write artifacts under <root>/.architectflow, preserving history (spec section 8). */
export function writeArtifacts(root: string, result: AnalysisResult): WriteResult {
  const outDir = path.join(root, AF_DIR);
  const written: string[] = [];
  fs.mkdirSync(path.join(outDir, "diagrams"), { recursive: true });

  const validationErrors = validateDocument(result.document);

  // Incremental: diff against the previous fingerprint, snapshot the prior design.
  const fpPath = path.join(outDir, "fingerprint.json");
  let prev: Fingerprint | null = null;
  try { if (fs.existsSync(fpPath)) prev = JSON.parse(fs.readFileSync(fpPath, "utf8")) as Fingerprint; } catch { prev = null; }
  const diff = diffFingerprints(prev, result.fingerprint);

  let versionSaved: string | undefined;
  const prevDesign = path.join(outDir, "design.json");
  if (fs.existsSync(prevDesign)) {
    // Never silently overwrite: snapshot the previous design into versions/ first.
    const stamp = safeStamp(readGeneratedAt(prevDesign) ?? new Date().toISOString());
    const vdir = path.join(outDir, "versions");
    fs.mkdirSync(vdir, { recursive: true });
    versionSaved = path.join(AF_DIR, "versions", `design-${stamp}.json`);
    fs.copyFileSync(prevDesign, path.join(vdir, `design-${stamp}.json`));
    written.push(versionSaved);
  }

  const write = (rel: string, content: string) => { fs.writeFileSync(path.join(outDir, rel), content); written.push(path.join(AF_DIR, rel)); };

  write("design.json", JSON.stringify({ ...result.document }, null, 2));
  write("architecture.md", result.markdown);
  write("evidence.json", JSON.stringify({ generatedAt: result.generatedAt, records: result.evidence }, null, 2));
  write("fingerprint.json", JSON.stringify(result.fingerprint));
  write("analysis.json", JSON.stringify({
    generatedAt: result.generatedAt,
    stack: result.facts.stack,
    counts: {
      files: result.facts.files.length, nodes: result.document.nodes.length, edges: result.document.edges.length,
      entities: result.document.database.entities.length, endpoints: result.document.api.endpoints.length,
    },
    change: diff,
    validationErrors,
  }, null, 2));
  for (const [name, mmd] of Object.entries(result.diagrams)) write(path.join("diagrams", `${name}.mmd`), mmd);

  return { outDir, files: written, validationErrors, changeSummary: { added: diff.added.length, removed: diff.removed.length, modified: diff.modified.length, unchanged: diff.unchanged }, versionSaved };
}

function readGeneratedAt(_designPath: string): string | null {
  return null; // design.json holds the document only; timestamp comes from the file mtime via safeStamp fallback
}
function safeStamp(iso: string): string {
  return iso.replace(/[:.]/g, "-").replace(/[^0-9A-Za-z-]/g, "");
}

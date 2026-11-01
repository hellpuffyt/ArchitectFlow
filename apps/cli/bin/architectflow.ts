#!/usr/bin/env node
// ArchitectFlow CLI entrypoint. Dependency-free argument handling; each command
// lives in src/cli/*. Exit code is non-zero on validation failure or error.

import { runInit } from "../src/cli/init.ts";
import { runAnalyze } from "../src/cli/analyzeCmd.ts";
import { runDoctor } from "../src/cli/doctor.ts";
import { runUninstall } from "../src/cli/uninstall.ts";

const VERSION = "0.1.0";

const HELP = `ArchitectFlow ${VERSION} — install a source-grounded architecture skill in your repo.

Usage: architectflow <command> [options]

Commands:
  init         Install the Claude Code skill and project files (preserves existing config).
  analyze      Analyze the repository and write the design + diagrams to .architectflow/.
  update       Re-analyze; snapshot the previous design and report what changed.
  doctor       Check the installation, environment and last analysis.
  uninstall    Remove only ArchitectFlow-owned files (add --purge to also drop .architectflow/).

Options:
  --dir <path>   Repository directory (default: current working directory).
  --json         Machine-readable output (analyze/update).
  --purge        uninstall: also remove the generated .architectflow/ directory.
  -h, --help     Show this help.
  -v, --version  Show version.
`;

function getOpt(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function main(argv: string[]): number {
  const args = argv.slice(2);
  if (args.includes("-h") || args.includes("--help") || args.length === 0) { console.log(HELP); return 0; }
  if (args.includes("-v") || args.includes("--version")) { console.log(VERSION); return 0; }

  const cmd = args[0];
  const dir = getOpt(args, "--dir") ?? process.cwd();
  const asJson = args.includes("--json");

  switch (cmd) {
    case "init": return runInit(dir);
    case "analyze": return runAnalyze(dir, "analyze", asJson);
    case "update": return runAnalyze(dir, "update", asJson);
    case "doctor": return runDoctor(dir);
    case "uninstall": return runUninstall(dir, args.includes("--purge"));
    default: console.error(`Unknown command: ${cmd}\n`); console.log(HELP); return 2;
  }
}

try {
  process.exit(main(process.argv));
} catch (err) {
  console.error("ArchitectFlow error:", (err as Error).message);
  process.exit(1);
}

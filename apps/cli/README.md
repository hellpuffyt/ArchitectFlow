# architectflow

Install **ArchitectFlow** into any repository. Your AI coding agent (Claude Code today)
then reads the real source and generates a **source-grounded, evidence-backed system
design** — components, data model, APIs, infrastructure, security, and C4 diagrams —
where every claim is traceable to a file and line.

> Part of [ArchitectFlow](https://github.com/hellpuffyt/ArchitectFlow). The web app lets you
> design a system as structured data; this package does the reverse — it derives a design
> from code you already have, in the same document format the web app understands.

## Quick start

```bash
# in your repository
npx architectflow init       # install the Claude Code skill + project files
npx architectflow analyze    # analyze the repo -> .architectflow/
```

Then, in Claude Code:

```
/architectflow  Analyze this codebase and generate its system design.
```

## Commands

| Command | What it does |
|---|---|
| `architectflow init` | Detects the repo root and agent environment, installs `.claude/skills/architectflow/SKILL.md`, creates `.architectflowignore` (only if absent), records an install manifest, and prints a privacy notice. Preserves all existing files. |
| `architectflow analyze` | Runs the deterministic analysis engine and writes `.architectflow/` (design, document, diagrams, evidence). `--json` for machine-readable output. |
| `architectflow update` | Re-analyzes, snapshots the previous design under `.architectflow/versions/`, and reports added/removed/modified files. |
| `architectflow doctor` | Checks Node version, the installation, the engine, and the last analysis. |
| `architectflow uninstall` | Removes **only** ArchitectFlow-owned files (from the manifest). `--purge` also drops `.architectflow/`. |

Options: `--dir <path>` (default: cwd), `--json` (analyze/update), `--purge` (uninstall).

## What it produces (`.architectflow/`)

- `design.json` — the architecture as an ArchitectFlow document (`schema_version: 1`), ready to
  import into the web app. Validated locally against the schema's hard rules on every run.
- `architecture.md` — the written design: **A** overview, **B** architecture, **C** data,
  **D** flows, **E** infrastructure, **F** security, **G** assessment.
- `diagrams/*.mmd` — Mermaid: `context`, `container`, `component`, `service-dependencies`,
  `entity-relationship`, `data-flow`, `auth-sequence`, `deployment` (C4 concepts where they fit).
- `evidence.json` — for every element, the file + line range and relationship it came from.
- `analysis.json` — stack summary, counts, change summary, validation status.

See [`examples/example-architecture.md`](examples/example-architecture.md) for a real document
(ArchitectFlow analyzing itself).

## How it works

The analysis engine is **deterministic and local-first** (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)):
discovery → language/framework detection → import & route extraction → database schema analysis →
infrastructure discovery → architecture modelling → diagram & document generation → evidence
validation. It traces **real imports, entry points and route declarations** — it does not infer
runtime architecture from a dependency list. AI, when configured, interprets and explains on top;
**the engine always works with no AI provider and no network.**

Every architectural element is labelled **✅ verified** (direct source evidence), **🟡 inferred**,
**💡 recommendation**, or **❔ unknown/externally configured** — observed facts are never mixed
with guesses.

## Privacy & security

See [docs/PRIVACY.md](docs/PRIVACY.md). In short: analysis runs locally and uploads nothing;
`.env` files, keys and certificates are **never read**; repository scripts are **never executed**;
`.gitignore` and `.architectflowignore` are honoured; repository text is treated as untrusted input.

## Supported languages & frameworks

See [docs/SUPPORT_MATRIX.md](docs/SUPPORT_MATRIX.md). Troubleshooting: [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

## Requirements

Node.js ≥ 20.9. No other runtime dependencies.

## Versioning

Semantic versioning. `init` records the installer version in the manifest; `doctor` warns when the
installed skill drifts from the CLI version, and `init` re-applies the current skill.

## License

MIT OR Apache-2.0.

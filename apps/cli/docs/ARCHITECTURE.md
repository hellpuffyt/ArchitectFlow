# Engine architecture

ArchitectFlow's analysis is a pipeline of small, single-purpose modules (not one large prompt).
Deterministic analysis does the discovery and extraction; AI, when configured, interprets on top.

```
discovery (walk + ignore + privacy)        src/engine/discovery.ts, ignore.ts, privacy.ts
      |
detection (languages/frameworks/build)     src/engine/detect.ts
      |
symbol extraction (imports/entries/routes) src/engine/symbols.ts
database schema analysis                    src/engine/database.ts
infrastructure discovery                    src/engine/infra.ts
authentication discovery                    src/engine/auth.ts
      |  -> AnalysisFacts (src/types.ts)
architecture modelling                      src/engine/model.ts   (facts -> ArchitectureDocument + evidence)
      |
diagram generation                          src/engine/diagrams.ts
documentation generation                    src/engine/document.ts
evidence/structural validation              src/engine/validate.ts
fingerprinting (incremental)                src/engine/fingerprint.ts
      |
orchestration + artifact writing            src/engine/analyze.ts
```

## Principles
- **Deterministic first.** The same repository yields the same design. AI is for interpretation and
  explanation, never for inventing structure. Missing AI credentials never block analysis.
- **Evidence or it did not happen.** Every node/edge/entity/endpoint carries a confidence label and
  a source reference; `evidence.json` holds the full ledger.
- **Schema-faithful output.** `model.ts` only emits what the ArchitectFlow `ArchitectureDocument`
  schema accepts (registry node types, id/name patterns, rooted API paths, scalar node/edge
  properties, no `properties` on endpoints). `validate.ts` mirrors the server's import gate so a
  generated design is rejected locally before it could be rejected remotely.
- **Safe by construction.** No execution of repo code; sensitive files are never read; untrusted
  repository text never becomes instructions.

## Incremental updates
`fingerprint.ts` hashes each in-scope file. `update` diffs the new fingerprint against the stored
one (added/removed/modified), snapshots the previous `design.json` into `.architectflow/versions/`,
and never silently overwrites history.

## Web integration seam
A generated `design.json` is a complete `ArchitectureDocument`. The web app ingests it exactly like
an import or AI output: `POST /api/projects` then `PUT /api/projects/{id}/document` with
`source: "import"`, gated by the same `validate-document` + integrity check. The CLI validates the
document against those rules locally first.

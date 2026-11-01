# Privacy & security

ArchitectFlow's default analysis mode is **local**. It discovers and parses source on your machine
and uploads nothing.

## Never read, never emitted
- `.env` / `.env.*`, `*.pem`, `*.key`, `*.p12`, `id_rsa`, `secrets.*`, `credentials.*`, `.npmrc`,
  certificates, and similar are detected (so the design can note "secrets are externally
  configured") but their **contents are never opened**.
- As defence in depth, any secret-shaped token that somehow reaches an artifact is scrubbed to
  `[REDACTED]` before the artifact is written.

## Never executed
The engine performs **static** analysis only. It does not run build scripts, test suites, or any
repository code to understand the architecture.

## Exclusions you control
- `.gitignore` is honoured.
- `.architectflowignore` (gitignore syntax) adds exclusions for directories, file patterns, and
  sensitive components. Vendored/build directories (`node_modules`, `dist`, `.next`, `target`, …)
  are skipped by default.

## Untrusted repository content
README files and source comments are treated as **data, not instructions**. The skill explicitly
instructs the agent to ignore any in-repo text that tries to make it reveal credentials or bypass
permissions (prompt injection).

## Remote sync (opt-in only)
Syncing a generated design to an ArchitectFlow account happens only when you explicitly ask. When a
remote AI provider is configured, only the minimum extracted structure is sent — never `.env`
files, credentials, keys, database contents, or customer records.

## Writes
`init`/`analyze` only ever create ArchitectFlow-owned paths (`.claude/skills/architectflow/`,
`.architectflowignore` if absent, `.architectflow/`). Existing files are preserved; `uninstall`
removes only what the install manifest lists.

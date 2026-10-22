# Known limitations

- **Collaboration:** projects have one owner. Read-only share links exist; editor roles and
  real-time co-editing do not. Concurrent edits from two tabs are detected (409) and resolved by
  the user, not merged.
- **AI:** without a key the app uses deterministic templates (labeled everywhere). The OpenAI-
  compatible and Anthropic providers are tested against local mock HTTP servers only; the quality
  of real model output is not evaluated. The example design assistant understands a documented
  vocabulary (see the Design assistant tab) and changes nothing otherwise.
- **Rate limits** are in-memory per API process; run one worker per container or add a shared store.
- **Screens:** the canvas and page designer are built for ≥ 1024 px; on phones navigation and
  forms work but graph editing is impractical.
- **Theme:** the app shell has one complete dark theme; user themes (light/dark/system) are
  previewed in the design studio.
- **Diagrams** are export-only; only JSON/bundles re-import. Sequence diagrams are derived from
  journeys and edges, not from real call traces. Deployment diagrams use groups and replicas only.
- **Undo/redo** is per browser tab and in memory; version history is the durable record.
- **Revisions** grow without pruning; each save stores the full document (≤ 2 MB).
- **Docker:** verified natively on arm64; amd64 only under QEMU emulation. Trivy reports 43–44 HIGH OS-package findings per image with no Debian fix available (0 CRITICAL, 0 fixable).
- **Email:** no verification, password reset or 2FA.
- **Accessibility:** keyboard paths exist for the main flows (tested: sign-in, workspace navigation,
  canvas shortcuts, connection list); no full screen-reader audit was performed.
- **Dev dependency advisory:** `npm audit` reports GHSA-vfj7-8cjw-p6xm (`braces` ≤ 3.0.3, no
  patched release) via `eslint-config-next` → `fast-glob`. It is lint tooling only and not part of
  the production dependency tree (`npm audit --omit=dev`: 0 vulnerabilities).

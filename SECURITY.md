# Security policy

## Reporting a vulnerability

Please report vulnerabilities **privately** through GitHub's private vulnerability reporting:
<https://github.com/hellpuffyt/ArchitectFlow/security/advisories/new>.
Do not open a public issue. Include steps to reproduce, the affected version or commit, and the
impact you observed. You will get an acknowledgement as soon as the maintainer can review it;
this is a volunteer project without a guaranteed response time.

## Supported versions

Only the latest `main` and the latest release receive fixes. ArchitectFlow is **experimental
(0.1.0)** and has not had an external security audit.

## Security model (summary)

See [docs/SECURITY_MODEL.md](docs/SECURITY_MODEL.md) for details.

- Passwords: argon2id. Sessions: random 256-bit tokens in `httpOnly`, `SameSite=Lax` cookies
  (`Secure` by default), stored server-side as SHA-256 hashes; every state-changing request needs
  a per-session CSRF header.
- Every project route checks ownership on the server; other users get `404` (no existence leak).
  Share links are random 256-bit tokens, stored hashed, read-only, expiring and revocable.
- AI provider keys stay on the server. Without a configured provider the app runs in a labeled,
  deterministic example mode and sends nothing anywhere.
- Model output and imported files are untrusted: they pass schema and graph-integrity validation
  before anything is stored, and change sets are reviewed by a person before they are applied.
- Exports escape user text for Mermaid/PlantUML/Markdown/SQL; the UI never renders user content as HTML.

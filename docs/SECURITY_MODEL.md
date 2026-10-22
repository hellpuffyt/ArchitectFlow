# Security model

ArchitectFlow is experimental and has not been audited. This document states what the code
does and what it does not do.

## Assets
Private designs (requirements, architecture, data model, UI), account credentials, AI provider
keys, share links.

## Controls

| Threat | Control | Verified by |
|---|---|---|
| Another user reads/edits a project (IDOR) | Every project route filters by `owner_id`; non-owners get **404** (no existence leak); IDs are UUIDv4 | `tests/test_authz.py`, `e2e/authz.spec.ts`, `e2e/core-journey.spec.ts` |
| Cross-site request forgery | Writes require `x-csrf-token` matching the session; JSON-only bodies; `SameSite=Lax` cookies | `test_csrf_required_for_writes` |
| Credential theft | argon2id; session tokens (256-bit) stored as SHA-256; `httpOnly`, `Secure` by default; login rate limit | `test_signup_me_logout`, `test_duplicate_signup_and_bad_login` |
| Share-link guessing / leaks | 256-bit tokens stored hashed, expiry ≤ 30 days, revocable, read-only, no exports through links | `test_share_links_read_only_expiring_revocable`, `e2e/workflow.spec.ts` |
| Malicious AI output / imports | Typed operations + schema + graph integrity before storage; user review before apply; text in the design is treated as data in provider prompts | `test_openai_provider_malicious_output_is_rejected_by_validation`, `test_provider_output_that_breaks_the_graph_is_rejected` |
| Injection into exports | Mermaid/PlantUML ids remapped, labels escaped; SQL identifiers validated and quoted; Markdown cells escaped | `test_mermaid_escaping_blocks_injection`, `test_sql_quotes_reserved_words` |
| XSS in the UI | React renders text only; no `dangerouslySetInnerHTML`; `X-Content-Type-Options`, `X-Frame-Options: DENY` | code review |
| Resource abuse | Body size limit (2 MB), schema list limits (500 nodes, 2000 edges, 100 pages…), layout depth ≤ 12, AI and export rate limits | `test_layout_depth_limit` |
| Provider key exposure | Keys only in server env; never returned by any endpoint; misconfiguration reported without the key | `test_missing_key_is_reported_and_non_ai_features_still_work` |

## Data processing and retention

- Designs are stored in your PostgreSQL database until you delete the project or your account.
  Revisions are kept indefinitely (there is no automatic pruning yet).
- In example mode nothing leaves the server. With a configured provider, the current design
  (excluding viewport and prompt settings) and your request text are sent to that provider; the UI
  shows a notice naming the provider. Its retention is governed by your agreement with it.
- **Account → Export my data** downloads everything stored for you; **Delete account** removes
  the user and cascades to projects, revisions, prompts and share links.
- Audit events record actions (no document contents, no passwords or tokens).

## Not covered
No 2FA, no email verification or password reset, no per-project sharing with edit rights, no
WAF/bot protection, rate limits are per process, no automated DAST. The UI is an editor for
trusted users of one deployment; multi-tenant hosting would need additional isolation review.

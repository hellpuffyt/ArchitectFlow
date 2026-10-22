# Production readiness — evidence

**Classification: Partially Verified.** Everything in the acceptance lists below is exercised by
automated tests that pass on the author's machine, including from a clean clone. It is *not*
classified Production-Ready because: CI has not yet run on GitHub; the Docker images were built
and run on arm64, and on amd64 only under emulation; real LLM providers are tested
only against local mock HTTP servers; and there has been no external security review, load test or
screen-reader audit. Independent verification by the maintainer is pending.

Tested commit: see the commit that adds this file (`git log -1 -- docs/PRODUCTION_READINESS.md`);
code under test is identical to `12afa2f`. Date: 2026-10-22.

## Scope and architecture
A Next.js web app and a FastAPI service backed by PostgreSQL. One versioned JSON document per
project revision covers requirements, the architecture graph, database and API design, and the
UI/UX design. Every write passes a schema and integrity gate, and AI proposals are reviewable
change sets. See [ARCHITECTURE.md](ARCHITECTURE.md).

## Platforms and prerequisites
Verified on macOS 27 (Apple M5): Python 3.12 via uv 0.12, Node 24.19, PostgreSQL 17.11
(Homebrew), and Chromium via Playwright 1.64. Linux is expected to work and is configured in CI,
but CI has not run yet. Windows has not been tested; the shell scripts need bash.

## Clean-clone verification (README followed literally)
1. `git clone` of the repository at `12afa2f` into a **234-character** path in a scratch directory.
   The public GitHub URL did not exist yet, so the local repository was cloned instead.
2. Quick start: `scripts/dev.sh`. The API was healthy and the web app served `/login` after 20 s.
   Then, through the web origin: sign up → create project → generate (example mode) → apply
   (9 nodes, 10 edges, revision 2) → findings → prompt v1 with `source_revision` 2.
3. Testing block, with no edits to the commands:

| Command | Result |
|---|---|
| `scripts/dev-db.sh start` | started on 127.0.0.1:54329, exit 0 |
| `cd apps/api && uv run pytest` | **114 passed**, exit 0 (at `12afa2f`; 115 after the requirement-conflict test in `185ca81`) |
| `cd apps/web && npm test` | **46 passed** (6 files) |
| `npx playwright test` | **19 passed, 2 skipped** (both opt-in, see below) |
| `ARCHITECTFLOW_E2E_STOP_DB=1 npx playwright test -g "PostgreSQL down"` | **1 passed** |
| `bash scripts/test-dev-db.sh` | PASS (cluster from a 245-char path) |

Opt-in specs: *PostgreSQL down* stops the local cluster, so it was run explicitly (above).
*README screenshots* writes image files and was run once to produce `docs/screenshots/`.

Stability: `core-journey.spec.ts --repeat-each=20 --workers=1` passed **20/20** under synthetic
CPU load (load average 8 → 72 on 10 cores; author's working copy at `00fcf66`), and again 20/20
in the clean clone (see "Repeat run" below).

## Other checks run
| Check | Result |
|---|---|
| `ruff format --check`, `ruff check`, `mypy --strict` (API) | clean |
| `npm run lint`, `npm run typecheck`, `next build` (web) | clean, build succeeds |
| `pip-audit` | no known vulnerabilities |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `npm audit` (incl. dev) | 5 high: GHSA-vfj7-8cjw-p6xm (`braces` ≤ 3.0.3, no fixed release) via `eslint-config-next` lint tooling; not shipped |
| Secret scan of every commit (tokens, keys, local paths) | no matches |
| OpenAPI export validated against 3.1; DDL export executed on PostgreSQL | pass (`tests/test_exports.py`) |
| CI (GitHub Actions) | **not yet run** |
| Docker build / compose | **built and run locally on arm64** (see Docker section); CI not yet run |

## Acceptance checklist — original Project 7 list

| # | Item | Expected | Test / command | Result |
|---|---|---|---|---|
| 1 | Create and save a project | project persists | `e2e/core-journey.spec.ts`, `test_project_crud_search_archive_duplicate_delete` | pass |
| 2 | Vision → valid architecture (provider or labeled example) | labeled example mode, valid graph | core journey (asserts "Example mode" label), `test_generate_review_apply_persists` | pass |
| 3 | Graph renders real nodes/connections | every saved node and edge on canvas | core journey (count = saved count) | pass |
| 4 | Move nodes, create/edit connections | position and edge saved | core journey, `architecture.spec.ts › edges` | pass |
| 5 | Edits persist after reload | saved doc identical | core journey (`toEqual` before/after reload) | pass |
| 6 | Undo/redo | reverts and reapplies, persisted | core journey, `edges` spec, `lib/history.test.ts` | pass |
| 7 | AI changes validated + reviewed before apply | nothing stored before Apply | core journey, `test_ai_edit_is_reviewed_before_apply`, `test_regenerating_over_a_design_requires_confirmation` | pass |
| 8 | Invalid graph data rejected with actionable errors | 422 with paths, nothing saved | `workflow.spec.ts › (8)`, `test_invalid_document_rejected_with_actionable_errors`, `test_integrity_errors_block_parse` | pass |
| 9 | Findings from actual architecture data | evidence quotes saved data | core journey, `workflow.spec.ts › (9)`, `test_validation.py` (24) | pass |
| 10 | Prompt reflects current saved graph | contains the edited edge, records source revision | core journey, `test_prompt_reflects_current_saved_revision` | pass |
| 11 | Copy and export produce usable output | clipboard = Markdown file; exports parse | core journey, `workflow.spec.ts › (11)(12)`, `test_exports.py` | pass |
| 12 | Version history restores a previous design | restored doc equals the earlier revision | core journey, `test_version_history_restore` | pass |
| 13 | Other users can't read/edit private projects | 404 in UI and API | core journey, `authz.spec.ts`, `test_authz.py` | pass |
| 14 | Install works from a clean checkout | README commands succeed | clean-clone run above | pass (local clone; GitHub clone after publication) |
| 15 | Automated tests and CI run with real results recorded | recorded | this file | local: pass; **CI: not yet run** |

## Acceptance checklist — UI/UX Design Studio

| # | Item | Test | Result |
|---|---|---|---|
| 1 | Create project + open UI/UX workspace | `design.spec.ts › theme editor` | pass |
| 2 | Change colors, typography, component styles | same (HEX, HSL, base size, font, button style/radius) | pass |
| 3 | Live preview updates from the actual tokens | same (reads CSS variables), `design.test.tsx` | pass |
| 4 | Create page, add/edit components | `design.spec.ts › page designer` (add page, heading, drag grid + stats) | pass |
| 5 | Layout changes persist after reload | page designer spec (saved layout asserted after reload) | pass |
| 6 | Responsive previews apply breakpoint rules | page designer spec (3/2/1 columns), `design.test.tsx`, `layout.test.ts` | pass |
| 7 | Undo/redo for design changes | theme editor spec | pass |
| 8 | Routes + journeys | page designer spec (journey steps saved) | pass |
| 9 | Link UI to existing APIs + entities | page designer spec (`endpoint_id`/`entity_id` saved) | pass |
| 10 | Validation detects broken references | page designer spec (endpoint deleted → finding), `test_ui_rules_detect_intentionally_broken_references` | pass |
| 11 | AI proposals previewed + approved first | page designer spec (theme unchanged until Apply) | pass |
| 12 | Prompt reflects architecture, theme, pages, components, interactions | page designer spec, `test_prompt_includes_design_and_pages` | pass |
| 13 | Tokens + design specs export correctly | theme editor spec (JSON + CSS downloads), page designer spec (design spec, page flow) | pass |
| 14 | Private data protected server-side | `design.spec.ts › (14)` | pass |
| 15 | Whole workflow passes automated tests | all suites above | pass locally |

## The 20-item test list

| # | Area | Evidence | Result |
|---|---|---|---|
| 1 | Project create/rename/duplicate/archive/delete | `test_project_crud_search_archive_duplicate_delete` | pass |
| 2 | Requirements create/edit/delete, assumptions confirmed, actors/constraints, conflicts | `e2e/requirements.spec.ts` (real browser + PostgreSQL: edit/add/delete functional and non-functional requirements, confirm an assumption, edit a role and a constraint, reload → saved document identical, *Conflicting requirements* finding from saved data, prompt shows CONFIRMED vs ASSUMPTION with the new `source_revision`); `test_requirement_conflicts_from_saved_data` | pass — `--repeat-each=5 --workers=1`: 5/5 |
| 3 | Example-mode generation | core journey, `test_example_provider_is_deterministic_and_labeled` | pass |
| 4 | Architecture editing | core journey, `edges` spec | pass |
| 5 | Undo/redo | core journey, theme spec, `history.test.ts` | pass |
| 6 | Autosave + reload | core journey, vertical-slice spec | pass |
| 7 | Conflict detection | `test_save_roundtrip_identical_and_conflict`, `test_changeset_goes_stale_when_design_changes` | pass (API level) |
| 8 | Validation engine | `test_validation.py`, `test_design.py` | pass |
| 9 | Theme editor + live preview | theme editor spec | pass |
| 10 | Page designer + responsive | page designer spec | pass |
| 11 | API + DB mapping | page designer spec (UI→API/entity), `test_openapi_is_valid_31`, `test_sql_ddl_executes_on_real_postgres` | pass |
| 12 | Prompt generation + OUTDATED | core journey, `architecture.spec.ts › prompt` | pass |
| 13 | Exports | `test_exports.py`, `test_exports_endpoint`, workflow spec | pass |
| 14 | Version restore | core journey, restore regression spec | pass |
| 15 | Sharing | `test_share_links_read_only_expiring_revocable`, workflow share spec | pass |
| 16 | Authorization / IDOR | `test_authz.py`, `authz.spec.ts`, core journey | pass |
| 17 | Import validation | `workflow.spec.ts › (8)` | pass |
| 18 | DB / AI provider unavailable | `test_failures.py` (missing key 503, unreachable 502, timeout 504, 429, 401, 500, bad JSON, invalid ops 422, DB down 503 — real sockets/servers); E2E PostgreSQL-down spec (real cluster stop) | pass |
| 19 | Clean-checkout install | clean-clone run above | pass (local clone) |
| 20 | Production build + deployment workflow | `next build`; Docker images built; `docker compose up` + core journey 3/3 against the containers; restart persistence; `down -v` clean | pass on **arm64** (Colima); amd64 built and core journey 1/1 under QEMU emulation; CI not yet run |

## Docker / Compose verification (2026-10-22)
Environment: Colima on macOS (Docker Engine 29.5.2, Ubuntu 24.04 VM, kernel 6.8, **arm64**,
2 CPUs, 4 GB RAM), Docker Compose 5.6.1, buildx 0.38.1.

| Step | Result |
|---|---|
| `docker compose build api`, then `web` (BuildKit, one at a time due to the 4 GB VM) | both built; api 667 MB, web 1.16 GB at first (arm64); web 410 MB after the standalone change |
| `docker compose up -d`, first attempt | **defect found:** the API exited because `uv run` could not create `/home/app/.cache/uv` (the system user has no home directory). Fixed in `240ebdf` by running the image's virtualenv directly |
| `docker compose up -d` after the fix | db healthy, API healthy in 9 s; `alembic upgrade head` ran in the container (`alembic_version = 0001`) |
| `ARCHITECTFLOW_E2E_BASE_URL=http://localhost:3000 npx playwright test e2e/core-journey.spec.ts --repeat-each=3 --workers=1` against the compose stack | **3 passed (41.6 s)**, with `Secure` cookies on localhost |
| `docker compose restart` | data persisted (6 users and 30 revisions both before and after) |
| `docker compose down -v` | 0 ArchitectFlow containers, volumes or networks left (built images kept) |
| Image hygiene | non-root users (`app` uid 10001, `node` uid 1000); no `.env*` files in the image filesystem; `docker history` shows only upstream base-image layers; configuration comes from runtime environment variables |

Not verified:
- **amd64 images:** this machine is arm64; CI builds amd64 once it runs.
- **The TLS reverse proxy.**

(The web image was later reduced from 1.16 GB to 410 MB with the standalone output; see the scan section.)

## Image vulnerability scan (Trivy 0.76.1, `trivy image --scanners vuln,secret`)

| Image | Image ID | OS | CRITICAL | HIGH | MEDIUM | LOW | UNKNOWN | Fixable | Secrets |
|---|---|---|---|---|---|---|---|---|---|
| web **before** | `sha256:2e022d9033db…f960c` | Debian 12.15 | **1** (zlib1g CVE-2023-45853, no Debian fix) | 60 | 94 | 84 | 1 | 3 HIGH, 7 MEDIUM, 1 LOW | 0 |
| web **after** | `sha256:53fdaa48452881731d895ee12e1ce46bec681a77b9d986eef8ed6cb0ee5d96ef` | Debian 13.7 | **0** | 43 | 58 | 60 | 1 | **0** | 0 |
| api **before** | `sha256:c49a879a499a…bde7b` | Debian 13.7 | 0 | 44 | 63 | 62 | 1 | 5 MEDIUM, 1 LOW (pip) | 0 |
| api **after** | `sha256:a449e30b48d4795602d54890bf036cf8a8a68838e7a7cbf58064613004276fff` | Debian 13.7 | **0** | 44 | 58 | 61 | 1 | **0** | 0 |

Images are local builds and have no registry RepoDigests; the IDs above are `docker image inspect --format '{{.Id}}'`.

What changed:
- **Web.** The 3 fixable HIGH findings (brace-expansion ×2, undici) and the fixable MEDIUM/LOW
  findings were all inside the **npm CLI bundled with the Node base image**, not in app
  dependencies. The runtime stage now uses Next.js `output: "standalone"` on `node:24-trixie-slim`
  and deletes npm, npx, corepack and yarn. The CRITICAL zlib1g finding disappeared with the move
  from Debian 12 to Debian 13. Size (`docker images`): 1.16 GB → **410 MB**.
- **API.** The fixable findings were the base image's unused `pip`; it is uninstalled. The app runs
  from `/app/.venv`.
- **Remaining.** 43–44 HIGH per image are Debian 13 OS packages with **no fixed version available**.
  These images are therefore *not* free of HIGH findings.

Re-verification of the rebuilt images:
- Compose up: healthy in 6 s; migrations at `0001`.
- Core journey against the containers: **3/3** passed.
- Local-mode Playwright: 20 passed, 2 opt-in skipped.
- Vitest 46/46; lint and typecheck clean.

## amd64 images (QEMU emulation on the arm64 Colima VM)
- `docker run --privileged --rm tonistiigi/binfmt --install amd64`, then
  `docker buildx build --platform linux/amd64 --load` for each image, capped at 25 min per image.
  - api built in **270 s**: `sha256:cffa6c120f411a7572c4866cbf372d3202ea97f8693656529311b54e93862fe0`
  - web built in **571 s**: `sha256:30c72669f28c02d8c717a9c9dfa84c45c31a22d3aea09a6de94e1e57b2626007`
  - No out-of-memory errors in the 4 GB VM.
- Ran both images as a Compose stack under emulation: containers report `x86_64`, the stack was
  healthy in 30 s, and the **core journey passed 1/1** against it.
- Trivy, amd64: api CRITICAL 0 / HIGH 44 / fixable 0 / secrets 0; web CRITICAL 0 / HIGH 43 /
  fixable 0 / secrets 0.
- Caveat: emulation proves the images build and run correctly. It says nothing about native amd64
  performance.

## Bugs found and fixed (each with a regression test)
- A modal left a hidden previous route inert → `regression: a modal opened before navigation…`
- A stale native `close` event closed a quickly reopened dialog → `edges` spec (cancel, then reopen)
- Duplicate dialog ids gave dialogs the wrong accessible name → `regression: each dialog has its own accessible name`
- "Saved" was shown while a restore/apply/import was in flight (intermittent core-journey
  failure) → `regression: status shows Saving…`. The regression test fails without the fix.
- The dev PostgreSQL socket exceeded the path limit in deep clones → `scripts/test-dev-db.sh`. The
  test fails without the fix.
- The API container exited at start because `uv run` needed a home-directory cache (found by running the compose stack; verified by the compose E2E run above)
- The default light primary color, the default dark primary, and one preset failed WCAG AA → `test_every_preset_meets_wcag_aa`, `test_default_theme_meets_aa`
- "PostgreSQL" was inferred as a blog-post entity → assertion in `test_generate_review_apply_persists`
- The "developer tool" design request was a no-op → `test_example_design_vocabulary`

## Known limitations and unresolved risks
See [LIMITATIONS.md](LIMITATIONS.md). Key risks:
- Rate limits are per process.
- No 2FA, password reset or email verification.
- Real LLM output quality is not evaluated.
- Revisions are not pruned.
- Single-owner projects only.

## Explicitly unverified (with reason)
- **Native amd64 hardware:** amd64 images were built and run under QEMU emulation only.
- **Live OpenAI-compatible / Anthropic providers:** no provider credentials exist. The HTTP
  handling is tested against local servers (unreachable, timeout, 429, 401, 500, malformed
  output), but not against the real services.
- **GitHub Actions:** the repository is not published yet, so CI has never run.

## Needed for further verification
- GitHub Actions run (Ubuntu): API, web, E2E with a Postgres service, the deep-path script and Docker builds.
- A native amd64 Docker host (or CI) for performance-representative runs.
- An API key for each real provider to run a live smoke test.
- An external security review and a screen-reader audit.

## Repeat run (clean clone)
`npx playwright test e2e/core-journey.spec.ts --repeat-each=20 --workers=1` in the 234-char clone of
`12afa2f`, with 8 CPU-burning processes running: **20 passed (4.6 min)**. Load average was
6.6 before the run and 21.6 after it.

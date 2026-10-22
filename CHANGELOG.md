# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]
### Fixed (deep audit, each with a regression test that fails on the previous code)
- Documents containing `NaN`/`Infinity`, NUL characters (U+0000) or nesting deeper than 64
  levels were accepted by validation and then failed in PostgreSQL with HTTP 500 (or 500 from
  FastAPI's error encoder on deep bodies); they are now 422 with the field path. NUL in other
  text inputs (project name, AI requests) and out-of-range revision numbers no longer return 500.
- Integrity errors reported the rule name as `path`; they now give the field path
  (`edges.3.target`) plus `rule`. Every finding class now carries a resolvable location.
- Duplicate ids for groups, actors, workflows, requirements, constraints, assumptions,
  decisions, acceptance criteria and entity fields; a node in two groups or with a `group_id`
  that disagrees with the group; and routes differing only in path-parameter names were not
  detected.
- `sync-cycle` reported only the first cycle a depth-first search met, so services on other
  cycles through the same nodes went unreported; it now reports each strongly connected group.
- Foreign keys PostgreSQL would reject (non-unique target, incompatible type) were not reported.
- SQL DDL could emit colliding index/constraint names; OpenAPI could emit duplicate
  `operationId`s; Mermaid subgraph ids depended on member counts; long Mermaid labels could be
  cut inside an escape sequence; newlines/pipes in component text broke the prompt's table.
- Restoring a revision of an archived project was allowed.
- Web: restore, import and AI proposals started right after saving pending edits sent the
  pre-save head revision and always failed with 409.

## [0.1.0] - 2026-10-22
### Added
- Versioned architecture document (requirements, graph, database, API, UI design) with an
  integrity gate and immutable revisions, restore and conflict detection.
- Graph editor, requirements/journeys/database/API/security workspaces, UI/UX Design Studio
  (theme tokens with live preview, page designer, journeys, prototype mode).
- Deterministic validation (81 rule ids at release, incl. conflicting/duplicate requirements) with evidence and remediation.
- AI change sets with review before apply; example mode; OpenAI-compatible and Anthropic providers.
- Prompt generator (8 modes × 3 presets) tied to saved revisions with OUTDATED marking.
- Exports (JSON, bundle, Mermaid, PlantUML, C4, sequence, ERD, data-flow, dependencies,
  deployment, PostgreSQL DDL, OpenAPI 3.1, specs, tokens JSON/CSS, page flow, route map).
- Read-only share links, account export and deletion, audit events.
### Fixed (during development, with regression tests)
- Modal dialogs left the next page inert after navigation; stale close events closed reopened
  dialogs; duplicate dialog ids gave wrong accessible names.
- The UI showed "Saved" while a restore/apply/import was still in flight.
- Dev database failed to start from long checkout paths (Unix socket path limit).
- Theme defaults and a preset failed WCAG AA contrast.

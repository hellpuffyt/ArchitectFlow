# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.1.0] - 2026-10-22
### Added
- Versioned architecture document (requirements, graph, database, API, UI design) with an
  integrity gate and immutable revisions, restore and conflict detection.
- Graph editor, requirements/journeys/database/API/security workspaces, UI/UX Design Studio
  (theme tokens with live preview, page designer, journeys, prototype mode).
- Deterministic validation (79 rule ids) with evidence and remediation.
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

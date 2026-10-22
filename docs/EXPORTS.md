# Exports

`GET /api/projects/{id}/exports` lists formats; `GET /api/projects/{id}/exports/{format}?revision=N`
downloads one (owner only; not available through share links).

| Format | Re-importable | Notes |
|---|---|---|
| `json`, `bundle` | **yes** | Validated on import; the bundle wraps the document with metadata. |
| `mermaid`, `dataflow`, `dependencies`, `deployment` | no | Flowcharts; ids remapped to `n0…`, labels escaped. |
| `c4-context`, `c4-container` | no | Mermaid C4 syntax. Actors become persons; external APIs external systems. |
| `sequence` | no | One sequence per saved system journey; message labels come from edges between steps. |
| `erd` | no | Mermaid `erDiagram` from entities and foreign keys. |
| `plantuml` | no | Component diagram. |
| `sql` | no | PostgreSQL DDL; executed against PostgreSQL in the test suite. |
| `openapi` | no | OpenAPI 3.1; validated with `openapi-spec-validator` in tests. |
| `spec`, `design-spec`, `components` | no | Markdown. |
| `tokens`, `css` | tokens JSON can be imported in the theme editor | CSS variables for the active theme, incl. dark mode and reduced motion. |
| `page-flow`, `routes` | no | Mermaid page flow (solid = implemented navigation, dotted = visual only) and JSON route map. |

**Determinism.** For one saved revision (and one set of prompt settings) every export and every
prompt is byte-identical: no timestamps, random ids or set/dict iteration order reach the output.
Tests render every format and prompt mode twice, in subprocesses with different
`PYTHONHASHSEED`s, and through the API after the revision is stored (`tests/test_artifacts.py`);
an older revision keeps exporting the same bytes after newer saves. The JSON export's object key
order for free-form `properties` follows PostgreSQL `jsonb` normalisation, so a file you upload
and export again may list those keys in a different (but stable) order.

**Correspondence.** Tests check that diagrams have exactly one element per node and edge, that
OpenAPI operations equal the saved endpoints (with unique `operationId`s), and that the SQL DDL,
executed on real PostgreSQL, creates exactly the saved tables, columns, nullability, primary keys,
foreign keys (including FK cycles) and indexes. Generated constraint/index names are truncated to
63 bytes and de-duplicated, so long or similar names never collide.

**Files are never written server-side.** Exports are downloads; importing a file or restoring a
revision always creates a *new* revision and is rejected with 409 if the project changed since
the client loaded it, so neither can overwrite newer work.

PNG/SVG of the canvas are rendered in the browser from the current view.
Diagram formats are one-way: they can't represent everything in the document (properties,
assumptions, UI layouts), so re-import is not offered rather than silently dropping data.

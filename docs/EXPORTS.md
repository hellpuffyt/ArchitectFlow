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

PNG/SVG of the canvas are rendered in the browser from the current view.
Diagram formats are one-way: they can't represent everything in the document (properties,
assumptions, UI layouts), so re-import is not offered rather than silently dropping data.

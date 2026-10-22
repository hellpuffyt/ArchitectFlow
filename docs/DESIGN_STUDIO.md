# UI/UX Design Studio

- **Theme tokens** (`schema/design.py → Theme`): light and dark palettes, typography, spacing,
  radii, elevation, component styles, layout and breakpoints, motion. `lib/theme-css.ts` maps them
  to CSS variables; the preview (`ThemePreview`) and page renderer read only those variables.
- **Pages**: a route, parent, access (sign-in, roles), states with messages, and a typed layout
  tree of 24 primitives (`lib/layout.ts → COMPONENTS`). Containers hold children; leaves do not.
- **Responsive rules** per element for `md` and `sm` (hidden, columns, direction). `sm` inherits
  `md`. The preview chooses the rule set from the active theme's breakpoints.
- **Interactions**: navigate, call API, open/close modal. Only navigation runs in the prototype;
  every other action is shown as *visual only*, and prompts say which is which.
- **Bindings**: data views link to endpoints/entities; inputs bind to entity columns; forms
  submit to endpoints whose request fields must match input names (validated).

## Adding a primitive
Add the kind to `LayoutKind` in `schema/design.py` (and `CONTAINER_KINDS` if it has children),
mirror it in `lib/design-types.ts` and `lib/layout.ts`, render it in
`components/design/PageRenderer.tsx`, and add a Vitest case.

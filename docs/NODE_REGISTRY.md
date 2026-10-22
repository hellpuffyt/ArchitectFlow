# Adding a component type

1. Add a `NodeTypeSpec` to `apps/api/architectflow/schema/registry.py` (key, label, category,
   and the facts validation relies on: `stateful`, `public_by_default`, `initiates_calls`, `c4_kind`).
2. Re-export the JSON: `cd apps/api && uv run python -m architectflow.schema.export`.
3. Add the same key/label/category with an icon in `apps/web/lib/registry.ts`.
4. Run `npm test` — `lib/types.test.ts` fails if the two registries disagree.
5. If the type needs special validation, add a rule in `validation/rules.py` with a test.

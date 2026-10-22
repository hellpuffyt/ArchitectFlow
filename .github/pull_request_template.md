## What and why

## How it was tested
- [ ] `uv run pytest` (apps/api, real PostgreSQL)
- [ ] `npm test` and `npm run lint` and `npm run typecheck` (apps/web)
- [ ] `npx playwright test` if UI behavior changed

## Checklist
- [ ] Schema changes are mirrored in `apps/web/lib/types.ts` / `design-types.ts` and `lib/generated` is re-exported
- [ ] Docs updated (README, docs/, CHANGELOG)
- [ ] No secrets, private designs or personal data in the diff

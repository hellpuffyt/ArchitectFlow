# ArchitectFlow web app

Next.js (App Router) frontend. See the repository root README for setup; this app expects the
API to be reachable at `ARCHITECTFLOW_API_ORIGIN` (default `http://127.0.0.1:8000`) at build time.

- `npm run dev` — development server
- `npm test` — component/unit tests (Vitest)
- `npx playwright test` — end-to-end tests against the real API and a fresh PostgreSQL database

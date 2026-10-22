# HTTP API

Interactive OpenAPI docs are served by the API at `/api/docs` (`/api/openapi.json`). All
endpoints are under `/api`; authenticated endpoints use the session cookie and, for writes, the
`x-csrf-token` header returned by `/api/auth/me|login|signup`.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/signup`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| Projects | `GET/POST /projects`, `GET/PATCH/DELETE /projects/{id}`, `POST /projects/{id}/duplicate` |
| Document | `PUT /projects/{id}/document` (`base_revision`; 409 on conflict, 422 with errors), `POST /projects/{id}/validate-document` |
| Revisions | `GET /projects/{id}/revisions`, `GET …/revisions/{n}`, `POST …/revisions/{n}/restore` |
| Validation | `GET /projects/{id}/findings?revision=` |
| AI change sets | `POST …/ai/generate`, `POST …/ai/edit`, `POST …/ai/design`, `POST …/ai/pages`, `GET …/changesets[/{cs}]`, `POST …/changesets/{cs}/apply|reject` |
| Prompts | `POST …/prompts` (stores a version), `POST …/prompts/preview`, `GET …/prompts` (with `outdated`) |
| Exports | `GET …/exports`, `GET …/exports/{format}` |
| Sharing | `POST/GET …/shares`, `DELETE …/shares/{id}`, public `GET /shared/{token}` |
| Account | `GET /account/export`, `DELETE /account` (password) |
| Design | `GET /design/presets` |

Errors: `401` not signed in, `403` CSRF/password, `404` not found *or not yours*, `409` conflict,
`413` body too large, `422` validation (with `errors: [{path, message}]`; integrity errors also
carry `rule`; values the database cannot store, such as NUL characters, are 422 too), `428`
confirmation needed, `429` rate limit, `502/503/504` provider or database unavailable (the design is unchanged).

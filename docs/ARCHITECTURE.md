# Architecture map

## Backend

- `server.js`: process startup and shutdown. Importing it does not listen on a port.
- `src/server/app.js`: Express composition, middleware order, static paths and routes.
- `middleware/`: API-key authentication, security headers and final error handling.
- `routes/`: HTTP mapping for tasks, archive, plants and auth status.
- `services/`: task operations, plant queries and pagination.
- `validation/task-validator.js`: validation and sanitization.
- `storage/json-store.js`: JSON task/archive persistence, caching and
  in-process locks.
  `DATA_DIR` is resolved before module imports; set it before loading the application.
- `logger.js`: request/audit logging. Tests use no worker transports and
  isolate logs.

Keep HTTP contracts in routes, domain behavior in services and file access in storage.
JSON files and in-process locks are single-instance storage, not a shared database.
`API_KEY` is optional; absence leaves the API open. There is no JWT/password backend
on this main branch. Tests must clear ambient API_KEY before imports for isolation.

## Frontend

`public/` contains page markup, `src/css/` styles, `src/js/` classic browser scripts.
Task pages load config/security/encryption/rate-limiter/logger/error-handler, then
`api.js`, `app.js`, and `task-{state,filters,renderer,events,export}.js` in order.
`app.js` defines `GartenPlaner`; later scripts extend its prototype before the
DOMContentLoaded initialization. Page-specific dashboard/statistics initialization
follows those scripts. Plants and log viewer have their own entry scripts.
`window.GP` and explicit classic-script globals are shared interfaces, not imports.

`api.js` handles HTTP access and the stored API key. `task-state.js` changes task
state and persists through the API; renderer produces markup; events wires inputs;
filters handles search; export handles PDF generation. LocalStorage also supports
fallback/browser state. Preserve escaping at HTML boundaries and inspect all pages
when changing script order. The smoke test exercises the creation page and
dashboard task flow.

## Checks

- `tests/server.test.js`: validation, service/API and middleware behavior.
- `tests/frontend.test.js`: real filtering script executed in an isolated VM.
- `tests/smoke/tasks.spec.js`: Chromium + real Express server + disposable storage.
- `tests/setup.js`: per-suite Jest storage/log isolation and cleanup.
- `.github/workflows/test.yml`: reproducible local-equivalent validation.

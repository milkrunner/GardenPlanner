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
`API_KEY` is optional outside production; absence leaves the API open. With
`NODE_ENV=production` `server.js` refuses to start without `API_KEY` unless
`ALLOW_UNAUTHENTICATED=true` is set (`src/server/config.js`). There is no JWT/password
backend on this main branch. Tests must clear ambient API_KEY before imports for isolation.

Async route handlers must be wrapped in `middleware/async-handler.js` (Express 4 does not
forward rejected promises); a test fails if a raw `async` handler is registered. Storage
failures reach the final error handler as HTTP 500 and are never swallowed: only a missing
file is an empty collection, corrupt/unreadable files raise instead of being overwritten.
Operations spanning tasks and archive lock in a fixed order (`withLockedTasksAndArchive`)
and write the destination first, so a failed write duplicates rather than loses a task.

## Betriebsgrenzen

Run exactly **one** server instance per `DATA_DIR`. Task files are guarded by in-process
locks, the read cache is per process, and the rate limiter (`express-rate-limit`, 100
requests per 15 minutes, configured in `app.js`) uses its default in-memory store. A second
instance on the same data would lose updates (no cross-process locking), so a shared rate
limit store such as Redis alone would not make multi-instance operation safe and is
deliberately not used. Consequences of the single-instance design: rate-limit counters reset
on restart, and behind a reverse proxy `trust proxy` is not configured, so all clients share
the proxy's address bucket. Scaling out requires a shared database first; that is a separate
architecture change, not a configuration option.

## Frontend

`public/` contains page markup, `src/css/` styles, `src/js/` classic browser scripts.
Task pages load config/security/encryption/rate-limiter/logger/error-handler, then
`api.js`, `auth-gate.js`, `app.js`, and `task-{state,filters,renderer,events,export}.js` in order.
`app.js` defines `GartenPlaner`; later scripts extend its prototype before the
DOMContentLoaded initialization. Page-specific dashboard/statistics initialization
follows those scripts. Plants and log viewer have their own entry scripts.
`window.GP` and explicit classic-script globals are shared interfaces, not imports.

Diagnostics: the browser console stays quiet in production. `GP.debug()` (config.js)
only prints with `window.GP_DEBUG = true` or `localStorage.gp_debug = 'true'` plus
reload, which also lowers the Logger to DEBUG. Warnings/errors keep using
`console.warn/error` and the Logger. Render untrusted task data with `textContent`
or DOM builders (`_el`, `_renderBarChart`, ...); `innerHTML` is reserved for
markup that passes `Security.escapeHtml` or static trusted constants. The CSP
(`script-src 'self'`) blocks inline `on*=` handlers, so bind events in scripts.

`api.js` handles HTTP access and the stored API key; its errors carry `network` (server
unreachable) or `status` (HTTP response). `auth-gate.js` (`window.GP.Auth`) asks for the key
in a dialog when the server requires one, retries after a 401 and shows the status bar for
offline/error states. Only network failures may fall back to the `localStorage` copy, and
that fallback is always announced; HTTP errors are reported, never masked. `task-state.js` changes task
state and persists through the API; renderer produces markup; events wires inputs;
filters handles search; export handles PDF generation. LocalStorage also supports
fallback/browser state. Preserve escaping at HTML boundaries and inspect all pages
when changing script order. The smoke test exercises the creation page and
dashboard task flow.

## Checks

- `tests/server.test.js`: validation, service/API and middleware behavior.
- `tests/frontend.test.js`: real filtering script executed in an isolated VM.
- `tests/frontend-dom.test.js`: jsdom runs the real classic scripts to check
  escaping of untrusted task data, DOM builders, dialog keyboard handling and
  static page markup (SVG/control names, labels, no inline handlers).
- `tests/smoke/a11y.spec.js`: axe-core on every page (light/dark), keyboard flows
  for dialogs, plant cards and the log viewer; `tests/smoke/harness.js` starts the
  real app with disposable storage (one instance per test: the API rate limit is
  100 requests per 15 minutes).
- `tests/smoke/tasks.spec.js`: Chromium + real Express server + disposable storage.
- `tests/setup.js`: per-suite Jest storage/log isolation and cleanup.
- `.github/workflows/test.yml`: reproducible local-equivalent validation.

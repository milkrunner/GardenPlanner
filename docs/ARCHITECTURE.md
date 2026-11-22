# Architecture map

## Backend

- `server.js`: process startup and shutdown. Importing it does not listen on a port.
- `src/server/app.js`: Express composition, middleware order, static paths and routes.
- `middleware/`: API-key authentication, security headers and final error handling.
- `routes/`: HTTP mapping for tasks, archive, plants, auth status and backup (`GET /api/export`,
  `POST /api/import`; the import route has its own 5 MB body parser, see `app.js`).
- `services/`: task operations, plant library (queries and CRUD), pagination and export/import
  (`backup-service.js`, under the tasks/archive locks plus a plants lock; see [BACKUP.md](BACKUP.md)).
  `recurrence.js` computes follow-up due dates (UTC, month end clamped); `task-service.js` creates the
  follow-up of a recurring task in the same locked write as the status change to `completed` (#327).
  Tasks carry an optional `dueDate` (`YYYY-MM-DD`, no time or zone, #344); it is the only due date, so the
  follow-up gets the old `dueDate` plus the interval and the former `nextDue` is no longer written.
  Tasks may reference a plant with an optional `plantId` (slug, #347): `validateTask` only checks the format,
  `createTask`/`updateTask` check that a _new or changed_ reference exists in the library (`getPlant`, before any
  mutation), so a task whose plant was deleted later stays valid (orphaned reference; reads, imports and PUTs that
  resend the unchanged id never fail). The follow-up of a recurring task copies it. `GET /api/tasks?plantId=`
  filters by slug; deleting a plant is never blocked by tasks.
- `validation/task-validator.js`, `validation/plant-validator.js`: validation and sanitization.
  `backup-validator.js` checks import bundles with the same task rules.
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
and write the destination first, so a failed write duplicates rather than loses a task (#317).

Such a duplicate (same `id` in `tasks.json` and `archived-tasks.json`) is repaired automatically
(#339, `resolveArchiveDuplicates` in `services/task-service.js`): under both locks before every
archive/unarchive and once in `server.js` before the server starts listening. The copy with the newer
state wins: latest valid timestamp of `createdAt`, `archivedAt` and `history[].timestamp`; on a tie the
longer history, then the archive copy. A failed archive thus resolves to the archived copy, a failed
unarchive to the active copy, and an edit made after the failure keeps the active copy. Only the losing
copy is removed (never both), each resolution is logged as audit event `archive_duplicate_resolved`
(`taskId`, `kept`, `removed`), and a failing repair write changes nothing and is retried next time.
Consequence: retrying a failed archive may answer 404, because the repair already archived the task.
Until the next archive/unarchive or restart, reads can still list the task in both files.

## Betriebsgrenzen

Run exactly **one** server instance per `DATA_DIR`. Task files are guarded by in-process
locks, the read cache is per process, and the rate limiter (`express-rate-limit`, 100
requests per 15 minutes, configured in `app.js`) uses its default in-memory store. A second
instance on the same data would lose updates (no cross-process locking), so a shared rate
limit store such as Redis alone would not make multi-instance operation safe and is
deliberately not used. Consequences of the single-instance design: rate-limit counters reset
on restart, and behind a reverse proxy `TRUST_PROXY` must be set (default off, so all clients
share the proxy's address bucket; see `docs/SECURITY.md`). Scaling out requires a shared database first; that is a separate
architecture change, not a configuration option.

Whether users, roles or tenants are needed beyond the single shared `API_KEY` is an open
decision: see [ADR 0001: Mehrbenutzerbetrieb](decisions/0001-mehrbenutzerbetrieb.md) (#328).

## Frontend

`public/` contains page markup, `src/css/` styles, `src/js/` classic browser scripts.
Task pages load config/security/encryption/rate-limiter/logger/error-handler, then
`api.js`, `auth-gate.js`, `app.js`, and `task-{state,filters,renderer,events,export}.js` in order.
`app.js` defines `GartenPlaner`; later scripts extend its prototype before the
DOMContentLoaded initialization. Page-specific dashboard/statistics initialization
follows those scripts. Plants and log viewer have their own entry scripts. `plants.js` also maintains the library (#330):
add/edit form and delete confirmation are dialogs built with DOM builders (no `innerHTML` for plant data),
call `window.TaskAPI._fetch` (API key, 401 dialog), mirror the limits of `plant-validator.js` for early
feedback, translate server answers (`errors[]` for 400, 404/409) into messages, and reload the library and
category filter after every change.
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
filters handles search; export handles PDF generation.
Due dates (#346): `dueDate` is a plain `YYYY-MM-DD` string. `task-filters.js` parses it into a local date
(never `new Date('YYYY-MM-DD')`, which is UTC midnight and shows the previous day west of UTC), formats it
with `toLocaleDateString('de-DE')`, derives the status (overdue, today, next 7 days) from the local day and
backs the due filter and sorting; the card shows the state as text, not only as color. The former browser
`nextDue` of old `localStorage` copies is deliberately discarded: it is never read or sent, and the next
successful load from the API replaces the copy (the server writes `dueDate` only). `localStorage` also supports
fallback/browser state.
Plant reference (#347): the task pages load `GET /api/plants` once (`loadPlants`, `null` when unavailable) to fill the
`#taskPlant`/`#editTaskPlant` selects (`populatePlantSelect`, DOM builders; an orphaned reference stays selectable) and
to render the card link (`renderPlantRef`: icon and name to `/plants?plant=<id>`, or the text "Pflanze nicht mehr
vorhanden"; nothing while the library is not loaded). `plants.js` opens the detail dialog for `?plant=`.
Preserve escaping at HTML boundaries and inspect all pages
when changing script order. The smoke test exercises the creation page and
dashboard task flow.

## Checks

- `tests/archive-duplicates.test.js`: injected write failure during archive/unarchive and the
  duplicate repair (#339).
- `tests/server.test.js`: validation, service/API and middleware behavior.
- `tests/server-plants*.test.js`: plant library reads, damaged `plants.json`, CRUD and validator.
- `tests/openapi.test.js`: `docs/openapi.json` must list exactly the registered `/api` routes
  and match real responses (schemas, documented status codes). Update `docs/openapi.json` and
  `docs/API.md` whenever a route or response shape changes.
- `tests/frontend.test.js`: real filtering script executed in an isolated VM.
- `tests/frontend-dom.test.js`: jsdom runs the real classic scripts to check
  escaping of untrusted task data, DOM builders, dialog keyboard handling and
  static page markup (SVG/control names, labels, no inline handlers).
- `tests/frontend-state.test.js`: jsdom runs `task-state.js`, `task-filters.js`, `task-export.js`
  and the sorting in `task-renderer.js` against mocked `TaskAPI`: archive/restore, offline
  fallback and error typing (`handleLoadFailure`), filter, sort, export/import.
- `npm run test:coverage`: V8 coverage over `src/` including the browser scripts, with
  minimum values in `jest.config.cjs`.
- `tests/frontend-{security,rate-limiter,error-handler,encryption}.test.js`: jsdom runs the
  real `security.js`, `rate-limiter.js`, `error-handler.js` and `encryption.js` (Web Crypto
  from Node, key store faked). They replace the former manual `tests/*-test.html` pages;
  `tests/helpers/browser-scripts.js` loads `src/js` scripts into jsdom.
- `tests/static-routes.test.js`: `/tests` and `/docs` are never served.
- `tests/smoke/a11y.spec.js`: axe-core on every page (light/dark), keyboard flows
  for dialogs, plant cards and the log viewer; `tests/smoke/harness.js` starts the
  real app with disposable storage (one instance per test: the API rate limit is
  100 requests per 15 minutes).
- `tests/smoke/plants.spec.js`: add, edit and delete plants through the UI against the real app, plus axe
  (light/dark) for the form, its error state and the delete dialog.
- `tests/smoke/tasks.spec.js`: Chromium + real Express server + disposable storage.
- `tests/smoke/due-date.spec.js`: create, edit and remove a due date, due filter and sorting in Chromium.
- `tests/plant-reference.test.js`, `tests/plant-ref-ui.test.js`, `tests/smoke/plant-ref.spec.js`: plant reference (#347):
  validation, library check, orphaned references, filter, legacy data, recurrence, export/import; card, select and
  escaping in jsdom; select, card link, orphan text and plant page link in Chromium (axe light/dark).
- `tests/due-date-ui.test.js`: due date helpers (also in other time zones), card rendering and filter in jsdom.
- `tests/setup.js`: per-suite Jest storage/log isolation and cleanup.
- `.github/workflows/test.yml`: reproducible local-equivalent validation.

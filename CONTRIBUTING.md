# Development and review

## Setup

Use Node 22.13 or newer within Node 22 and npm 10 (`.nvmrc`, `engines`).
With nvm: `nvm install && nvm use`. Install npm 10.9.4 if your Node installation
ships a different npm major: `npm install --global npm@10.9.4`.

```sh
npm ci
npm run dev
```

Open <http://localhost:3000>. The server reads environment variables; it does not
load `.env` automatically. For example, `API_KEY=... npm start` enables API-key
authentication. With `NODE_ENV=production` the server refuses to start without
`API_KEY` (opt-out: `ALLOW_UNAUTHENTICATED=true`). Never paste real keys into issues,
logs or tracked files.
`DATA_DIR` overrides task/archive/plant storage (default: repository `data/`).
`LOG_DIR` overrides server logs (legacy default: `src/data/logs/`). Relative paths
are relative to the process working directory; prefer absolute paths for tooling.

The lockfile uses the public npm registry. Commit lockfile changes with dependency
changes; do not delete it in CI. Docker and CI use the same Node major and
`npm ci`.

## Validation

```sh
npm run check
npm run test:server -- -t 'validateTask'
npm run test:frontend
npx playwright install chromium
npm run test:smoke
```

`npm run test:coverage` runs Jest with V8 coverage for `src/` (server and the classic
browser scripts in `src/js/`, which the jsdom tests execute via `vm.Script` with a
`filename`; no extra dependency). The minimum values in `jest.config.cjs`
(`coverageThreshold`, just below the current state) fail the run when coverage drops.
Raise them as tests are added, never lower them to get green. When a test loads a
browser script, pass its `filename` so the coverage maps to the source file. The
report is written to `coverage/` (ignored by Git). `server.js` is process startup
and is covered by the smoke test, not by Jest coverage.

Jest allocates a separate temporary data/log directory per suite before importing
application code. Chromium smoke uses its own temporary directory and an ephemeral
loopback port; both tear down their resources. No normal `data/` files are touched.
`npm test -- --detectOpenHandles` diagnoses lifecycle problems; never add forceExit.
The smoke creates, edits and archives through the UI and checks server persistence.
It needs no external services, account or API secret. Run it for UI/API changes.

ESLint covers browser, server, tooling and Jest with separate globals. Undefined
names and correctness violations fail. The lint script runs with `--max-warnings 0`,
so any new warning, for example an unused variable, fails the gate.
Formatting uses Prettier: changed
and new files must pass, while byte-identical legacy files in
`scripts/format-baseline.json` remain exempt. Format a touched file with
`npx prettier --write path/to/file`. Never expand the baseline to bypass a failure.
Do not include unrelated mass formatting in feature PRs.

CSS is checked by super-linter's stylelint with `.stylelintrc.json` (standard config).
Purely stylistic rules that the legacy style sheet violates in bulk, and the cascade-
sensitive `no-duplicate-selectors`, are switched off there instead of mass-rewriting
`src/css`. Syntax and correctness rules stay active. Re-enable a rule only together
with a reviewed cleanup of the affected CSS.

CI runs check + smoke and uploads failure traces. `npm audit` is reported separately:
advisories do not silently disappear or become a reason to disable tests. The
current audit state, the `overrides` in `package.json` and how to remove them are
documented in [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md). Never use
`npm audit fix --force`; review dependency changes in focused PRs.

## Docker Hub description

`docs/DOCKERHUB.md` (full description) and `docs/DOCKERHUB.short.txt` (max. 100
characters) are the source for the Docker Hub repository page. Only document tags and
features that exist. Validate with `node scripts/dockerhub-description.cjs --dry-run`
(no network, no secrets; also covered by `npm test`). Publishing is a manual
maintainer action: run the "Docker Hub description" workflow with `dry_run` disabled.
It needs the repository secrets `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` (access
token with write permission); never put them in files or logs. The logo and categories
cannot be set by the script and are maintained in the Docker Hub web UI.

## Releases

Versionen entstehen nur durch einen bewusst gepushten Tag `vX.Y.Z`; Ablauf, Docker-Tags und
Rücknahme stehen in [docs/RELEASING.md](docs/RELEASING.md), Änderungen im
[CHANGELOG.md](CHANGELOG.md). Neue Einträge kommen unter `Unreleased`. Dependabot-Pull-Requests
werden wie jede andere Änderung geprüft und nie automatisch gemergt.

## Browser tests

There are no manual browser test pages any more (#338); the server does not serve
`tests/` or `docs/`. The repeatable baseline is Jest with jsdom for the classic browser
scripts (`tests/frontend*.test.js`: filtering, DOM, state, security, rate limiter, error
handler, encryption), the axe-core/keyboard smoke (`tests/smoke/a11y.spec.js`) and the
Chromium task smoke. `tests/helpers/browser-scripts.js` loads scripts from `src/js/`
into a jsdom window. Failure-injection coverage remains separate (#284). To see debug
output in the browser set `localStorage.gp_debug = 'true'` and reload.

## Issues and PRs

Start with problem, desired behavior, scope, relevant code and acceptance criteria.
Confirm the target branch: old JWT/DB/garden-planner.js assumptions are not facts
about current main (Express, API keys, JSON storage). Break larger work into linked
sub-issues with explicit dependencies. Test isolation precedes normal test execution.

Use a focused branch, small commits and the PR template. Include actual commands,
results, issue links and any unverified behavior. Resolve merge conflicts by reading
both changes and rerunning affected checks; never overwrite unrelated work. Fix
failed checks before claiming completion. Do not weaken a gate to obtain green CI.

Optional Claude review requires a same-repository PR labeled `ai-review` and the
`CLAUDE_CODE_OAUTH_TOKEN` repository secret. Maintainers control the label; forks
and unlabeled PRs run only deterministic checks. The workflow token has read
access to source
and write access to PR reviews; no source-write permission is granted. Missing
credentials skip the optional step and do not block core validation. No agent-local
permissions are committed. Required checks and human review policies remain in force.

# Working on GardenPlanner

Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup and validation and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for entry points before editing.

## Maintainer mandate

The repository owner has delegated technical maintenance to the coding agent.
Choose the recommended implementation independently and finish authorized work,
including fixes and GitHub issue/PR maintenance. Use `gh` for all GitHub operations.
Prefer a final outcome report over routine progress updates. This is a working
preference, not a transfer of GitHub account ownership or permission to expose
secrets, delete user data, bypass review requirements, or deploy unasked.

## Workflow

- Inspect `git status`, the target issue, and the target branch first. Preserve
  unrelated edits. Use a focused branch and a reviewable PR.
- Validate issue claims against actual code: some older issues describe a different
  architecture. Link evidence instead of blindly implementing their assumptions.
- Node 22 (at least 22.13), npm 10; `npm ci` installs the committed public lockfile.
- `npm run check`: ESLint, incremental formatting gate, isolated Jest suites.
- `npm run test:server -- -t 'pattern'` for focused API checks;
  `npm run test:frontend` for browser logic; `npm run test:smoke` for Chromium UI.
- Install Chromium once with `npx playwright install chromium` (CI also installs
  OS dependencies). CI runs the same checks, without an AI provider credential.
- Never run tests against normal data. Keep `DATA_DIR` and `LOG_DIR` isolated.
  Never commit runtime data, credentials, browser reports, or local agent permissions.
- Update docs when commands, environment variables or module boundaries change.
  Do not refresh formatting baselines to hide new formatting debt.

## Code boundaries

Backend: routes → services → storage/validation. Keep middleware ordering and API
response/status contracts intact unless the issue explicitly changes them.
Frontend: classic scripts extending `GartenPlaner.prototype`, not ES modules.
Preserve script order and shared globals; don't add async/defer in isolation.
Treat task data as untrusted, preserve escaping and API-key authentication.
Do not introduce a framework, database, or broad reformat as incidental cleanup.

## Done

Verify relevant behavior and full local gates; include commands/results in the PR.
For task UI changes run the browser smoke. Report remaining failures candidly.
Link the issue, keep the diff focused, and respect required GitHub checks. Automated
AI review is optional and does not replace tests or authorize automatic merging.

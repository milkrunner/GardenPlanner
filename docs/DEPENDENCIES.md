# Dependency audit notes

Measured with npm 10.9.4 against the public registry on 2026-11-22
(`npm audit`, `npm audit --omit=dev`; no `--force`).

## Result

| Scope                     | Before               | After |
| ------------------------- | -------------------- | ----- |
| All dependencies          | 19 moderate (0 high) | 0     |
| Production (`--omit=dev`) | 1 moderate (`qs`)    | 0     |

The 19 findings were three root causes; the other 16 entries were transitive
packages that npm lists because they depend on an affected package.

| Package                 | Advisories                                                                         | Scope                           | Fix                                                             |
| ----------------------- | ---------------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------- |
| `qs` (< 6.16.1)         | GHSA-q8mj-m7cp-5q26, GHSA-x5fp-wj9c-mxmx, GHSA-4mjr-xmp4-gh2g, GHSA-6pq8-jhm2-2vcw | production (Express), test      | `express` `^4.22.3` (requires `qs ~6.16.0`; resolves to 6.16.2) |
| `glob` (9.0.0 – 14.0.1) | GHSA-3g3m-2fjr-6pw4                                                                | development only (Jest)         | `overrides.glob` `^14.0.6`                                      |
| `minimatch` (< 11.0.1)  | GHSA-g3hv-75wg-m249                                                                | development only (Jest, ESLint) | `overrides.minimatch` `^11.0.9`                                 |

## Reachability

- `qs` is used by Express/body-parser for query strings and `x-www-form-urlencoded`
  bodies, so it can process attacker-controlled input. This was the only production
  finding and is fixed by a normal, semver-compatible Express update.
- `glob` and `minimatch` are only used by Jest (test discovery, coverage exclusion) and
  ESLint on developer and CI machines with patterns from repository configuration, not
  from user input. They are not installed in the Docker image (`npm ci --omit=dev`).
  The advisories (abort-signal bypass, glob pattern amplification) are therefore not
  reachable in production; the overrides remove the noise and the exposure of CI.

## Why overrides instead of `npm audit fix --force`

`npm audit fix --force` proposes downgrading Jest 30 to 29.7.0. Jest 30.5.2 pins
`glob ^13` and `babel-plugin-istanbul 8` pins `test-exclude ^7`, so no newer Jest
release resolves the advisories yet. The overrides raise only the two vulnerable
helpers. They were verified empirically:
`npm run check`, a `jest --coverage` run (which exercises `test-exclude`) and the browser
smoke pass with them. There is no static compatibility guarantee across these major
versions, so re-run those checks whenever the overrides or Jest change.

Remove the overrides once Jest depends on fixed versions itself
(`npm ls glob minimatch` shows no entry marked `overridden`) and `npm audit` stays
clean without them.

## Reproduce

```sh
npm ci
npm audit
npm audit --omit=dev
npm ls qs glob minimatch
```

The lockfile references only `registry.npmjs.org`.

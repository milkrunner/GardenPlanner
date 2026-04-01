# GardenPlanner - Implementation Plan

> Generated: 2026-03-30 | Status: Active
> Based on: Full Team Review (Designer, Frontend-Dev, Backend-Dev, Security-Dev, Reviewer)

---

## Overview

| Phase | Focus | Effort | Issues |
|-------|-------|--------|--------|
| **Phase 1** | Quick Wins: Security & Performance | 1-2 hours | 6 issues |
| **Phase 2** | Critical Security Hardening | 1-2 weeks | 5 issues |
| **Phase 3** | Frontend Consolidation | 3-5 days | 4 issues |
| **Phase 4** | Code Quality & DX | 1-2 weeks | 5 issues |
| **Phase 5** | Feature Enhancements | 1-2 weeks | 4 issues |
| **Phase 6** | Major Features | 3-6 weeks | 3 issues |
| **Phase 7** | PWA & Polish | 1-2 weeks | 3 issues |

**Total estimated effort:** 10-16 weeks (single developer)

---

## Phase 1: Quick Wins - Security & Performance Hardening

> **Goal:** Low-risk, high-impact improvements. All server-config changes, each under 15 minutes.
> **Effort:** 1-2 hours | **Risk:** Low

### Tasks

- [ ] **#114** Remove deprecated X-XSS-Protection header `[security, backend, low]`
  - Remove the X-XSS-Protection header line from security middleware
  - CSP is already in place and sufficient
  - File: `src/server/middleware/security.js`

- [ ] **#116** Add Strict-Transport-Security (HSTS) header `[security, backend, low]`
  - Add HSTS header in production mode only
  - Protects against HTTPS downgrade attacks
  - File: `src/server/middleware/security.js`

- [ ] **#115** Block /src route in production mode `[security, backend, low]`
  - Prevent source code exposure in production
  - Analog to existing /tests, /docs blocking
  - File: `src/server/app.js`

- [ ] **#122** Remove unused cors dependency `[backend, code-quality, low]`
  - `npm uninstall cors` and clean package.json
  - Dead code removal

- [ ] **#118** Scope rate limiter to /api routes only `[backend, performance, low]`
  - Change `app.use(limiter)` to `app.use('/api', limiter)`
  - Prevents double rate-limiting of static assets
  - File: `src/server/app.js`

- [ ] **#119** Add Cache-Control headers for static assets `[frontend, backend, performance, low]`
  - Add `maxAge: '1d'` to express.static middleware
  - File: `src/server/app.js`

### Suggested PRs
1. PR: Security Headers (#114 + #116)
2. PR: Cleanup (#115 + #122)
3. PR: Performance (#118 + #119)

### Done Criteria
- [ ] All 6 issues closed
- [ ] Server starts without errors
- [ ] Existing tests pass

---

## Phase 2: Critical Security Hardening

> **Goal:** Address critical security findings from the team review.
> **Effort:** 1-2 weeks | **Risk:** Medium-High (auth changes affect all users)

### Dependencies
- Phase 1 completed (security baseline)

### Tasks

- [ ] **#137** Implement JWT authentication replacing localStorage API-Key `[security, high]`
  - Replace plaintext API-Key in localStorage with JWT + HttpOnly Cookie
  - JWT with 1h TTL, refresh token logic
  - Key rotation mechanism
  - Files: `src/server/routes/auth.js`, `src/js/api.js`, `src/server/middleware/auth.js`

- [ ] **#138** Sanitize error messages in production `[security, high]`
  - Generic error messages to client in production
  - Detailed logs only server-side
  - No internal structure exposure (e.g. "Lock timeout for tasks.json")
  - Files: `src/server/middleware/error-handler.js`, `src/server/logger.js`

- [ ] **#139** Implement per-IP/per-key rate limiting `[security, backend, high]`
  - Goes beyond #118 (which only scopes to /api)
  - Use express-rate-limit with store (redis/memstore)
  - Per-IP + per-key tracking to prevent DoS
  - File: `src/server/app.js`, new `src/server/middleware/rate-limit.js`

- [ ] **#140** CSP hardening: remove unsafe-inline `[security, medium]`
  - Generate nonce server-side for style-src
  - Remove `unsafe-inline` from Content Security Policy
  - Add Report-Only mode for monitoring
  - Files: `src/server/middleware/security.js`, `public/*.html`

- [ ] **#141** Fix npm audit in Dockerfile `[security, medium]`
  - Remove `|| true` from `npm audit` in Dockerfile
  - Make security findings fail the build
  - File: `Dockerfile`

### Suggested PRs
1. PR: JWT Authentication (largest change, separate branch)
2. PR: Error Sanitization + CSP Hardening
3. PR: Rate Limiting
4. PR: Dockerfile Security

### Done Criteria
- [ ] API-Key no longer stored in localStorage
- [ ] JWT auth working with token refresh
- [ ] Error messages generic in production
- [ ] Per-IP rate limiting active
- [ ] CSP without unsafe-inline
- [ ] npm audit passes in Docker build

---

## Phase 3: Frontend Consolidation

> **Goal:** Create consistent UI foundation for all future feature work.
> **Effort:** 3-5 days | **Risk:** Low-Medium

### Dependencies
- Phase 2 completed (auth changes affect frontend)

### Tasks

- [ ] **#106** Move logs page inline CSS to stylesheet and fix semantic HTML `[frontend, code-quality, medium]`
  - Extract 294 lines of inline CSS to external stylesheet
  - Add semantic HTML structure and ARIA roles
  - Add confirmation dialog for "Delete Logs"
  - Files: `public/logs.html`, `src/css/styles.css`

- [ ] **#105** Unify loading, empty, error, and no-results states `[enhancement, frontend, medium]`
  - Create reusable state components (Loading/Skeleton, Empty, Error, No-Results)
  - Migrate all 5+ existing inconsistent variants
  - Test in Dark Mode
  - **Blocked by:** #106

- [ ] **#149** Add confirmation dialogs for critical actions `[frontend, UX, medium]`
  - Task deletion, API-Key changes, bulk operations
  - With undo possibility
  - Files: `src/js/`

- [ ] **#150** Fix tempSubtasks potential memory leak `[frontend, medium]`
  - Implement cleanup mechanism for tempSubtasks state
  - Verify no orphaned state after modal close/navigation
  - Files: `src/js/`

### Suggested PRs
1. PR: Logs page refactoring (#106)
2. PR: Unified state components (#105) — after #106
3. PR: Confirmation dialogs + memory leak fix

### Done Criteria
- [ ] No inline CSS in logs page
- [ ] All state displays use unified components
- [ ] Confirmation dialogs on destructive actions
- [ ] No memory leaks in subtask handling

---

## Phase 4: Code Quality & Developer Experience

> **Goal:** Improve maintainability, reduce tech debt, establish better DX.
> **Effort:** 1-2 weeks | **Risk:** Low

### Dependencies
- Phase 3 completed (CSS consolidated before build pipeline)

### Tasks

- [ ] **#144** Deduplicate escapeHtml() and sanitizeTaskData() `[code-quality, medium]`
  - Create shared validation module
  - Remove duplicates from `src/js/security.js` and `src/server/validation/task-validator.js`
  - DRY principle

- [ ] **#145** Replace magic numbers with central configuration `[code-quality, medium]`
  - Rate limits, lock timeout, cache age, pagination defaults
  - Create central config with named constants
  - Files: `rate-limiter.js`, `json-store.js`, `api.js`

- [ ] **#146** Unify error return types in services `[code-quality, medium]`
  - Consistent `{ error, status, message, errors? }` format
  - All service methods follow same pattern
  - File: `src/server/services/task-service.js`

- [ ] **#147** Migrate frontend tests from HTML to Jest `[testing, medium]`
  - Convert `encryption-test.html`, `security-test.html` etc. to Jest
  - CI-compatible test runner
  - Target: 60% coverage minimum
  - Files: `tests/`

- [ ] **#148** Add JSDoc type hints `[code-quality, medium]`
  - Start with server functions, then client
  - Create `types.js` with shared type definitions
  - Preparation for potential TypeScript migration

### Suggested PRs
1. PR: Shared validation module (deduplication)
2. PR: Central config constants
3. PR: Error response unification
4. PR: Jest frontend tests
5. PR: JSDoc types

### Done Criteria
- [ ] No duplicated validation code
- [ ] All magic numbers in central config
- [ ] Consistent error responses
- [ ] Frontend tests run in Jest/CI
- [ ] JSDoc on all public functions

---

## Phase 5: Feature Enhancements (Existing Pages)

> **Goal:** Enhance existing pages with better UX and functionality.
> **Effort:** 1-2 weeks | **Risk:** Low

### Dependencies
- Phase 3 completed (unified state components available)

### Tasks

- [ ] **#108** Add sorting, result count, and favorites to plant library `[enhancement, frontend, low]`
  - Sorting options for plants
  - Result counter display
  - Favorites via localStorage
  - "No results" feedback using unified state component
  - **Blocked by:** #105

- [ ] **#107** Make statistics page interactive with time range and trends `[enhancement, frontend, medium]`
  - Time range selector
  - Trend indicators
  - Hover tooltips
  - Export (PDF/CSV)
  - History filter and search
  - **Blocked by:** #105

- [ ] **#153** WCAG color contrast documentation `[accessibility, low]`
  - Verify and document AA/AAA compliance
  - Create contrast reference in docs

- [ ] **#154** Weather API offline fallback `[frontend, low]`
  - Graceful degradation when API unreachable
  - Show cached/placeholder data
  - File: `src/js/api.js`

### Suggested PRs
1. PR: Plant library enhancements (#108)
2. PR: Statistics page (#107)
3. PR: Accessibility + Weather fallback

### Done Criteria
- [ ] Plant library has sorting, favorites, result count
- [ ] Statistics page is interactive with export
- [ ] WCAG compliance documented
- [ ] Weather works offline with cached data

---

## Phase 6: Major Features & Infrastructure

> **Goal:** Core features that define the application + infrastructure for scale.
> **Effort:** 3-6 weeks | **Risk:** High (major architecture changes)

### Dependencies
- Phase 4 completed (build pipeline, tests in place)

### Tasks

- [ ] **#142** Replace JSON file storage with PostgreSQL `[backend, high]`
  - Design DB schema (tasks, users, audit_log, settings)
  - Create migrations (Knex/Flyway)
  - Update task-service.js for DB queries
  - Add PostgreSQL service to docker-compose.yml
  - Files: new `src/server/storage/postgres-store.js`, `docker-compose.yml`

- [ ] **#143** Implement backup strategy `[devops, high]`
  - Automated daily backups (pg_dump)
  - Restore procedure tested
  - **Blocked by:** PostgreSQL migration
  - Files: new `scripts/backup.sh`, `Dockerfile`

- [ ] **#47** Optimize Performance: Minification and Lazy Loading `[enhancement]`
  - Set up Vite for frontend build (HMR, tree-shaking, minification)
  - Code splitting and lazy loading
  - **Note:** Related new issue about build pipeline (Phase 4) is prerequisite thinking

- [ ] **#51** Plant Library with Care Guides `[enhancement]`
  - Comprehensive plant database with care tips
  - Integration into garden plans
  - **Should complete before #48**

- [ ] **#48** Interactive Garden Layout Planner `[enhancement]`
  - Drag-and-drop interface for visual garden planning
  - Grid system for beds, paths, plant placement
  - **THE core feature of the entire application**
  - **Blocked by:** #51 (needs plant data)
  - Recommendation: Create technical design doc before implementation

### Suggested PRs
1. PR: PostgreSQL migration (separate branch, thorough review)
2. PR: Backup strategy
3. PR: Vite build pipeline (#47)
4. PR: Plant Library (#51)
5. PR: Garden Planner (#48) — largest feature, may need multiple PRs

### Done Criteria
- [ ] PostgreSQL running in Docker Compose
- [ ] Daily automated backups with tested restore
- [ ] Vite build producing optimized bundles
- [ ] Plant library with care guides live
- [ ] Interactive garden planner functional

---

## Phase 7: PWA, Monitoring & Polish

> **Goal:** Production readiness, offline capability, observability.
> **Effort:** 1-2 weeks | **Risk:** Medium

### Dependencies
- Phase 6 completed (features should be stable before PWA caching)

### Tasks

- [ ] **#46** Convert Application to Progressive Web App (PWA) `[enhancement]`
  - Service Worker with caching strategy
  - Web App Manifest for installability
  - Offline fallback pages
  - **Blocked by:** #47 (optimized assets for efficient caching)

- [ ] **#151** Integrate Sentry for error monitoring `[devops, medium]`
  - @sentry/node server-side
  - @sentry/browser client-side
  - Error capture and alerting
  - Files: `src/server/app.js`, `src/js/app.js`

- [ ] **#155** Multi-tab synchronization `[frontend, low]`
  - BroadcastChannel API or Storage Events
  - Sync task changes across browser tabs

- [ ] **#156** Prepare API versioning `[backend, low]`
  - Add /api/v1 prefix
  - Backward compatibility for transition period
  - Files: `src/server/routes/`

- [ ] **#157** Evaluate encryption key storage `[security, low]`
  - Review AES-GCM keys in IndexedDB
  - Document threat boundaries
  - Evaluate server-side encryption for sensitive data

### Suggested PRs
1. PR: PWA implementation (#46)
2. PR: Sentry integration
3. PR: Multi-tab sync + API versioning + encryption review

### Done Criteria
- [ ] App installable as PWA
- [ ] Works offline with cached data
- [ ] Errors tracked in Sentry
- [ ] Tabs stay in sync
- [ ] API versioned under /api/v1

---

## Dependency Graph

```
Phase 1 (Quick Wins)
  │
  ▼
Phase 2 (Security) ──────────────────┐
  │                                   │
  ▼                                   │
Phase 3 (Frontend) ──► Phase 5 (UX)  │
  │                                   │
  ▼                                   │
Phase 4 (Quality/DX) ◄───────────────┘
  │
  ▼
Phase 6 (Major Features)
  │
  ▼
Phase 7 (PWA & Polish)
```

**Parallelization opportunities:**
- Phase 3 + Phase 4 can partially overlap (different developers)
- Phase 5 can start after Phase 3, parallel to Phase 4
- In Phase 6: #51 + #47 can run in parallel, #48 starts after #51

---

## How to Use This Plan

1. **Start a phase:** Create a branch for each PR grouping
2. **Track progress:** Check off tasks as issues are closed
3. **Review gates:** Each phase has "Done Criteria" — verify before moving on
4. **Adapt:** Re-evaluate priorities after each phase completion
5. **All issues are tracked in GitHub** (see issue tracker)

---

*This plan was generated from a full team review (Designer, Frontend-Dev, Backend-Dev, Security-Dev, Reviewer) of the GardenPlanner repository.*

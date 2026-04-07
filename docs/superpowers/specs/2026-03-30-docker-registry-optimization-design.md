# Docker Registry Optimization & Publishing

**Date:** 2026-03-30
**Status:** Approved
**Target:** Docker Hub (public) — `milkrunner/gardenplanner`

## Goal

Optimize the Dockerfile for production use and set up automated multi-platform image publishing to Docker Hub via GitHub Actions.

## 1. Dockerfile — Multi-Stage Build

Replace the current single-stage Dockerfile with a two-stage build:

### Stage 1: `deps`
- Base: `node:22-alpine`
- Copy only `package.json` + `package-lock.json`
- Configure npm registry (Artifactory: `repo.inform-software.com`) with `strict-ssl false`
- Run `npm ci --omit=dev` for deterministic installs
- This stage is disposable — npm config and tooling do not carry over

### Stage 2: `production`
- Base: `node:22-alpine`
- `apk upgrade --no-cache` (without `|| true` — build must fail on errors)
- Copy `node_modules/` from Stage 1
- Copy application files: `server.js`, `public/`, `src/`, `README.md`
- Create data directories: `/app/data`, `/app/data/logs`
- Set ownership to `node:node`, switch to non-root user
- Set `NODE_ENV=production`
- Expose port 3000
- Healthcheck: `wget` on `http://localhost:3000/api/auth/status`
- Entrypoint: `node server.js`

### Key changes from current Dockerfile
- `npm audit || true` removed — audit belongs in CI, not in the image build
- `strict-ssl false` isolated to deps stage — does not exist in final image
- `apk upgrade || true` changed to `apk upgrade --no-cache` — errors must be visible
- OCI labels added via build args (see section 2)

## 2. OCI-Compliant Labels

Labels are set via `ARG` with defaults, populated dynamically by CI:

| Label | Value |
|-------|-------|
| `org.opencontainers.image.title` | `gardenplanner` |
| `org.opencontainers.image.description` | `Garden task management web application` |
| `org.opencontainers.image.version` | From `package.json` (e.g. `1.0.0`) |
| `org.opencontainers.image.source` | `https://github.com/milkrunner/GardenPlanner` |
| `org.opencontainers.image.url` | `https://hub.docker.com/r/milkrunner/gardenplanner` |
| `org.opencontainers.image.created` | Build timestamp (ISO 8601) |
| `org.opencontainers.image.licenses` | `MIT` |

## 3. .dockerignore

Add the following to reduce build context and prevent non-production files from entering the image:

```
docs/
tests/
.claude/
.github/
node_modules/
data/
```

Uncomment the currently commented-out `docs/` and `tests/` entries.

## 4. GitHub Actions Workflow

**File:** `.github/workflows/docker-publish.yml`
**Trigger:** Push to `main` branch

### Steps

1. **Checkout** repository
2. **Extract version** from `package.json` (e.g. `1.0.0`)
3. **Setup QEMU** for multi-platform emulation
4. **Setup Docker Buildx** for extended build capabilities
5. **Login to Docker Hub** via `docker/login-action`
6. **Build and push** via `docker/build-push-action`

### Configuration

- **Platforms:** `linux/amd64`, `linux/arm64`
- **Cache:** GitHub Actions cache layer for faster rebuilds
- **Tags generated from SemVer:**
  - `1.2.3` (exact version)
  - `1.2` (minor)
  - `1` (major)
  - `latest`

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `DOCKERHUB_USERNAME` | Docker Hub username (`milkrunner`) |
| `DOCKERHUB_TOKEN` | Docker Hub access token (not password) |

## 5. docker-compose.yml Changes

- Add `image: milkrunner/gardenplanner:latest` so the compose file works with the registry image
- Keep `build: .` for local builds
- Remove the hardcoded subnet `172.28.0.0/16` — unnecessary and can cause collisions on other systems

### Usage

- **Local build:** `docker compose up --build`
- **Registry image:** `docker compose pull && docker compose up`

## Files Changed

| File | Action |
|------|--------|
| `Dockerfile` | Rewrite — multi-stage build with OCI labels |
| `.dockerignore` | Update — add exclusions for docs, tests, .claude, .github, node_modules, data |
| `.github/workflows/docker-publish.yml` | Create — automated build & push workflow |
| `docker-compose.yml` | Update — add image name, remove hardcoded subnet |

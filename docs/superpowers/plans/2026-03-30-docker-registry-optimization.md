# Docker Registry Optimization & Publishing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optimize the Dockerfile for production use and set up automated multi-platform image publishing to Docker Hub via GitHub Actions.

**Architecture:** Multi-stage Dockerfile isolates build dependencies from the production image. A GitHub Actions workflow triggers on push to main, extracts the version from package.json, and builds/pushes multi-platform images with SemVer tags.

**Tech Stack:** Docker (multi-stage, Buildx, QEMU), GitHub Actions, Docker Hub

---

### Task 1: Update .dockerignore

**Files:**
- Modify: `.dockerignore`

- [ ] **Step 1: Replace .dockerignore contents**

Replace the full contents of `.dockerignore` with:

```dockerignore
# Git
.git
.gitignore

# Documentation
docs/

# Tests
tests/

# Claude Code
.claude/

# GitHub Actions
.github/

# Dependencies (rebuilt in container)
node_modules/

# Runtime data (mounted as volume)
data/

# Environment
.env
.env.local

# Editor
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Docker files
Dockerfile
docker-compose.yml
.dockerignore

# Logs
*.log
logs/
```

- [ ] **Step 2: Verify build context is smaller**

Run:
```bash
docker build --no-cache -f Dockerfile -t gardenplanner-test . 2>&1 | head -5
```

Expected: Build starts without errors. The build context should be smaller than before (no docs/, tests/, .claude/, node_modules/, data/ included).

- [ ] **Step 3: Commit**

```bash
git add .dockerignore
git commit -m "chore: optimize .dockerignore for production builds"
```

---

### Task 2: Rewrite Dockerfile as multi-stage build

**Files:**
- Modify: `Dockerfile`

- [ ] **Step 1: Replace Dockerfile with multi-stage build**

Replace the full contents of `Dockerfile` with:

```dockerfile
# =============================================================================
# Stage 1: Install production dependencies
# =============================================================================
FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm config set strict-ssl false \
    && npm config set registry http://repo.inform-software.com/artifactory/api/npm/npmjs/ \
    && npm ci --omit=dev

# =============================================================================
# Stage 2: Production image
# =============================================================================
FROM node:22-alpine AS production

# OCI labels — populated by CI, with sensible defaults for local builds
ARG BUILD_VERSION=dev
ARG BUILD_CREATED=unknown
ARG BUILD_REVISION=unknown

LABEL org.opencontainers.image.title="gardenplanner"
LABEL org.opencontainers.image.description="Garden task management web application"
LABEL org.opencontainers.image.version="${BUILD_VERSION}"
LABEL org.opencontainers.image.source="https://github.com/milkrunner/GardenPlanner"
LABEL org.opencontainers.image.url="https://hub.docker.com/r/milkrunner/gardenplanner"
LABEL org.opencontainers.image.created="${BUILD_CREATED}"
LABEL org.opencontainers.image.revision="${BUILD_REVISION}"
LABEL org.opencontainers.image.licenses="MIT"

WORKDIR /app

# Update Alpine packages
RUN apk update && apk upgrade --no-cache

# Copy dependencies from build stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application files
COPY package.json ./
COPY server.js ./
COPY public/ ./public/
COPY src/ ./src/

# Create data directories and set permissions
RUN mkdir -p /app/data /app/data/logs && chown -R node:node /app

# Non-root user
USER node

# Production environment
ENV NODE_ENV=production

# Expose port
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/auth/status || exit 1

# Start server
CMD ["node", "server.js"]
```

- [ ] **Step 2: Build the image locally to verify**

Run:
```bash
docker build --no-cache -t gardenplanner-test . 2>&1
```

Expected: Build completes successfully with two stages. No errors.

- [ ] **Step 3: Run the image to verify it starts**

Run:
```bash
docker run --rm -d --name gp-test -p 3001:3000 gardenplanner-test
sleep 3
wget -qO- http://localhost:3001/api/auth/status || curl -s http://localhost:3001/api/auth/status
docker stop gp-test
```

Expected: Returns JSON response from the auth status endpoint. Container starts and stops cleanly.

- [ ] **Step 4: Verify OCI labels are present**

Run:
```bash
docker inspect gardenplanner-test --format '{{json .Config.Labels}}' | python -m json.tool 2>/dev/null || docker inspect gardenplanner-test --format '{{json .Config.Labels}}'
```

Expected: Output shows all `org.opencontainers.image.*` labels with default values (`dev`, `unknown`).

- [ ] **Step 5: Clean up test image**

Run:
```bash
docker rmi gardenplanner-test
```

- [ ] **Step 6: Commit**

```bash
git add Dockerfile
git commit -m "feat: rewrite Dockerfile as multi-stage build with OCI labels"
```

---

### Task 3: Update docker-compose.yml

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Replace docker-compose.yml contents**

Replace the full contents of `docker-compose.yml` with:

```yaml
services:
  gartenplaner:
    image: milkrunner/gardenplanner:latest
    build: .
    container_name: gartenplaner
    ports:
      - "8080:3000"
    restart: unless-stopped
    environment:
      - TZ=Europe/Berlin
      - API_KEY=${API_KEY}
      - PORT=3000
    volumes:
      - gartenplaner-data:/app/data
    labels:
      - "description=Gartenplaner Web Application"
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000/"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 5s

volumes:
  gartenplaner-data:
```

- [ ] **Step 2: Verify docker compose config is valid**

Run:
```bash
docker compose config
```

Expected: Outputs the resolved compose configuration without errors.

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "chore: add image name and remove hardcoded subnet from docker-compose"
```

---

### Task 4: Create GitHub Actions workflow

**Files:**
- Create: `.github/workflows/docker-publish.yml`

- [ ] **Step 1: Create the workflow directory**

Run:
```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: Create the workflow file**

Create `.github/workflows/docker-publish.yml` with:

```yaml
name: Build and Push Docker Image

on:
  push:
    branches:
      - main

env:
  IMAGE_NAME: milkrunner/gardenplanner

jobs:
  build-and-push:
    runs-on: ubuntu-latest

    permissions:
      contents: read

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Extract version from package.json
        id: version
        run: |
          VERSION=$(node -p "require('./package.json').version")
          MAJOR=$(echo "$VERSION" | cut -d. -f1)
          MINOR=$(echo "$VERSION" | cut -d. -f1-2)
          echo "full=$VERSION" >> "$GITHUB_OUTPUT"
          echo "major=$MAJOR" >> "$GITHUB_OUTPUT"
          echo "minor=$MINOR" >> "$GITHUB_OUTPUT"

      - name: Set up QEMU
        uses: docker/setup-qemu-action@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: true
          tags: |
            ${{ env.IMAGE_NAME }}:${{ steps.version.outputs.full }}
            ${{ env.IMAGE_NAME }}:${{ steps.version.outputs.minor }}
            ${{ env.IMAGE_NAME }}:${{ steps.version.outputs.major }}
            ${{ env.IMAGE_NAME }}:latest
          build-args: |
            BUILD_VERSION=${{ steps.version.outputs.full }}
            BUILD_CREATED=${{ github.event.head_commit.timestamp }}
            BUILD_REVISION=${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

- [ ] **Step 3: Validate the workflow YAML syntax**

Run:
```bash
node -e "const fs = require('fs'); const y = require('yaml') || JSON.parse('null'); const content = fs.readFileSync('.github/workflows/docker-publish.yml', 'utf8'); console.log('YAML is valid');" 2>/dev/null || python -c "import yaml; yaml.safe_load(open('.github/workflows/docker-publish.yml')); print('YAML is valid')"
```

Expected: `YAML is valid`

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/docker-publish.yml
git commit -m "feat: add GitHub Actions workflow for Docker Hub publishing"
```

---

### Task 5: Final integration test

- [ ] **Step 1: Build with docker compose**

Run:
```bash
docker compose build
```

Expected: Multi-stage build completes successfully via compose.

- [ ] **Step 2: Start with docker compose**

Run:
```bash
docker compose up -d
sleep 5
wget -qO- http://localhost:8080/api/auth/status || curl -s http://localhost:8080/api/auth/status
```

Expected: Application responds on port 8080.

- [ ] **Step 3: Verify healthcheck**

Run:
```bash
docker inspect gartenplaner --format '{{.State.Health.Status}}'
```

Expected: `healthy` (may need to wait 30-40 seconds after start).

- [ ] **Step 4: Stop and clean up**

Run:
```bash
docker compose down
```

- [ ] **Step 5: Commit all remaining changes (if any)**

Run:
```bash
git status
```

If there are uncommitted changes, stage and commit them. Otherwise, this step is complete.

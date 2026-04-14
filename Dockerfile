# Gartenplaner Docker Image — Multi-Stage Build
# Stage 1: Build (npm install, native compilation, CSS/JS bundling)
# Stage 2: Production (nur Runtime-Dateien, keine Build-Dependencies)

# ── Stage 1: Build ──────────────────────────────────────────────────
FROM node:22-alpine3.21 AS builder

WORKDIR /app

ARG NPM_REGISTRY=https://registry.npmjs.org/
ARG NPM_STRICT_SSL=true

COPY package.json ./
RUN npm config set strict-ssl ${NPM_STRICT_SSL} \
    && npm config set registry ${NPM_REGISTRY} \
    && npm install --omit=dev \
    && echo "--- Replacing vulnerable nested packages ---" \
    && for pkg_ver in "tar@7.5.13" "minimatch@9.0.7" "glob@10.5.0" "picomatch@4.0.4" "brace-expansion@2.0.3"; do \
         pkg=$(echo "$pkg_ver" | cut -d@ -f1); \
         ver=$(echo "$pkg_ver" | cut -d@ -f2); \
         npm pack "$pkg_ver" --pack-destination /tmp 2>/dev/null || continue; \
         find node_modules -type d -name "$pkg" | while read dir; do \
           if [ -f "$dir/package.json" ]; then \
             current=$(node -p "try{require('./$dir/package.json').version}catch(e){''}" 2>/dev/null); \
             if [ -n "$current" ] && [ "$current" != "$ver" ]; then \
               echo "  Replacing $pkg $current -> $ver in $dir"; \
               rm -rf "$dir"/*; \
               tar xzf "/tmp/${pkg}-${ver}.tgz" --strip-components=1 -C "$dir"; \
             fi; \
           fi; \
         done; \
         rm -f "/tmp/${pkg}-${ver}.tgz"; \
       done \
    && echo "--- Vulnerable packages replaced ---"

# Anwendungsdateien kopieren
COPY server.js ./
COPY scripts/ ./scripts/
COPY public/ ./public/
COPY src/ ./src/
COPY README.md ./

# CSS/JS bundles fuer Production bauen (#47)
RUN node scripts/build.js

# ── Stage 2: Production ────────────────────────────────────────────
FROM node:22-alpine3.21

LABEL maintainer="GardenPlanner"
LABEL description="Gartenplaner - Webanwendung mit REST API zur Verwaltung von Gartenaufgaben"

WORKDIR /app

# Alpine-Packages aktualisieren (CVE-2025-60876, CVE-2026-28390, CVE-2026-31790)
RUN apk update \
    && apk upgrade --no-cache \
    && apk add --no-cache openssl \
    && rm -rf /var/cache/apk/*

# Nur Production node_modules aus Builder kopieren (ohne Build-Tools)
COPY --from=builder /app/node_modules ./node_modules

# Anwendungsdateien kopieren
COPY --from=builder /app/package.json ./
COPY --from=builder /app/server.js ./
COPY --from=builder /app/scripts/ ./scripts/
COPY --from=builder /app/public/ ./public/
COPY --from=builder /app/src/ ./src/
COPY --from=builder /app/README.md ./

# Gebundelte Assets aus dist/ kopieren
COPY --from=builder /app/dist/ ./dist/

# Datenverzeichnis erstellen und Rechte setzen
RUN mkdir -p /app/data /app/data/logs /app/data/photos /app/data/photos/thumbs \
    && chown -R node:node /app

# Non-root User
USER node

# Production environment
ENV NODE_ENV=production

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/auth/status || exit 1

CMD ["node", "server.js"]

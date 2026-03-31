# Gartenplaner Docker Image
# Node.js Express Server with REST API

FROM node:22-alpine

# Metadaten
LABEL maintainer="GardenPlanner"
LABEL description="Gartenplaner - Webanwendung mit REST API zur Verwaltung von Gartenaufgaben"

WORKDIR /app

# Update Alpine packages to fix known vulnerabilities
# Allow failure for transient TLS/network errors in CI
RUN apk update && apk upgrade --no-cache || true

# Dependencies installieren
# NPM_REGISTRY defaults to public npm; override for internal builds:
#   docker build --build-arg NPM_REGISTRY=http://repo.inform-software.com/artifactory/api/npm/npmjs/ .
ARG NPM_REGISTRY=https://registry.npmjs.org/
ARG NPM_STRICT_SSL=true
COPY package.json package-lock.json* ./
RUN npm config set strict-ssl ${NPM_STRICT_SSL} \
    && npm config set registry ${NPM_REGISTRY} \
    && npm ci --omit=dev
RUN npm audit --audit-level=high

# Anwendungsdateien kopieren (#7: no tests/docs in production)
COPY server.js ./
COPY public/ ./public/
COPY src/ ./src/
COPY README.md ./

# Datenverzeichnis erstellen und Rechte setzen
RUN mkdir -p /app/data /app/data/logs && chown -R node:node /app

# Non-root User verwenden
USER node

# Production environment
ENV NODE_ENV=production

# Port exponieren
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/auth/status || exit 1

# Server starten
CMD ["node", "server.js"]

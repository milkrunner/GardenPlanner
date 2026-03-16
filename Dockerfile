# Gartenplaner Docker Image
# Node.js Express Server with REST API

FROM node:22-alpine

# Metadaten
LABEL maintainer="GardenPlanner"
LABEL description="Gartenplaner - Webanwendung mit REST API zur Verwaltung von Gartenaufgaben"

WORKDIR /app

# Update Alpine packages to fix known vulnerabilities
RUN apk update && apk upgrade --no-cache

# Dependencies installieren
COPY package.json package-lock.json* ./
RUN npm install --omit=dev \
    && npm audit --audit-level=moderate || true

# Anwendungsdateien kopieren
COPY server.js ./
COPY public/ ./public/
COPY src/ ./src/
COPY docs/ ./docs/
COPY tests/ ./tests/
COPY README.md ./

# Datenverzeichnis erstellen
RUN mkdir -p /app/data

# Port exponieren
EXPOSE 3000

# Server starten
CMD ["node", "server.js"]

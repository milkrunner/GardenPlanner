# 🐳 Docker Setup - Gartenplaner

Docker-Setup für die Gartenplaner Webanwendung mit nginx als statischem Webserver.

## 📋 Voraussetzungen

- Docker installiert ([Download](https://www.docker.com/products/docker-desktop))
- Docker Compose installiert (meist in Docker Desktop enthalten)

## 🚀 Schnellstart

### Mit Docker Compose (empfohlen)

```bash
# Container bauen und starten
docker-compose up -d

# Anwendung öffnen
# http://localhost:8080
```

### Manuell mit Docker

```bash
# Image bauen
docker build -t gartenplaner .

# Container starten
docker run -d -p 8080:80 --name gartenplaner gartenplaner

# Anwendung öffnen
# http://localhost:8080
```

## 🛠️ Nützliche Kommandos

### Container Management

```bash
# Status anzeigen
docker-compose ps

# Logs anzeigen
docker-compose logs -f

# Container stoppen
docker-compose down

# Container neu starten
docker-compose restart

# Container stoppen und Volumes löschen
docker-compose down -v
```

### Image Management

```bash
# Images anzeigen
docker images

# Image neu bauen (ohne Cache)
docker-compose build --no-cache

# Altes Image entfernen
docker rmi gartenplaner
```

### Debugging

```bash
# In den Container wechseln
docker exec -it gartenplaner sh

# Nginx Konfiguration testen
docker exec gartenplaner nginx -t

# Nginx neu laden
docker exec gartenplaner nginx -s reload
```

## 📁 Dateien im Docker-Setup

- **Dockerfile**: Build-Anweisungen für das Image
- **docker-compose.yml**: Orchestrierung des Containers
- **nginx.conf**: Nginx Webserver-Konfiguration
- **.dockerignore**: Dateien die nicht ins Image kopiert werden

## 🔧 Konfiguration

### Port ändern

In `docker-compose.yml`:

```yaml
ports:
  - "9000:80" # Ändere 8080 zu gewünschtem Port
```

### Timezone ändern

In `docker-compose.yml`:

```yaml
environment:
  - TZ=America/New_York # Ändere zu gewünschter Timezone
```

## 🏗️ Image Details

- **Base Image**: nginx:alpine (~23 MB)
- **Final Image Size**: ~25-30 MB
- **Exposed Port**: 80 (intern)
- **Mapped Port**: 8080 (extern, konfigurierbar)

## 🌐 URLs nach dem Start

- **Hauptseite**: <http://localhost:8080/>
- **Dashboard**: <http://localhost:8080/dashboard>
- **Statistiken**: <http://localhost:8080/statistics>
- **Logs**: <http://localhost:8080/logs>
- **Tests**: <http://localhost:8080/tests/>

## ✨ Features

- ✅ Gzip-Komprimierung aktiviert
- ✅ Security Headers gesetzt
- ✅ Cache-Control für statische Dateien
- ✅ Gesundheitsprüfung (Health Check)
- ✅ Auto-Restart bei Fehler
- ✅ Leichtgewichtiges Alpine Linux
- ✅ Optimierte nginx-Konfiguration

## 🔒 Sicherheit

Die nginx-Konfiguration enthält folgende Security Headers:

- X-Frame-Options: SAMEORIGIN
- X-Content-Type-Options: nosniff
- X-XSS-Protection: 1; mode=block
- Referrer-Policy: no-referrer-when-downgrade

## 📊 Performance

- Statische Dateien werden 1 Jahr gecacht
- HTML-Dateien werden nicht gecacht (immer aktuell)
- Gzip-Komprimierung reduziert Datenübertragung
- Alpine Linux minimiert Image-Größe

## 🐛 Troubleshooting

### Container startet nicht

```bash
# Logs prüfen
docker-compose logs

# Port bereits belegt?
netstat -ano | findstr :8080  # Windows
lsof -i :8080                 # Linux/Mac
```

### Änderungen werden nicht übernommen

```bash
# Image neu bauen
docker-compose up -d --build
```

### Container stoppt sofort

```bash
# Detaillierte Logs
docker logs gartenplaner
```

## 📦 Deployment

### Image für Produktion bauen

```bash
# Mit Tag versehen
docker build -t gartenplaner:1.0.0 .

# In Registry pushen (optional)
docker tag gartenplaner:1.0.0 your-registry/gartenplaner:1.0.0
docker push your-registry/gartenplaner:1.0.0
```

### Auf Server deployen

```bash
# docker-compose.yml auf Server kopieren
scp docker-compose.yml user@server:/path/to/app/

# Auf Server
docker-compose up -d
```

## 🔄 Updates

```bash
# Code aktualisieren
git pull

# Container neu bauen und starten
docker-compose up -d --build
```

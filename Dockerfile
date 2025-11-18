# Gartenplaner Docker Image
# Verwendet nginx als statischen Webserver

FROM nginx:alpine

# Metadaten
LABEL maintainer="GardenPlanner"
LABEL description="Gartenplaner - Moderne Webanwendung zur Verwaltung von Gartenaufgaben"

# Kopiere die Anwendungsdateien in das nginx html Verzeichnis
COPY public/ /usr/share/nginx/html/
COPY src/ /usr/share/nginx/html/src/
COPY docs/ /usr/share/nginx/html/docs/
COPY tests/ /usr/share/nginx/html/tests/
COPY README.md /usr/share/nginx/html/

# Kopiere custom nginx Konfiguration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Exponiere Port 80
EXPOSE 80

# Starte nginx im Vordergrund
CMD ["nginx", "-g", "daemon off;"]

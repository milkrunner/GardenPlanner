#!/bin/sh
set -e

BACKUP_DIR="/backups"
TIMESTAMP=$(date +%Y-%m-%d_%H%M%S)
FILENAME="gartenplaner_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup..."
pg_dump -h db -U gartenplaner gartenplaner | gzip > "${BACKUP_DIR}/${FILENAME}"
echo "[$(date)] Backup saved: ${FILENAME} ($(du -h "${BACKUP_DIR}/${FILENAME}" | cut -f1))"

# Keep only last 7 backups
ls -t "${BACKUP_DIR}"/gartenplaner_*.sql.gz 2>/dev/null | tail -n +8 | xargs -r rm
echo "[$(date)] Cleanup done. Backups: $(ls "${BACKUP_DIR}"/gartenplaner_*.sql.gz 2>/dev/null | wc -l)"

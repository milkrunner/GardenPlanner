#!/bin/sh
set -e

if [ -z "$1" ]; then
    echo "Usage: ./scripts/restore.sh <backup-file.sql.gz>"
    echo "Available backups:"
    ls -lh /backups/gartenplaner_*.sql.gz 2>/dev/null || echo "No backups found"
    exit 1
fi

echo "[$(date)] Restoring from $1..."
gunzip -c "$1" | psql -h db -U gartenplaner gartenplaner
echo "[$(date)] Restore complete."

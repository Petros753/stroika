#!/usr/bin/env bash
# Ежедневный бэкап СтройAI: pg_dump (формат custom) + архив файлов. Хранение 14 дней.
# cron: /etc/cron.d/stroyai-backup → 30 3 * * * root /opt/stroyai/deploy/backup.sh >> /var/log/stroyai-backup.log 2>&1
set -euo pipefail
umask 077
cd "$(dirname "$(readlink -f "$0")")"

BACKUP_DIR="${BACKUP_DIR:-/opt/stroyai/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
TS="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

PG_USER="$(grep -E '^POSTGRES_USER=' .env | cut -d= -f2-)"
PG_DB="$(grep -E '^POSTGRES_DB=' .env | cut -d= -f2-)"

DB_FILE="$BACKUP_DIR/db-$TS.dump"
FILES_FILE="$BACKUP_DIR/files-$TS.tar.gz"

echo "[$(date -Is)] бэкап базы → $DB_FILE"
docker compose exec -T db pg_dump -U "$PG_USER" -d "$PG_DB" -Fc --no-owner > "$DB_FILE.part"
# Дамп должен читаться
docker compose exec -T db pg_restore -l < "$DB_FILE.part" > /dev/null
mv "$DB_FILE.part" "$DB_FILE"

echo "[$(date -Is)] бэкап файлов → $FILES_FILE"
docker compose exec -T api tar -C /data -czf - files > "$FILES_FILE.part"
tar -tzf "$FILES_FILE.part" > /dev/null
mv "$FILES_FILE.part" "$FILES_FILE"

# Ротация: удаляются только наши файлы бэкапа в BACKUP_DIR старше KEEP_DAYS дней
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'db-*.dump' -o -name 'files-*.tar.gz' \) -mtime +"$((KEEP_DAYS - 1))" -delete
find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.part' -mmin +60 -delete

echo "[$(date -Is)] готово: база $(du -h "$DB_FILE" | cut -f1), файлы $(du -h "$FILES_FILE" | cut -f1); бэкапов базы всего: $(ls "$BACKUP_DIR"/db-*.dump | wc -l)"

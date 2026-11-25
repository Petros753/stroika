#!/usr/bin/env bash
# Проверка восстановления: дамп → временная база stroyai_restore_check → сверка таблиц → удаление временной базы.
# Рабочую базу не трогает. Использование: ./restore-check.sh [путь к db-*.dump]
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"

BACKUP_DIR="${BACKUP_DIR:-/opt/stroyai/backups}"
PG_USER="$(grep -E '^POSTGRES_USER=' .env | cut -d= -f2-)"
PG_DB="$(grep -E '^POSTGRES_DB=' .env | cut -d= -f2-)"
TMP_DB=stroyai_restore_check

DUMP="${1:-$(ls -1t "$BACKUP_DIR"/db-*.dump | head -1)}"
FILES="$(ls -1t "$BACKUP_DIR"/files-*.tar.gz 2>/dev/null | head -1 || true)"
echo "Дамп: $DUMP"

psql_() { docker compose exec -T db psql -U "$PG_USER" -v ON_ERROR_STOP=1 -qAt "$@"; }

psql_ -d postgres -c "DROP DATABASE IF EXISTS $TMP_DB" -c "CREATE DATABASE $TMP_DB"
trap 'psql_ -d postgres -c "DROP DATABASE IF EXISTS $TMP_DB" >/dev/null; echo "Временная база $TMP_DB удалена"' EXIT

docker compose exec -T db pg_restore -U "$PG_USER" -d "$TMP_DB" --no-owner --exit-on-error < "$DUMP"

printf '%-16s %10s %10s\n' "таблица" "рабочая" "из бэкапа"
for t in alembic_version users projects user_projects audit_log login_attempts; do
  a="$(psql_ -d "$PG_DB" -c "SELECT count(*) FROM $t")"
  b="$(psql_ -d "$TMP_DB" -c "SELECT count(*) FROM $t")"
  printf '%-16s %10s %10s\n' "$t" "$a" "$b"
done
echo "Версия схемы: рабочая=$(psql_ -d "$PG_DB" -c 'SELECT version_num FROM alembic_version') бэкап=$(psql_ -d "$TMP_DB" -c 'SELECT version_num FROM alembic_version')"
echo "Пользователи в бэкапе: $(psql_ -d "$TMP_DB" -c "SELECT string_agg(login || ':' || role, ', ' ORDER BY login) FROM users")"
if [ -n "$FILES" ]; then
  echo "Архив файлов: $FILES — записей: $(tar -tzf "$FILES" | wc -l)"
fi
echo "ВОССТАНОВЛЕНИЕ: OK"

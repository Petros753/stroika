# Деплой СтройAI на 138.124.108.18

Схема: `Caddy (caddy-n8n, 80/443)` → сеть `n8n_data_default` → `stroyai-web:80` (nginx: статика + `/api`) → `api:8000` → `db`.
Наружу наши контейнеры портов не публикуют. Чужие контейнеры не трогаем.

| Сервис | Образ | mem_limit |
|---|---|---|
| db | postgres:17-alpine (shared_buffers 128MB) | 320m |
| api | backend/Dockerfile (миграции + bootstrap директора при старте) | 320m |
| web | frontend/Dockerfile (nginx) | 64m |

## Первый запуск

```bash
git clone <repo> /opt/stroyai && cd /opt/stroyai/deploy
cp .env.example .env   # заполнить: пароли через openssl rand -hex 24 / -hex 32
docker compose up -d --build
docker compose ps
```

Caddy: дописать содержимое `Caddyfile.stroyai` в `/opt/n8n_data/caddy/Caddyfile` (после бэкапа),
`docker exec caddy-n8n caddy validate --config /etc/caddy/Caddyfile`, затем `caddy reload`.

## Обновление

```bash
cd /opt/stroyai && git pull && cd deploy && docker compose up -d --build && docker compose ps
```

## Бэкап

- `backup.sh` — `pg_dump -Fc` + архив `/data/files` в `/opt/stroyai/backups`, хранение 14 дней.
- `restore-check.sh` — восстановление последнего дампа во временную базу `stroyai_restore_check`, сверка таблиц, удаление.
- cron: `/etc/cron.d/stroyai-backup` → `30 3 * * * root /opt/stroyai/deploy/backup.sh >> /var/log/stroyai-backup.log 2>&1`

## Локальная проверка (без сервера)

`docker-compose.local.yml` добавляет локальный Caddy на `http://localhost:8088` по той же схеме
(и CA-сертификат для сборки за TLS-прокси). В `.env`: `COOKIE_SECURE=false`, `ALLOWED_ORIGINS=http://localhost:8088`.

```bash
docker network create n8n_data_default   # локально, если сети нет
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
cd ../frontend && E2E_LOGIN=aslan E2E_PASSWORD=... E2E_NEW_PASSWORD=... npm run e2e
```

# СтройAI — API (FastAPI)

Python 3.12, FastAPI, SQLAlchemy 2, Alembic, psycopg 3, PostgreSQL 17. Зависимости — [uv](https://docs.astral.sh/uv/).

```
app/main.py         приложение, /api/health, защита от CSRF (Origin + только JSON)
app/security.py     argon2, JWT в httpOnly-cookie, Access(...) / Public — декларация доступа эндпоинта
app/permissions.py  матрица прав из shared/permissions.json
app/routers/        auth (вход/выход/смена пароля/сессия), users (сотрудники), misc (объекты, журнал, матрица)
app/cli.py          bootstrap (директор из .env), create-admin (служебная роль admin)
alembic/            миграции
tests/              pytest на реальном PostgreSQL, вкл. матрицу «роль × эндпоинт»
```

## Проверки

```bash
docker run -d --name stroyai-testdb -e POSTGRES_USER=stroyai -e POSTGRES_PASSWORD=stroyai -p 5433:5432 postgres:17-alpine
uv sync
uv run ruff check .
uv run mypy app tests
uv run pytest            # база stroyai_test создаётся заново и мигрируется alembic'ом
```

Другая база для тестов: `TEST_DATABASE_URL=postgresql+psycopg://user:pass@host:port/dbname`.

## Правила для новых эндпоинтов

Каждый эндпоинт объявляет доступ: `Depends(Access("perm.name"))`, `Depends(Access())` (любой вошедший)
или `dependencies=[Depends(PUBLIC)]`. Тест `tests/test_permissions_matrix.py` падает, если:
- у маршрута нет декларации доступа;
- маршрут не описан в `CASES`/`SPEC` (спецификация права независимо от кода);
- хоть одна роль получает не то, что положено по `shared/permissions.json` (2xx / 403).

## Служебный администратор (для Петра)

```bash
docker compose exec api python -m app.cli create-admin petr "Пётр"
```

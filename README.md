# СтройAI

ERP для строительной компании: проекты, снабжение и склад, сметы и КС-2/КС-3, себестоимость, ПТО (акты, сертификаты, фото, исполнительные схемы), чертежи DXF/DWG.

- `frontend/` — React-приложение (из одобренного прототипа)
- `backend/` — FastAPI (создаётся на этапе 1)
- `shared/permissions.json` — матрица прав (генерируется: `cd frontend && npm run gen:permissions`)
- `deploy/` — Docker Compose и деплой
- `CLAUDE.md` — инструкция для разработки (Claude Code), `docs/FIRST_PROMPT.md` — первый запрос

Демо-прототип: https://stroika.petr-ai.ru. Рабочая система: https://app.stroika.petr-ai.ru (после этапа 1).

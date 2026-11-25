# Сборка из корня репозитория: docker build -f backend/Dockerfile .
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_PYTHON_DOWNLOADS=never

# Необязательный секрет "ca" — доп. корневой сертификат для сборки за TLS-прокси (только локальная проверка,
# deploy/docker-compose.local.yml). На сервере секрет не передаётся и шаг ничего не меняет.
RUN --mount=type=secret,id=ca,required=false \
    if [ -s /run/secrets/ca ]; then export PIP_CERT=/run/secrets/ca; fi; \
    pip install --no-cache-dir uv==0.11.32

WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock backend/.python-version ./
RUN --mount=type=secret,id=ca,required=false \
    if [ -s /run/secrets/ca ]; then export SSL_CERT_FILE=/run/secrets/ca; fi; \
    uv sync --frozen --no-dev --no-install-project

COPY backend/ ./
COPY shared/ /app/shared/

ENV PATH=/opt/venv/bin:$PATH \
    PERMISSIONS_PATH=/app/shared/permissions.json

RUN useradd --system --uid 10001 --no-create-home app \
    && mkdir -p /data/files && chown app /data/files
USER app

EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4).status == 200 else 1)"

# Миграции → директор из .env (если ещё нет) → API.
# --proxy-headers: реальный IP клиента из X-Forwarded-For (api доступен только из внутренней сети compose)
CMD ["sh", "-c", "alembic upgrade head && python -m app.cli bootstrap && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*' --no-server-header"]

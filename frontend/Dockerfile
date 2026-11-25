# Сборка из корня репозитория: docker build -f frontend/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
# Секрет "ca" — см. backend/Dockerfile (только локальная сборка за TLS-прокси)
RUN --mount=type=secret,id=ca,required=false \
    if [ -s /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    npm ci --no-audit --no-fund
COPY frontend/ ./
# Разделы, уже переведённые на API (расширяется по этапам)
ARG VITE_ENABLED_SECTIONS=employees
ENV VITE_ENABLED_SECTIONS=$VITE_ENABLED_SECTIONS
RUN npm run build

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
    CMD wget -q -O /dev/null http://127.0.0.1/nginx-health || exit 1

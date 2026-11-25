import { defineConfig } from '@playwright/test'

/**
 * e2e рабочей версии. Запуск против развёрнутого стека (через Caddy):
 *   E2E_BASE_URL=https://app.stroika.petr-ai.ru E2E_LOGIN=... E2E_PASSWORD=... npm run e2e
 * Локально: deploy/docker-compose.local.yml поднимает Caddy на http://localhost:8088 (значение по умолчанию).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8088',
    locale: 'ru-RU',
    trace: 'off',
    ...(process.env.E2E_CHROMIUM ? { launchOptions: { executablePath: process.env.E2E_CHROMIUM } } : {}),
  },
})

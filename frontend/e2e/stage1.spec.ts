/**
 * Этап 1 «Каркас»: руководитель входит → создаёт сотрудника с ролью → сотрудник входит,
 * меняет временный пароль и видит только свои разделы → блокировка (заодно убирает тестового сотрудника).
 *
 * Переменные: E2E_LOGIN / E2E_PASSWORD — учётная запись с правом employees.manage (директор или admin).
 * Если у неё ещё временный пароль (свежая база), нужен E2E_NEW_PASSWORD — тест сменит пароль сам.
 * В консоли браузера не должно быть ни одной ошибки (кроме ожидаемых в негативных проверках).
 */
import { expect, test, type Page } from '@playwright/test'

const LOGIN = process.env.E2E_LOGIN ?? 'aslan'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Start12345'
const NEW_PASSWORD = process.env.E2E_NEW_PASSWORD

function trackConsole(page: Page) {
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))
  return errors
}

async function login(page: Page, login: string, password: string) {
  await page.goto('/')
  await page.getByLabel('Логин', { exact: true }).fill(login)
  await page.getByLabel('Пароль', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Войти' }).click()
}

async function logout(page: Page) {
  await page.getByRole('button', { name: 'Меню пользователя' }).click()
  await page.getByRole('button', { name: 'Выйти' }).click()
  await expect(page.getByRole('button', { name: 'Войти' })).toBeVisible()
}

async function changePassword(page: Page, current: string, next: string) {
  await page.getByLabel(/Временный пароль|Текущий пароль/).fill(current)
  await page.getByLabel('Новый пароль', { exact: true }).fill(next)
  await page.getByLabel('Повторите новый пароль', { exact: true }).fill(next)
  await page.getByRole('button', { name: 'Сменить пароль' }).click()
}

/** Вход руководителя; на свежей базе — смена временного пароля из .env */
async function loginManager(page: Page) {
  await login(page, LOGIN, PASSWORD)
  const forced = page.getByText('Смена временного пароля')
  const home = page.getByTestId('current-user')
  await expect(forced.or(home)).toBeVisible()
  if (await forced.isVisible()) {
    test.skip(!NEW_PASSWORD, 'У руководителя временный пароль: задайте E2E_NEW_PASSWORD')
    await changePassword(page, PASSWORD, NEW_PASSWORD!)
    await expect(home).toBeVisible()
  }
}

test('неверный пароль — понятная ошибка, без входа', async ({ page }) => {
  const errors = trackConsole(page)
  await login(page, LOGIN, 'definitely-wrong-1')
  await expect(page.getByRole('alert')).toHaveText('Неверный логин или пароль')
  await expect(page.getByTestId('current-user')).toHaveCount(0)
  // единственная допустимая ошибка консоли — сам ответ 401 на /api/auth/login
  expect(errors.filter((e) => !e.includes('401'))).toEqual([])
})

test('этап 1: сотрудник создаётся, входит, меняет пароль, видит только свои разделы', async ({ page, browser }) => {
  const errors = trackConsole(page)
  await loginManager(page)

  // В рабочей сборке нет демо-разделов прототипа
  const nav = page.getByRole('navigation', { name: 'Разделы' })
  await expect(nav.getByRole('link')).toHaveText(['Главная', 'Сотрудники и права'])

  // Создание сотрудника
  await nav.getByRole('link', { name: 'Сотрудники и права' }).click()
  await page.getByRole('button', { name: 'Добавить сотрудника' }).click()
  const empLogin = `e2e.${Date.now().toString(36)}`
  await page.getByLabel('ФИО', { exact: true }).fill('Тестов Прораб Е2Е')
  await page.getByLabel('Должность', { exact: true }).fill('Прораб (автотест)')
  await page.getByLabel('Логин', { exact: true }).fill(empLogin)
  await page.getByLabel('Роль', { exact: true }).selectOption({ label: 'Прораб' })
  await expect(page.getByLabel('Роль', { exact: true }).locator('option', { hasText: 'Администратор' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Создать' }).click()
  await expect(page.getByTestId('issued-login')).toHaveText(empLogin)
  const temp = (await page.getByTestId('issued-password').textContent())!.trim()
  await page.getByRole('button', { name: 'Готово' }).click()
  const row = page.locator(`tr[data-login="${empLogin}"]`)
  await expect(row).toContainText('Временный пароль')
  await expect(row).toContainText('Прораб')

  // Сотрудник — в отдельном браузерном контексте
  const ctx = await browser.newContext()
  const emp = await ctx.newPage()
  const empErrors = trackConsole(emp)
  await login(emp, empLogin, temp)
  await expect(emp.getByText('Смена временного пароля')).toBeVisible()
  await changePassword(emp, temp, 'Foreman2026x')
  await expect(emp.getByTestId('current-user')).toHaveText('Тестов Прораб Е2Е')
  await expect(emp.getByRole('navigation', { name: 'Разделы' }).getByRole('link')).toHaveText(['Главная'])
  await emp.goto('/#/employees')
  await expect(emp.getByText('Нет доступа к разделу')).toBeVisible()
  // Сервер тоже не пускает (кнопки — не защита)
  const apiUsers = await emp.request.get('/api/users')
  expect(apiUsers.status()).toBe(403)
  expect(empErrors).toEqual([])

  // Блокировка — завершает сеанс сотрудника и убирает тестовую запись из активных
  await row.getByRole('button', { name: `Заблокировать ${empLogin}` }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Заблокировать' }).click()
  await expect(row).toContainText('Заблокирован')
  await emp.reload()
  await expect(emp.getByRole('button', { name: 'Войти' })).toBeVisible()
  await ctx.close()

  // Журнал действий
  await page.getByRole('button', { name: 'Журнал действий' }).click()
  const audit = page.getByTestId('audit-table')
  await expect(audit).toContainText('Сотрудник заблокирован')
  await expect(audit).toContainText('Создан сотрудник')
  await expect(audit).toContainText('Смена пароля')

  // Смена пароля руководителем по своей инициативе и обратно (меню профиля)
  await page.getByRole('button', { name: 'Меню пользователя' }).click()
  await page.getByRole('button', { name: 'Сменить пароль' }).click()
  await expect(page.getByRole('heading', { name: 'Смена пароля' })).toBeVisible()

  await logout(page)
  expect(errors).toEqual([])
})

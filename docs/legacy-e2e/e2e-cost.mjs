import { chromium } from '/tmp/pw/node_modules/playwright/index.mjs'
import fs from 'fs'
const base = 'http://localhost:4173/'
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()) })
const ok = (c, msg) => console.log((c ? 'PASS ' : 'FAIL ') + msg)
const setUser = async (id) => { await page.evaluate((id) => { const k='stroyai-demo-v1'; const s = JSON.parse(localStorage.getItem(k) || '{"state":{},"version":5}'); s.state.currentUserId = id; localStorage.setItem(k, JSON.stringify(s)) }, id); await page.reload(); await page.waitForTimeout(700) }
const money = (t) => Number(t.replace(/[^\d,]/g, '').replace(',', '.'))

await page.goto(base); await page.evaluate(() => localStorage.clear())
const kpi = async (l) => money(await page.locator(`[data-kpi="${l}"] div`).nth(1).innerText())

await page.goto(base); await page.evaluate(() => localStorage.clear())
// миграция v4 → v5: площади у объектов, демо-расчёты
await page.evaluate(() => localStorage.setItem('stroyai-demo-v1', JSON.stringify({ state: { currentUserId: 'u_dir', projects: [{ id: 'p1', name: 'X', address: 'г. Москва', customer: '', managerId: 'u_pm1', startDate: '2025-03-01', endDate: '2027-06-30', budget: 1, status: 'in_progress', progress: 1 }] }, version: 4 })))
await page.goto(base + '#/costing'); await page.reload(); await page.waitForTimeout(800)
const mig = await page.evaluate(() => JSON.parse(localStorage.getItem('stroyai-demo-v1')))
ok(mig.version >= 5 && mig.state.projects[0].area === 18000 && mig.state.costCalcs.length === 3, 'миграция v4→v5')
await page.evaluate(() => localStorage.clear()); await setUser('u_dir')

await page.goto(base + '#/costing'); await page.waitForTimeout(700)
ok(await page.getByText('Себестоимость', { exact: true }).first().isVisible(), 'пункт меню у директора')
ok((await page.locator('[data-cost-project]').count()) === 4, 'директор видит 4 объекта')
await page.locator('[data-cost-project="p3"]').click(); await page.waitForTimeout(300)
ok(await page.getByText('прогноз убытка').isVisible(), 'медцентр: прогноз убытка')
await page.screenshot({ path: '/tmp/c1.png' })
// по аналогу
await page.locator('[data-cost-project="p1"]').click(); await page.waitForTimeout(200)
await page.getByRole('button', { name: 'Рассчитать новый объект по аналогу' }).click(); await page.waitForTimeout(500)
ok(await page.getByText('не сохранено').isVisible() && (await page.locator('select').first().inputValue()) === 'p1', 'открыт расчёт по аналогу p1')
const c1 = await kpi('Себестоимость')
await page.getByLabel('Площадь').fill('9000'); await page.waitForTimeout(200)
const c2 = await kpi('Себестоимость')
ok(Math.abs(c2 / c1 - 0.5) < 0.01, `себестоимость пропорциональна площади: ${c1} → ${c2}`)
await page.getByRole('button', { name: 'Сохранить', exact: true }).click(); await page.waitForTimeout(300)
ok((await page.locator('[data-calc]').count()) === 4, 'расчёт сохранён в список')
// укрупнённо
await page.locator('[data-calc="cc_1"]').click(); await page.waitForTimeout(300)
const k1 = await kpi('Себестоимость')
ok(k1 > 3e8 && k1 < 5e8, 'детсад: себестоимость в разумных пределах ' + k1)
await page.locator('select').nth(1).selectOption('Москва'); await page.waitForTimeout(200)
ok(await kpi('Себестоимость') > k1, 'Москва дороже Астрахани')
await page.getByLabel('Площадь').fill('4200')
await page.locator('input[type=number]').nth(2).fill('6'); await page.waitForTimeout(200)
ok(await page.getByText(/короче нормативного/).isVisible(), 'предупреждение о сжатом сроке')
const sumGroups = await page.locator('tr[data-group]').count()
ok(sumGroups === 8, 'все 8 групп работ: ' + sumGroups)
await page.screenshot({ path: '/tmp/c2.png', fullPage: true })
let [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Word' }).click()])
ok(fs.readFileSync(await dl.path(), 'utf8').includes('ПРЕДВАРИТЕЛЬНЫЙ РАСЧЁТ'), 'Word расчёта с оговоркой')
;[dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'CSV' }).click()])
ok(fs.readFileSync(await dl.path(), 'utf8').includes('Цена с НДС'), 'CSV расчёта')
await page.getByRole('button', { name: 'Сохранить копию' }).click(); await page.waitForTimeout(300)
ok((await page.locator('[data-calc]').count()) === 5 && await page.getByText('(копия)').first().isVisible(), 'копия сохранена')
await page.getByRole('button', { name: 'Удалить' }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Удалить' }).click(); await page.waitForTimeout(300)
ok((await page.locator('[data-calc]').count()) === 4, 'копия удалена')

// бухгалтер: только просмотр
await setUser('u_acc')
await page.goto(base + '#/costing?tab=new'); await page.waitForTimeout(600)
ok((await page.getByRole('button', { name: 'Новый расчёт' }).count()) === 0 && await page.getByLabel('Площадь').isDisabled(), 'бухгалтер: только просмотр')
// прораб: нет доступа
await setUser('u_for1'); await page.goto(base + '#/costing'); await page.waitForTimeout(500)
ok((await page.locator('[data-cost-project]').count()) === 0, 'прорабу раздел закрыт')
// РП видит только свои
await setUser('u_pm1'); await page.goto(base + '#/costing'); await page.waitForTimeout(500)
ok((await page.locator('[data-cost-project]').count()) === 2, 'РП №1 видит 2 своих объекта')
// ассистент
await setUser('u_dir'); await page.goto(base + '#/assistant'); await page.waitForTimeout(600)
await page.getByRole('button', { name: 'Какая себестоимость объектов?' }).click(); await page.waitForTimeout(800)
ok(await page.getByText(/Прогноз убытка: Медицинский/).first().isVisible(), 'ассистент: себестоимость и убыток')
await page.setViewportSize({ width: 390, height: 800 }); await page.goto(base + '#/costing?tab=new'); await page.waitForTimeout(600)
await page.screenshot({ path: '/tmp/c3.png' })
console.log('ERRORS', errors.length, errors.slice(0, 5))
await browser.close()

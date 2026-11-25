import { chromium } from '/tmp/pw/node_modules/playwright/index.mjs'
const base = 'http://localhost:4173/'
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()) })
const ok = (c, msg) => console.log((c ? 'PASS ' : 'FAIL ') + msg)
const setUser = async (id) => {
  await page.evaluate((id) => { const s = JSON.parse(localStorage.getItem('stroyai-demo-v1')); s.state.currentUserId = id; localStorage.setItem('stroyai-demo-v1', JSON.stringify(s)) }, id)
  await page.reload(); await page.waitForTimeout(500)
}
await page.goto(base); await page.waitForTimeout(800)

// 1. Директор согласует ЗК-0002
await page.goto(base + '#/procurement'); await page.waitForTimeout(500)
await page.getByText('ЗК-0002').first().click()
await page.getByRole('button', { name: /Согласовать/ }).click()
ok(await page.getByText('Согласована', { exact: true }).first().isVisible(), 'ЗК-0002 согласована директором')
await page.keyboard.press('Escape')

// 2. Снабженец выбирает поставщика
await setUser('u_sup')
await page.goto(base + '#/procurement'); await page.waitForTimeout(500)
await page.getByText('ЗК-0002').first().click()
const rows = await page.locator('tbody tr').filter({ hasText: 'Дешевле всех' })
ok(await rows.count() === 1, 'Один поставщик помечен «Дешевле всех»')
await rows.getByRole('button', { name: 'Выбрать' }).click()
ok(await page.getByText(/Заказ ЗАК-/).first().isVisible(), 'Сформирован заказ')
await page.getByRole('button', { name: /Принять на склад/ }).click()
ok(await page.getByText('Открыть склад').isVisible(), 'Заказ принят на склад')
await page.keyboard.press('Escape')

// 3. Остаток на складе ЖК вырос
await page.goto(base + '#/warehouse?wh=w_p1'); await page.waitForTimeout(500)
const rebarRow = page.locator('tr').filter({ hasText: 'Арматура' })
const txt = await rebarRow.first().innerText()
console.log('Арматура на складе ЖК:', txt.replace(/\s+/g, ' '))
ok(/44/.test(txt), 'Остаток арматуры 14 + 30 = 44 т')

// 4. Прораб ограничен своими объектами
await setUser('u_for1')
await page.goto(base + '#/projects'); await page.waitForTimeout(500)
const n = await page.locator('.card').filter({ hasText: 'Заказчик' }).count()
ok(n === 1, 'Прораб ЖК видит 1 объект, видит: ' + n)
const menu = await page.locator('nav a').allInnerTexts()
console.log('Меню прораба:', menu.join(' | '))
console.log(errors.length ? errors.join('\n') : 'no console errors')
await browser.close()

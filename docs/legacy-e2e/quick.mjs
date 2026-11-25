import { chromium } from '/tmp/pw/node_modules/playwright/index.mjs'
const base = 'http://localhost:4173/'
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()) })
page.on('dialog', (d) => d.dismiss())
const users = ['u_admin','u_dir','u_pm1','u_pto','u_est','u_sup','u_for1','u_acc']
const paths = ['', 'projects', 'projects/p1?tab=overview', 'projects/p2?tab=stages', 'projects/p3?tab=estimates', 'projects/p1?tab=exec', 'pto?tab=quality', 'pto?tab=photos', 'procurement', 'warehouse', 'cad', 'cad?mode=dxf', 'cad?mode=dxf&project=p4', 'estimates', 'execution', 'execution?project=p3', 'costing', 'costing?tab=new', 'mail', 'mail?letter=L5', 'pto', 'assistant', 'knowledge', 'employees']
let blank = 0
await page.goto(base); await page.evaluate(() => localStorage.clear())
for (const u of users) {
  await page.evaluate((id) => localStorage.setItem('stroyai-demo-v1', JSON.stringify({ state: { currentUserId: id }, version: 3 })), u)
  for (const p of paths) {
    await page.goto(base + '#/' + p); await page.waitForTimeout(200)
    const t = (await page.locator('main').innerText().catch(() => '')).trim()
    if (t.length < 20) { blank++; console.log('BLANK', u, p) }
  }
}
// открыть каждую справку у админа во всех объектах, обе вкладки
await page.evaluate(() => localStorage.setItem('stroyai-demo-v1', JSON.stringify({ state: { currentUserId: 'u_admin' }, version: 4 })))
let opened = 0
for (const p of ['p1','p2','p3','p4']) {
  await page.goto(base + '#/execution?project=' + p); await page.waitForTimeout(400)
  const n = await page.locator('tr[data-report]').count()
  for (let i = 0; i < n; i++) {
    await page.locator('tr[data-report]').nth(i).click(); await page.waitForTimeout(200)
    await page.getByRole('button', { name: /КС-3/ }).click(); await page.waitForTimeout(150)
    await page.keyboard.press('Escape'); opened++
  }
}
console.log('blank', blank, 'opened', opened, 'ERRORS', errors.length, errors.slice(0, 5))
await browser.close()

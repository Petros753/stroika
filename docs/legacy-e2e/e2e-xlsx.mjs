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
const setUser = async (id) => { await page.evaluate((id) => { const k='stroyai-demo-v1'; const s = JSON.parse(localStorage.getItem(k) || '{"state":{},"version":8}'); s.state.currentUserId = id; localStorage.setItem(k, JSON.stringify(s)) }, id); await page.reload(); await page.waitForTimeout(700) }
const money = (t) => Number(t.replace(/[^\d,]/g, '').replace(',', '.'))

import ExcelJS from '/home/claude/stroyai/node_modules/exceljs/excel.js'
const readX = async (p) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(p); return wb }
await page.goto(base); await page.evaluate(() => localStorage.clear()); await setUser('u_admin')
// АОСР
await page.goto(base + '#/pto?project=p1'); await page.waitForTimeout(700)
await page.getByRole('button', { name: 'Создать документ' }).click(); await page.waitForTimeout(300)
await page.getByRole('button', { name: 'Создать черновик' }).click(); await page.waitForTimeout(600)
let [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Excel' }).click()])
fs.copyFileSync(await dl.path(), '/tmp/aosr.xlsx')
let wb = await readX('/tmp/aosr.xlsx'); let ws = wb.worksheets[0]
const texts = []; ws.eachRow((r) => texts.push(r.values.filter(Boolean).map(v => typeof v === 'object' ? JSON.stringify(v) : v).join(' | ')))
ok(dl.suggestedFilename().endsWith('.xlsx'), 'файл .xlsx: ' + dl.suggestedFilename())
ok(texts.some(t => t.includes('АКТ ОСВИДЕТЕЛЬСТВОВАНИЯ СКРЫТЫХ РАБОТ')), 'заголовок акта')
ok(texts.some(t => t.startsWith('Объект капитального строительства')), 'реквизиты таблицей')
ok(texts.some(t => /^\d+ \| Паспорт качества № 4417-25/.test(t)), 'приложения пронумерованы')
ok(texts.some(t => t.includes('Строительный контроль')), 'блок подписей')
console.log(texts.slice(0, 40).join('\n'))
await page.keyboard.press('Escape')
// гидроиспытания
await page.getByRole('button', { name: 'Создать документ' }).click(); await page.waitForTimeout(300)
await page.getByLabel('Вид документа').selectOption('Акт гидравлических испытаний')
await page.getByRole('button', { name: 'Создать черновик' }).click(); await page.waitForTimeout(600)
;[dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Excel' }).click()])
wb = await readX(await dl.path()); ws = wb.worksheets[0]
const t2 = []; ws.eachRow((r) => t2.push(r.values.filter(Boolean).join(' | ')))
ok(t2.some(t => t.includes('Испытательное давление')), 'акт гидроиспытаний в Excel')
await page.keyboard.press('Escape')
// КС-2 / КС-3
await page.goto(base + '#/execution?project=p2'); await page.waitForTimeout(700)
await page.locator('[data-report="2"]').click(); await page.waitForTimeout(300)
;[dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Excel' }).click()])
fs.copyFileSync(await dl.path(), '/tmp/ks2.xlsx')
wb = await readX('/tmp/ks2.xlsx'); ws = wb.worksheets[0]
let totalCell = null, itemFormula = null
ws.eachRow((r) => { if (r.getCell(1).value === 'Итого') totalCell = r.getCell(9).value; if (typeof r.getCell(1).value === 'number' && !itemFormula) itemFormula = r.getCell(9).value })
const uiTotal = await page.getByText(/За период: /).innerText()
ok(totalCell?.formula?.includes('SUMPRODUCT') && totalCell.result > 0, 'итог КС-2 — формула: ' + JSON.stringify(totalCell))
ok(itemFormula?.formula?.startsWith('G') , 'стоимость строки = кол-во × цена: ' + JSON.stringify(itemFormula))
console.log('UI', uiTotal)
await page.getByRole('button', { name: /КС-3/ }).click(); await page.waitForTimeout(200)
;[dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Excel' }).click()])
fs.copyFileSync(await dl.path(), '/tmp/ks3.xlsx')
ok(dl.suggestedFilename().includes('KS3'), 'КС-3 в Excel')
console.log('ERRORS', errors.length, errors.slice(0, 5))
await browser.close()

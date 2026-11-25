import { chromium } from '/tmp/pw/node_modules/playwright/index.mjs'
import fs from 'fs'
const base = 'http://localhost:4173/'
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 }, acceptDownloads: true })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()) })
const ok = (c, msg) => console.log((c ? 'PASS ' : 'FAIL ') + msg)
await page.goto(base + '#/cad'); await page.waitForTimeout(1000)
await page.screenshot({ path: '/tmp/cad0.png' })

// клик по розетке → свойства
const cnt = await page.locator('svg [data-id]').count()
console.log('hit areas:', cnt)
await page.getByRole('button', { name: 'Найди пересечения инженерных сетей' }).click()
await page.waitForTimeout(600)
ok(await page.getByText('Найдено пересечений: 7').first().isVisible(), 'Найдено 7 пересечений')
await page.screenshot({ path: '/tmp/cad1.png' })

await page.locator('input[placeholder^="Например"]').fill('Добавь три розетки в помещении №5')
await page.keyboard.press('Enter'); await page.waitForTimeout(600)
ok(await page.getByText('Добавлено розеток: 3').first().isVisible(), 'Добавлено 3 розетки')
await page.screenshot({ path: '/tmp/cad2.png' })
await page.locator('input[placeholder^="Например"]').fill('Посчитай все розетки на первом этаже')
await page.keyboard.press('Enter'); await page.waitForTimeout(500)
ok(await page.getByText('Розетки: 42').first().isVisible(), 'После добавления розеток стало 42')

// история и отмена
await page.getByRole('button', { name: 'История' }).click()
ok(await page.getByText('Добавлено розеток: 3').first().isVisible(), 'Запись в истории')
await page.getByRole('button', { name: /Отменить/ }).click()
await page.getByRole('button', { name: 'AI-команды' }).click()
await page.locator('input[placeholder^="Например"]').fill('Посчитай все розетки на первом этаже')
await page.keyboard.press('Enter'); await page.waitForTimeout(500)
const titles = await page.locator('text=/Розетки: \\d+/').allInnerTexts()
console.log('Результаты подсчёта:', titles.join(' | '))
ok(titles[titles.length - 1].includes('39'), 'После отмены снова 39')

// SVG экспорт
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'SVG' }).first().click()])
const path = '/tmp/' + dl.suggestedFilename(); await dl.saveAs(path)
const svg = fs.readFileSync(path, 'utf8')
ok(svg.startsWith('<?xml') && svg.includes('<svg') && svg.includes('viewBox'), 'SVG-файл скачан: ' + dl.suggestedFilename() + ' (' + svg.length + ' байт)')

// DWG — демо-окно, файл не создаётся
let gotDownload = false; page.once('download', () => { gotDownload = true })
await page.getByRole('button', { name: 'DWG' }).click()
ok(await page.getByText('файл DWG не создаётся').isVisible(), 'DWG: показано демо-окно')
await page.keyboard.press('Escape')
ok(!gotDownload, 'DWG: файл не скачивается')
// ведомость + CSV
await page.locator('input[placeholder^="Например"]').fill('Создай ведомость электрических точек')
await page.keyboard.press('Enter'); await page.waitForTimeout(500)
const [dl2] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Скачать CSV/ }).click()])
await dl2.saveAs('/tmp/ved.csv'); console.log(fs.readFileSync('/tmp/ved.csv', 'utf8').split('\n').slice(0, 3).join('\n'))
console.log(errors.length ? errors.join('\n') : 'no console errors')
await browser.close()

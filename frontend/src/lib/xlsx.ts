/** Выгрузка документов в настоящий Excel (.xlsx): рамки, объединённые ячейки, ширина колонок, печать на А4.
 *  Библиотека ExcelJS грузится только по нажатию кнопки (не утяжеляет приложение). */
import type { Ks2, Ks3 } from '../domain/execution'
import { formatDate } from './date'

type Wb = import('exceljs').Workbook
type Ws = import('exceljs').Worksheet

const DEMO = 'ДЕМОНСТРАЦИОННЫЙ ШАБЛОН. Не является юридически проверенной формой — сверить с действующими требованиями (приказ Минстроя России № 344/пр) и шаблонами компании.'
const thin = { style: 'thin' as const, color: { argb: 'FF555555' } }
const box = { top: thin, left: thin, bottom: thin, right: thin }

async function book(): Promise<Wb> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'СтройAI (демо)'
  return wb
}
function sheet(wb: Wb, name: string, widths: number[]): Ws {
  const ws = wb.addWorksheet(name.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '), {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.6, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
  })
  ws.columns = widths.map((w) => ({ width: w }))
  return ws
}
/** Строка на всю ширину (объединённая) */
function wide(ws: Ws, text: string, cols: number, o: { bold?: boolean; size?: number; center?: boolean; fill?: string; color?: string; height?: number } = {}) {
  const r = ws.addRow([text])
  ws.mergeCells(r.number, 1, r.number, cols)
  const c = r.getCell(1)
  c.font = { name: 'Times New Roman', size: o.size ?? 11, bold: o.bold, color: o.color ? { argb: o.color } : undefined }
  c.alignment = { wrapText: true, vertical: 'middle', horizontal: o.center ? 'center' : 'left' }
  if (o.fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: o.fill } }
  const perLine = ws.columns.slice(0, cols).reduce((acc, col) => acc + (col.width ?? 10), 0) * 1.1 * (11 / (o.size ?? 11))
  r.height = o.height ?? Math.max(16, Math.ceil(text.length / perLine) * 15)
  return r
}
/** Строка таблицы с рамками; merge = объединить ячейки с индекса from по to (1-based) */
function tableRow(ws: Ws, values: (string | number)[], o: { bold?: boolean; fill?: string; merge?: [number, number][]; numFmt?: Record<number, string>; height?: number } = {}) {
  const r = ws.addRow(values)
  r.eachCell({ includeEmpty: true }, (c, i) => {
    c.border = box
    c.font = { name: 'Times New Roman', size: 10, bold: o.bold }
    c.alignment = { wrapText: true, vertical: 'top', horizontal: typeof values[i - 1] === 'number' ? 'right' : 'left' }
    if (o.fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: o.fill } }
    if (o.numFmt?.[i]) c.numFmt = o.numFmt[i]
  })
  for (const [a, b] of o.merge ?? []) ws.mergeCells(r.number, a, r.number, b)
  const widthOf = (i: number) => { const m = (o.merge ?? []).find(([x]) => x === i + 1); const cols = m ? ws.columns.slice(m[0] - 1, m[1]) : [ws.columns[i]]; return cols.reduce((acc, col) => acc + (col?.width ?? 10), 0) * 0.95 }
  const lines = Math.max(...values.map((v, i) => Math.ceil(String(v).length / widthOf(i))))
  r.height = o.height ?? Math.max(16, lines * 13.5)
  return r
}
async function save(wb: Wb, filename: string) {
  const buf = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

// ---------- акты ИД (АОСР и др.) ----------
/** Разбор текста акта (как он сформирован или отредактирован) на реквизиты, перечни и абзацы */
export function parseActBody(body: string) {
  const lines = body.split('\n')
  const req: [string, string][] = []
  const blocks: ({ kind: 'list'; title: string; items: string[] } | { kind: 'text'; text: string })[] = []
  let title = '', number = '', signer = '', reps = '', note = ''
  let list: { kind: 'list'; title: string; items: string[] } | null = null
  const REQ = /^(Объект капитального строительства|Адрес|Застройщик \/ технический заказчик|Лицо, осуществляющее строительство|Этап|Корпус \/ участок|Вид работ):\s*(.*)$/
  for (const raw of lines) {
    const l = raw.trimEnd()
    if (!l.trim() || l.startsWith('ДЕМОНСТРАЦИОННЫЙ ШАБЛОН')) { list = null; continue }
    const item = l.match(/^\s+(?:\d+\.|\d{2}\.\d{2}\.\d{4} —)\s*(.*)$/)
    if (item && list) { list.items.push(item[1] || l.trim()); continue }
    if (!title && l === l.toUpperCase() && /[А-Я]/.test(l)) { title = l; continue }
    if (/^№ .* от /.test(l)) { number = l; continue }
    const m = l.match(REQ)
    if (m) { req.push([m[1], m[2]]); continue }
    if (l.startsWith('Подготовил:')) { signer = l.replace('Подготовил:', '').trim(); continue }
    if (l.startsWith('Представители:')) { reps = l; continue }
    if (l.startsWith('Примечание:')) { note = l.replace('Примечание:', '').trim(); continue }
    if (l.endsWith(':')) { list = { kind: 'list', title: l.slice(0, -1), items: [] }; blocks.push(list); continue }
    list = null
    blocks.push({ kind: 'text', text: l.trim() })
  }
  return { title, number, req, blocks, signer, reps, note }
}

export async function actXlsx(docTitle: string, version: number, body: string, filename: string) {
  const p = parseActBody(body)
  const wb = await book()
  const ws = sheet(wb, p.title || docTitle, [5, 34, 12, 12, 26])
  const C = 5
  wide(ws, DEMO, C, { size: 9, fill: 'FFFFF4E5', color: 'FF92400E', height: 30 })
  ws.addRow([])
  wide(ws, p.title || docTitle.toUpperCase(), C, { bold: true, size: 13, center: true, height: 34 })
  wide(ws, `${p.number || '№ ____ от ____'} · версия ${version}`, C, { center: true })
  ws.addRow([])
  for (const [k, v] of p.req) tableRow(ws, [k, '', v, '', ''], { merge: [[1, 2], [3, 5]] }).getCell(1).font = { name: 'Times New Roman', size: 10, bold: true }
  for (const b of p.blocks) {
    ws.addRow([])
    if (b.kind === 'text') { wide(ws, b.text, C); continue }
    wide(ws, b.title, C, { bold: true })
    const isAttach = /Приложения/.test(b.title)
    if (isAttach) {
      tableRow(ws, ['№', 'Документ', '', '', ''], { bold: true, fill: 'FFEEEEEE', merge: [[2, 5]] })
      b.items.forEach((t, i) => tableRow(ws, [i + 1, t, '', '', ''], { merge: [[2, 5]] }))
    } else {
      tableRow(ws, ['№', 'Наименование работ / документа', 'Ед. изм.', 'Объём', 'Примечание'], { bold: true, fill: 'FFEEEEEE' })
      b.items.forEach((t, i) => tableRow(ws, [i + 1, t, '', '', '']))
    }
  }
  if (p.note) { ws.addRow([]); wide(ws, `Примечание: ${p.note}`, C) }
  ws.addRow([])
  wide(ws, 'Подписи', C, { bold: true })
  tableRow(ws, ['', 'Представитель', 'Должность', 'ФИО', 'Подпись, дата'], { bold: true, fill: 'FFEEEEEE' })
  ;['Застройщик / технический заказчик', 'Лицо, осуществляющее строительство', 'Строительный контроль', 'Лицо, осуществляющее подготовку ПД', 'Лицо, выполнившее работы'].forEach((r, i) => tableRow(ws, [i + 1, r, '', '', ''], { height: 28 }))
  if (p.signer) { ws.addRow([]); wide(ws, `Подготовил: ${p.signer}`, C, { size: 10 }) }
  await save(wb, filename)
}

// ---------- КС-2 / КС-3 ----------
export async function ks2Xlsx(k: Ks2, head: { number: number; project: string; estimate: string; period: string }, filename: string) {
  const wb = await book()
  const ws = sheet(wb, `КС-2 №${head.number}`, [5, 14, 46, 8, 11, 11, 11, 13, 15])
  ws.pageSetup.orientation = 'landscape'
  const C = 9
  wide(ws, 'ДЕМОНСТРАЦИОННЫЙ ДОКУМЕНТ. Форма приближена к унифицированной КС-2 и не является юридически проверенным бланком.', C, { size: 9, fill: 'FFFFF4E5', color: 'FF92400E' })
  ws.addRow([])
  wide(ws, `АКТ О ПРИЁМКЕ ВЫПОЛНЕННЫХ РАБОТ (КС-2) № ${head.number}`, C, { bold: true, size: 13, center: true, height: 24 })
  wide(ws, `${head.project} · отчётный период ${head.period} · смета «${head.estimate}»`, C, { center: true })
  ws.addRow([])
  tableRow(ws, ['№', 'Шифр', 'Наименование работ', 'Ед.', 'По смете', 'Ранее', 'За период', 'Цена, ₽', 'Стоимость, ₽'], { bold: true, fill: 'FFEEEEEE' })
  const money = '#,##0.00', qty = '#,##0.###'
  let i = 0
  for (const s of k.sections) {
    tableRow(ws, [s.section, '', '', '', '', '', '', '', s.sum], { bold: true, fill: 'FFF5F5F5', merge: [[1, 8]], numFmt: { 9: money } })
    for (const r of s.rows) tableRow(ws, [++i, r.item.code, r.item.name, r.item.unit, r.planQty, r.prevQty, r.qty, r.item.price, r.sum], { numFmt: { 5: qty, 6: qty, 7: qty, 8: money, 9: money } })
  }
  // итоги — формулами, чтобы правки объёмов в Excel пересчитывались
  const first = 7, last = ws.rowCount
  const tot = tableRow(ws, ['Итого', '', '', '', '', '', '', '', 0], { bold: true, merge: [[1, 8]], numFmt: { 9: money } })
  tot.getCell(9).value = { formula: `SUMPRODUCT((ISNUMBER(A${first}:A${last}))*I${first}:I${last})`, result: k.total }
  const vat = tableRow(ws, ['НДС 20%', '', '', '', '', '', '', '', 0], { merge: [[1, 8]], numFmt: { 9: money } })
  vat.getCell(9).value = { formula: `ROUND(I${tot.number}*0.2,2)`, result: k.vat }
  const all = tableRow(ws, ['Всего с НДС', '', '', '', '', '', '', '', 0], { bold: true, merge: [[1, 8]], numFmt: { 9: money } })
  all.getCell(9).value = { formula: `I${tot.number}+I${vat.number}`, result: k.grand }
  // стоимость строки = количество × цена
  for (let r = first; r <= last; r++) {
    const row = ws.getRow(r)
    if (typeof row.getCell(1).value === 'number') row.getCell(9).value = { formula: `G${r}*H${r}`, result: Number(row.getCell(9).value) }
  }
  ws.addRow([])
  tableRow(ws, ['', 'Сдал', '', '', '', 'Принял', '', '', ''], { merge: [[2, 5], [6, 9]], height: 30 })
  await save(wb, filename)
}

export async function ks3Xlsx(k: Ks3, head: { number: number; project: string; estimate: string; period: string }, filename: string) {
  const wb = await book()
  const ws = sheet(wb, `КС-3 №${head.number}`, [40, 17, 17, 17, 17, 12])
  ws.pageSetup.orientation = 'landscape'
  const C = 6, money = '#,##0.00'
  wide(ws, 'ДЕМОНСТРАЦИОННЫЙ ДОКУМЕНТ. Форма приближена к унифицированной КС-3 и не является юридически проверенным бланком.', C, { size: 9, fill: 'FFFFF4E5', color: 'FF92400E' })
  ws.addRow([])
  wide(ws, `СПРАВКА О СТОИМОСТИ ВЫПОЛНЕННЫХ РАБОТ И ЗАТРАТ (КС-3) № ${head.number}`, C, { bold: true, size: 13, center: true, height: 24 })
  wide(ws, `${head.project} · отчётный период ${head.period} · смета «${head.estimate}»`, C, { center: true })
  ws.addRow([])
  tableRow(ws, ['Вид работ', 'По смете, ₽', 'С начала до периода, ₽', 'За период, ₽', 'С начала работ, ₽', 'Готовность'], { bold: true, fill: 'FFEEEEEE' })
  for (const r of k.rows) tableRow(ws, [r.section, r.contract, r.prev, r.period, r.sinceStart, r.percent / 100], { numFmt: { 2: money, 3: money, 4: money, 5: money, 6: '0.0%' } })
  tableRow(ws, ['Итого', k.contract, k.prev, k.period, k.sinceStart, ''], { bold: true, numFmt: { 2: money, 3: money, 4: money, 5: money } })
  tableRow(ws, ['НДС 20% за период', '', '', k.vat, '', ''], { numFmt: { 4: money } })
  tableRow(ws, ['К оплате с НДС', '', '', k.grand, '', ''], { bold: true, numFmt: { 4: money } })
  ws.addRow([])
  tableRow(ws, ['Заказчик', '', '', 'Подрядчик', '', ''], { merge: [[1, 3], [4, 6]], height: 30 })
  await save(wb, filename)
}

export const xlsxDate = formatDate

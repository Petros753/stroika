import type { Estimate, EstimateItem, ExecutionReport } from './types'
import { activeItems, itemCost } from './estimates'

/** Выполнение по смете: расчёт КС-2 и КС-3. Чистые функции — без UI и хранилища. */
export const VAT_RATE = 0.2
export const round2 = (v: number) => Math.round(v * 100) / 100

/** Подписанные справки той же сметы, закрывающие период до начала текущей */
export function previousReports(all: ExecutionReport[], r: Pick<ExecutionReport, 'id' | 'estimateId' | 'dateFrom'>): ExecutionReport[] {
  return all.filter((x) => x.id !== r.id && x.estimateId === r.estimateId && x.status === 'signed' && x.dateTo <= r.dateFrom)
}

export interface Ks2Row {
  item: EstimateItem
  planQty: number
  prevQty: number
  qty: number
  /** Остаток по смете после этой справки (может быть < 0 при превышении) */
  remain: number
  sum: number
  over: boolean
}
export interface Ks2Section { section: string; rows: Ks2Row[]; sum: number }
export interface Ks2 {
  sections: Ks2Section[]
  rows: Ks2Row[]
  total: number
  vat: number
  grand: number
  overCount: number
}

export function buildKs2(report: ExecutionReport, estimate: Estimate, all: ExecutionReport[], onlyFilled = false): Ks2 {
  const prev = previousReports(all, report)
  const prevOf = (id: string) => prev.reduce((a, x) => a + (x.qty[id] ?? 0), 0)
  const rows: Ks2Row[] = activeItems(estimate).map((item) => {
    const prevQty = prevOf(item.id)
    const qty = report.qty[item.id] ?? 0
    const remain = round2(item.qty - prevQty - qty)
    return { item, planQty: item.qty, prevQty, qty, remain, sum: qty * item.price, over: remain < -1e-9 }
  })
  const used = onlyFilled ? rows.filter((r) => r.qty > 0) : rows
  const map = new Map<string, Ks2Row[]>()
  for (const r of used) map.set(r.item.section, [...(map.get(r.item.section) ?? []), r])
  const sections = [...map.entries()].map(([section, list]) => ({ section, rows: list, sum: list.reduce((a, r) => a + r.sum, 0) }))
  const total = rows.reduce((a, r) => a + r.sum, 0)
  return { sections, rows: used, total, vat: total * VAT_RATE, grand: total * (1 + VAT_RATE), overCount: rows.filter((r) => r.over).length }
}

export interface Ks3Row { section: string; contract: number; prev: number; period: number; sinceStart: number; percent: number }
export interface Ks3 { rows: Ks3Row[]; contract: number; prev: number; period: number; sinceStart: number; vat: number; grand: number }

export function buildKs3(report: ExecutionReport, estimate: Estimate, all: ExecutionReport[]): Ks3 {
  const prev = previousReports(all, report)
  const bySection = new Map<string, Ks3Row>()
  for (const it of activeItems(estimate)) {
    const row = bySection.get(it.section) ?? { section: it.section, contract: 0, prev: 0, period: 0, sinceStart: 0, percent: 0 }
    row.contract += itemCost(it)
    row.prev += prev.reduce((a, x) => a + (x.qty[it.id] ?? 0), 0) * it.price
    row.period += (report.qty[it.id] ?? 0) * it.price
    bySection.set(it.section, row)
  }
  const rows = [...bySection.values()].map((r) => ({ ...r, sinceStart: r.prev + r.period, percent: r.contract ? ((r.prev + r.period) / r.contract) * 100 : 0 }))
  const sum = (k: 'contract' | 'prev' | 'period' | 'sinceStart') => rows.reduce((a, r) => a + r[k], 0)
  const period = sum('period')
  return { rows, contract: sum('contract'), prev: sum('prev'), period, sinceStart: sum('sinceStart'), vat: period * VAT_RATE, grand: period * (1 + VAT_RATE) }
}

/** Сколько по смете выполнено подписанными справками */
export function executionProgress(estimate: Estimate, all: ExecutionReport[]) {
  const signed = all.filter((x) => x.estimateId === estimate.id && x.status === 'signed')
  const done = activeItems(estimate).reduce((a, it) => a + signed.reduce((s, x) => s + (x.qty[it.id] ?? 0), 0) * it.price, 0)
  const total = activeItems(estimate).reduce((a, it) => a + itemCost(it), 0)
  return { total, done, percent: total ? (done / total) * 100 : 0, reports: signed.length }
}

/** Выставить объём; не даём превысить остаток по смете и уйти в минус */
export function clampQty(item: EstimateItem, prevQty: number, value: number): number {
  const max = Math.max(0, round2(item.qty - prevQty))
  if (!Number.isFinite(value) || value < 0) return 0
  return Math.min(round2(value), max)
}

// ---------- выгрузка ----------
const f = (v: number) => new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
const n = (v: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(v)
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const head = (title: string, sub: string) =>
  `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
body{font-family:Arial,sans-serif;font-size:10pt;margin:1.5cm}h1{font-size:14pt;text-align:center;margin-bottom:4px}
p.sub{text-align:center;margin:0 0 12px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #444;padding:3px 5px}
th{background:#eee}td.r{text-align:right}tr.sec td{background:#f5f5f5;font-weight:bold}.demo{border:1px solid #b45309;color:#92400e;padding:5px 8px;font-size:9pt;margin-bottom:10px}</style></head><body>
<div class="demo">ДЕМОНСТРАЦИОННЫЙ ДОКУМЕНТ. Форма приближена к унифицированным КС-2/КС-3 и не является юридически проверенным бланком.</div>
<h1>${esc(title)}</h1><p class="sub">${esc(sub)}</p>`

export function ks2Html(report: ExecutionReport, estimate: Estimate, projectName: string, k: Ks2, period: string): string {
  let i = 0
  const body = k.sections.map((s) => `<tr class="sec"><td colspan="7">${esc(s.section)}</td></tr>` + s.rows.map((r) =>
    `<tr><td>${++i}</td><td>${esc(r.item.code)}</td><td>${esc(r.item.name)}</td><td>${esc(r.item.unit)}</td><td class="r">${n(r.qty)}</td><td class="r">${f(r.item.price)}</td><td class="r">${f(r.sum)}</td></tr>`).join('')).join('')
  return `${head(`Акт о приёмке выполненных работ (КС-2) № ${report.number}`, `${projectName} · ${period} · смета «${estimate.name}» v${estimate.version}`)}
<table><tr><th>№</th><th>Шифр</th><th>Наименование работ</th><th>Ед.</th><th>Кол-во</th><th>Цена, ₽</th><th>Стоимость, ₽</th></tr>${body}
<tr><td colspan="6" class="r"><b>Итого</b></td><td class="r"><b>${f(k.total)}</b></td></tr>
<tr><td colspan="6" class="r">НДС 20%</td><td class="r">${f(k.vat)}</td></tr>
<tr><td colspan="6" class="r"><b>Всего с НДС</b></td><td class="r"><b>${f(k.grand)}</b></td></tr></table>
<p>Сдал: ____________ &nbsp;&nbsp;&nbsp; Принял: ____________</p></body></html>`
}

export function ks3Html(report: ExecutionReport, estimate: Estimate, projectName: string, k: Ks3, period: string): string {
  const body = k.rows.map((r) => `<tr><td>${esc(r.section)}</td><td class="r">${f(r.contract)}</td><td class="r">${f(r.prev)}</td><td class="r">${f(r.period)}</td><td class="r">${f(r.sinceStart)}</td><td class="r">${r.percent.toFixed(1)}%</td></tr>`).join('')
  return `${head(`Справка о стоимости выполненных работ (КС-3) № ${report.number}`, `${projectName} · ${period} · смета «${estimate.name}» v${estimate.version}`)}
<table><tr><th>Вид работ</th><th>По смете, ₽</th><th>С начала до периода, ₽</th><th>За период, ₽</th><th>С начала, ₽</th><th>Готовность</th></tr>${body}
<tr><td><b>Итого</b></td><td class="r"><b>${f(k.contract)}</b></td><td class="r"><b>${f(k.prev)}</b></td><td class="r"><b>${f(k.period)}</b></td><td class="r"><b>${f(k.sinceStart)}</b></td><td></td></tr></table>
<p>За отчётный период: ${f(k.period)} ₽ · НДС 20%: ${f(k.vat)} ₽ · <b>К оплате с НДС: ${f(k.grand)} ₽</b></p>
<p>Заказчик: ____________ &nbsp;&nbsp;&nbsp; Подрядчик: ____________</p></body></html>`
}

export function ks2Csv(k: Ks2): string {
  const esc2 = (v: string | number) => (/[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
  const lines = [['Раздел', 'Шифр', 'Наименование', 'Ед.', 'По смете', 'Ранее', 'За период', 'Остаток', 'Цена', 'Стоимость'].join(';')]
  for (const s of k.sections) for (const r of s.rows) lines.push([s.section, r.item.code, r.item.name, r.item.unit, r.planQty, r.prevQty, r.qty, r.remain, r.item.price, Math.round(r.sum * 100) / 100].map(esc2).join(';'))
  lines.push(['ИТОГО', '', '', '', '', '', '', '', '', Math.round(k.total * 100) / 100].join(';'))
  lines.push(['НДС 20%', '', '', '', '', '', '', '', '', Math.round(k.vat * 100) / 100].join(';'))
  lines.push(['ВСЕГО С НДС', '', '', '', '', '', '', '', '', Math.round(k.grand * 100) / 100].join(';'))
  return '﻿' + lines.join('\r\n')
}

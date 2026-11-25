import type { Estimate, EstimateItem } from './types'

/** Чистая логика смет и сверки — без UI, переносится в backend без изменений */

export const QTY_TOL = 0.005 // допуск по объёму 0,5 %
export const PRICE_TOL = 0.01 // допуск по цене 1 %

export const itemCost = (i: EstimateItem) => i.qty * i.price
/** Позиции, входящие в смету (без исключённых при корректировке) */
export const activeItems = (e: Estimate) => e.items.filter((i) => !i.excluded)
export const estimateTotal = (e: Estimate) => activeItems(e).reduce((a, i) => a + itemCost(i), 0)

export interface CorrectionSummary { excluded: number; changed: number; before: number; after: number }

/** Итоги корректировки относительно базовой сметы: что исключено, у чего изменён объём, как поменялась сумма */
export function correctionSummary(base: Estimate, items: EstimateItem[]): CorrectionSummary {
  const orig = new Map(base.items.map((i) => [i.id, i]))
  let excluded = 0, changed = 0, after = 0
  for (const it of items) {
    if (it.excluded) { excluded++; continue }
    after += itemCost(it)
    if (orig.get(it.id) && orig.get(it.id)!.qty !== it.qty) changed++
  }
  const before = base.items.filter((i) => !i.excluded).reduce((a, i) => a + itemCost(i), 0)
  return { excluded, changed, before, after }
}

export function groupBySection(items: EstimateItem[]): { section: string; items: EstimateItem[]; total: number }[] {
  const map = new Map<string, EstimateItem[]>()
  for (const it of items) map.set(it.section, [...(map.get(it.section) ?? []), it])
  return [...map.entries()].map(([section, list]) => ({ section, items: list, total: list.reduce((a, i) => a + (i.excluded ? 0 : itemCost(i)), 0) }))
}

// ---------- сопоставление ----------
const normCode = (c: string) => c.replace(/\s+/g, '').toUpperCase()

export function tokens(s: string): Set<string> {
  return new Set(s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 2))
}
export function similarity(a: string, b: string): number {
  const A = tokens(a), B = tokens(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  A.forEach((t) => B.has(t) && inter++)
  return inter / (A.size + B.size - inter)
}

export type RowStatus = 'match' | 'qty' | 'price' | 'both' | 'only_a' | 'only_b'

export interface ReconRow {
  key: string
  status: RowStatus
  a?: EstimateItem
  b?: EstimateItem
  matchedBy: 'code' | 'name' | null
  dQty: number
  dPrice: number
  /** Разница стоимости: B − A */
  dCost: number
  suspectedDuplicate: boolean
  /** Позиция есть в обеих сметах, но шифры/названия записаны по-разному */
  note?: string
}

export interface DuplicateGroup { items: EstimateItem[]; reason: string; extraCost: number }

export interface Reconciliation {
  rows: ReconRow[]
  totalA: number
  totalB: number
  diff: number
  diffPct: number
  counts: Record<RowStatus, number>
  /** Разложение разницы: diff = qtyEffect + priceEffect + onlyBCost − onlyACost */
  qtyEffect: number
  priceEffect: number
  onlyACost: number
  onlyBCost: number
  duplicatesA: DuplicateGroup[]
  duplicatesB: DuplicateGroup[]
  duplicatesCost: number
}

export function findDuplicates(items: EstimateItem[]): DuplicateGroup[] {
  const used = new Set<string>()
  const groups: DuplicateGroup[] = []
  for (let i = 0; i < items.length; i++) {
    if (used.has(items[i].id)) continue
    const same = [items[i]]
    let reason = ''
    for (let j = i + 1; j < items.length; j++) {
      if (used.has(items[j].id)) continue
      const a = items[i], b = items[j]
      if (normCode(a.code) === normCode(b.code)) { same.push(b); reason = 'Одинаковый шифр' }
      else if (a.unit === b.unit && similarity(a.name, b.name) >= 0.85) { same.push(b); reason = 'Почти одинаковое наименование' }
    }
    if (same.length > 1) {
      same.forEach((x) => used.add(x.id))
      groups.push({ items: same, reason, extraCost: same.slice(1).reduce((a, x) => a + itemCost(x), 0) })
    }
  }
  return groups
}

export function reconcile(A0: Estimate, B0: Estimate): Reconciliation {
  const A = { ...A0, items: activeItems(A0) }
  const B = { ...B0, items: activeItems(B0) }
  const dupA = findDuplicates(A.items)
  const dupB = findDuplicates(B.items)
  const dupIds = new Set([...dupA, ...dupB].flatMap((g) => g.items.slice(1).map((x) => x.id)))

  const pairs: { a: EstimateItem; b: EstimateItem; by: 'code' | 'name' }[] = []
  const freeA = new Map<string, EstimateItem[]>()
  for (const a of A.items) freeA.set(normCode(a.code), [...(freeA.get(normCode(a.code)) ?? []), a])
  const unmatchedB: EstimateItem[] = []
  const takenA = new Set<string>()
  for (const b of B.items) {
    const q = freeA.get(normCode(b.code))
    if (q && q.length) {
      const a = q.shift()!
      takenA.add(a.id)
      pairs.push({ a, b, by: 'code' })
    } else unmatchedB.push(b)
  }
  let restA = A.items.filter((a) => !takenA.has(a.id))
  const restB: EstimateItem[] = []
  for (const b of unmatchedB) {
    let best: EstimateItem | null = null
    let bestS = 0.6
    for (const a of restA) {
      if (a.unit !== b.unit) continue
      const s = similarity(a.name, b.name)
      if (s >= bestS) { best = a; bestS = s }
    }
    if (best && !dupIds.has(b.id)) {
      pairs.push({ a: best, b, by: 'name' })
      const id = best.id
      restA = restA.filter((x) => x.id !== id)
    } else restB.push(b)
  }

  const rows: ReconRow[] = []
  let qtyEffect = 0, priceEffect = 0
  for (const { a, b, by } of pairs) {
    const qtyDiff = Math.abs(b.qty - a.qty) / Math.max(a.qty, 1e-9) > QTY_TOL
    const priceDiff = Math.abs(b.price - a.price) / Math.max(a.price, 1e-9) > PRICE_TOL
    const status: RowStatus = qtyDiff && priceDiff ? 'both' : qtyDiff ? 'qty' : priceDiff ? 'price' : 'match'
    qtyEffect += (b.qty - a.qty) * a.price
    priceEffect += (b.price - a.price) * b.qty
    rows.push({
      key: `${a.id}|${b.id}`, status, a, b, matchedBy: by,
      dQty: b.qty - a.qty, dPrice: b.price - a.price, dCost: itemCost(b) - itemCost(a),
      suspectedDuplicate: false,
      note: by === 'name' ? `Сопоставлено по наименованию: шифры различаются (${a.code} ↔ ${b.code})` : a.name !== b.name ? 'Наименования записаны по-разному' : undefined,
    })
  }
  for (const a of restA) {
    rows.push({ key: `${a.id}|-`, status: 'only_a', a, matchedBy: null, dQty: -a.qty, dPrice: 0, dCost: -itemCost(a), suspectedDuplicate: false })
  }
  for (const b of restB) {
    rows.push({ key: `-|${b.id}`, status: 'only_b', b, matchedBy: null, dQty: b.qty, dPrice: 0, dCost: itemCost(b), suspectedDuplicate: dupIds.has(b.id) })
  }
  rows.sort((x, y) => Math.abs(y.dCost) - Math.abs(x.dCost))

  const counts: Record<RowStatus, number> = { match: 0, qty: 0, price: 0, both: 0, only_a: 0, only_b: 0 }
  rows.forEach((r) => counts[r.status]++)
  const totalA = estimateTotal(A), totalB = estimateTotal(B)
  const onlyACost = restA.reduce((s, x) => s + itemCost(x), 0)
  const onlyBCost = restB.reduce((s, x) => s + itemCost(x), 0)
  return {
    rows, totalA, totalB, diff: totalB - totalA, diffPct: totalA ? ((totalB - totalA) / totalA) * 100 : 0, counts,
    qtyEffect, priceEffect, onlyACost, onlyBCost, duplicatesA: dupA, duplicatesB: dupB,
    duplicatesCost: dupA.reduce((s, g) => s + g.extraCost, 0) + dupB.reduce((s, g) => s + g.extraCost, 0),
  }
}

export const ROW_STATUS_LABEL: Record<RowStatus, string> = {
  match: 'Совпадает', qty: 'Объём отличается', price: 'Цена отличается', both: 'Объём и цена', only_a: 'Нет в смете B', only_b: 'Нет в смете A',
}

/** Детерминированные выводы по сверке (не LLM) */
export function reconSummary(rec: Reconciliation, nameA: string, nameB: string, budget?: number): string[] {
  const out: string[] = []
  const fmt = (v: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.abs(Math.round(v))) + ' ₽'
  const dir = rec.diff > 0 ? 'выше' : rec.diff < 0 ? 'ниже' : 'равна'
  out.push(`Итог «${nameB}» ${dir} «${nameA}» на ${fmt(rec.diff)} (${rec.diffPct.toFixed(1).replace('.', ',')} %).`)
  const c = rec.counts
  out.push(`Совпадают полностью: ${c.match} поз.; расхождения по объёму: ${c.qty + c.both}, по цене: ${c.price + c.both}; отсутствуют в B: ${c.only_a}, отсутствуют в A: ${c.only_b}.`)
  if (rec.qtyEffect || rec.priceEffect) out.push(`Влияние на сумму: объёмы ${rec.qtyEffect >= 0 ? '+' : '−'}${fmt(rec.qtyEffect)}, цены ${rec.priceEffect >= 0 ? '+' : '−'}${fmt(rec.priceEffect)}.`)
  if (c.only_a) out.push(`Не учтено подрядчиком (есть в A, нет в B): ${fmt(rec.onlyACost)} — проверьте, не потеряны ли работы.`)
  if (rec.duplicatesCost > 0) out.push(`Подозрительные дубли: ${rec.duplicatesA.length + rec.duplicatesB.length} групп. на ${fmt(rec.duplicatesCost)} — возможное завышение.`)
  if (budget) out.push(`Сумма B составляет ${((rec.totalB / budget) * 100).toFixed(0)} % бюджета объекта.`)
  return out
}

// ---------- отчёт ----------
export function reconCsv(rec: Reconciliation, nameA: string, nameB: string): string {
  const esc = (v: string | number | undefined) => {
    const s = v === undefined ? '' : String(v)
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const head = ['Статус', 'Шифр A', 'Наименование A', 'Ед.', `Объём (${nameA})`, `Цена (${nameA})`, 'Шифр B', 'Наименование B', `Объём (${nameB})`, `Цена (${nameB})`, 'Δ объём', 'Δ цена', 'Δ стоимость', 'Примечание']
  const lines = [head.join(';')]
  for (const r of rec.rows) {
    lines.push([
      ROW_STATUS_LABEL[r.status] + (r.suspectedDuplicate ? ' (подозрение на дубль)' : ''),
      r.a?.code, r.a?.name, (r.a ?? r.b)?.unit, r.a?.qty, r.a?.price, r.b?.code, r.b?.name, r.b?.qty, r.b?.price,
      Math.round(r.dQty * 100) / 100, Math.round(r.dPrice), Math.round(r.dCost), r.note,
    ].map(esc).join(';'))
  }
  lines.push(['ИТОГО', '', nameA, '', '', Math.round(rec.totalA), '', nameB, '', Math.round(rec.totalB), '', '', Math.round(rec.diff), ''].map(esc).join(';'))
  return '﻿' + lines.join('\r\n')
}

export function estimateCsv(e: Estimate): string {
  const esc = (v: string | number) => (/[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
  const lines = [['Раздел', 'Шифр', 'Наименование', 'Ед.', 'Объём', 'Цена', 'Стоимость'].join(';')]
  for (const i of activeItems(e)) lines.push([i.section, i.code, i.name, i.unit, i.qty, i.price, Math.round(itemCost(i))].map(esc).join(';'))
  lines.push(['ИТОГО', '', '', '', '', '', Math.round(estimateTotal(e))].join(';'))
  return '﻿' + lines.join('\r\n')
}

// ---------- импорт ----------
export interface ParsedEstimate { items: Omit<EstimateItem, 'id'>[]; warnings: string[]; simulated: boolean }

const num = (v: unknown): number => {
  if (typeof v === 'number') return v
  const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

/** Разбор таблицы (Excel/CSV): ищем строку заголовков по ключевым словам, строки без объёма считаем разделами */
export function parseTable(rows: unknown[][]): ParsedEstimate {
  const warnings: string[] = []
  const find = (cells: string[], re: RegExp) => cells.findIndex((c) => re.test(c))
  let hi = -1
  let cols = { code: -1, name: -1, unit: -1, qty: -1, price: -1 }
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const cells = rows[i].map((c) => String(c ?? '').toLowerCase())
    const c = { code: find(cells, /шифр|код|обоснов/), name: find(cells, /наимен|работ/), unit: find(cells, /^ед|измер/), qty: find(cells, /кол|объ[её]м/), price: find(cells, /цена|расц|стоимость за/) }
    if (c.name >= 0 && c.qty >= 0 && c.price >= 0) { hi = i; cols = c; break }
  }
  if (hi < 0) return { items: [], warnings: ['Не найдена строка заголовков (нужны колонки «Наименование», «Объём», «Цена»)'], simulated: false }
  const items: Omit<EstimateItem, 'id'>[] = []
  let section = 'Без раздела'
  for (const row of rows.slice(hi + 1)) {
    const name = String(row[cols.name] ?? '').trim()
    if (!name) continue
    const qty = num(row[cols.qty]), price = num(row[cols.price])
    if (Number.isNaN(qty) || Number.isNaN(price)) {
      if (!/^итого/i.test(name)) section = name
      continue
    }
    items.push({ section, code: cols.code >= 0 ? String(row[cols.code] ?? '').trim() || '—' : '—', name, unit: cols.unit >= 0 ? String(row[cols.unit] ?? '').trim() || 'шт' : 'шт', qty, price })
  }
  if (!items.length) warnings.push('Позиции не найдены')
  return { items, warnings, simulated: false }
}

export function parseCsvText(text: string): ParsedEstimate {
  const delim = text.split('\n')[0].includes(';') ? ';' : ','
  const rows = text.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).map((line) => {
    const cells: string[] = []
    let cur = '', q = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++ } else q = !q } else if (ch === delim && !q) { cells.push(cur); cur = '' } else cur += ch
    }
    cells.push(cur)
    return cells
  })
  return parseTable(rows)
}

/** XML: берём любые элементы с атрибутами/дочерними тегами name+qty+price (Item/Position/Row/…) */
export function parseXmlText(xml: string): ParsedEstimate {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) return { items: [], warnings: ['XML повреждён или имеет неверную структуру'], simulated: false }
  const get = (el: Element, ...names: string[]) => {
    for (const n of names) {
      const a = el.getAttribute(n)
      if (a != null) return a
      const c = [...el.children].find((x) => x.tagName.toLowerCase() === n.toLowerCase())
      if (c) return c.textContent ?? ''
    }
    return ''
  }
  const items: Omit<EstimateItem, 'id'>[] = []
  doc.querySelectorAll('*').forEach((el) => {
    const name = get(el, 'name', 'Caption', 'Наименование')
    const qty = num(get(el, 'qty', 'Quantity', 'Объем', 'Количество'))
    const price = num(get(el, 'price', 'Price', 'Цена'))
    if (!name || Number.isNaN(qty) || Number.isNaN(price)) return
    items.push({
      section: get(el, 'section', 'Раздел') || el.parentElement?.getAttribute('name') || el.parentElement?.getAttribute('section') || 'Без раздела',
      code: get(el, 'code', 'Code', 'Шифр') || '—', name, unit: get(el, 'unit', 'Units', 'Ед') || 'шт', qty, price,
    })
  })
  return { items, warnings: items.length ? [] : ['В XML не найдены позиции (ожидаются элементы с name, qty, price)'], simulated: false }
}

/** PDF не разбираем — в демо «распознаём» типовой набор позиций с небольшими отклонениями */
export function simulateRecognition(base: Estimate | undefined): ParsedEstimate {
  const src = base?.items ?? []
  const items = src.slice(0, 28).map((i, k) => ({
    section: i.section, code: i.code, name: i.name, unit: i.unit,
    qty: k % 5 === 3 ? Math.round(i.qty * 1.06 * 10) / 10 : i.qty, price: k % 8 === 1 ? Math.round(i.price * 1.05) : i.price,
  }))
  return { items, simulated: true, warnings: ['Демо-режим: PDF не разбирается, позиции восстановлены по ближайшей смете объекта. В рабочей версии — OCR/парсер.'] }
}

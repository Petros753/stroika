import type { DataState } from '../data/seed'
import type { IncomingCheck, QualityDoc, QualityDocKind } from './types'
import { formatDate } from '../lib/date'

/** Документы о качестве материалов: реестр, сроки действия, входной контроль, комплектность по объекту.
 *  Правила «какой документ нужен» — демо. В рабочей версии берутся из проекта (ведомость материалов) и техрегламентов. */

export const QUALITY_KINDS: QualityDocKind[] = ['Сертификат соответствия', 'Декларация о соответствии', 'Паспорт качества', 'Протокол испытаний', 'Отказное письмо']
export const CHECK_LABEL: Record<IncomingCheck, string> = { pending: 'ожидает входного контроля', accepted: 'принят', rejected: 'отклонён' }
export const CHECK_TONE: Record<IncomingCheck, 'amber' | 'green' | 'red'> = { pending: 'amber', accepted: 'green', rejected: 'red' }

/** Для каких материалов дополнительно нужен паспорт качества на партию (демо-правило) */
export const PASSPORT_REQUIRED = new Set(['m_rebar', 'm_conc', 'm_window', 'm_pipe'])
/** Для бетонной смеси — паспорт на партию и протоколы испытаний, сертификат/декларация не требуются (демо-правило) */
export const CONFORMITY_NOT_REQUIRED = new Set(['m_conc'])
export const EXPIRING_DAYS = 30

export type Validity = 'valid' | 'expiring' | 'expired' | 'unlimited'
export function validity(d: Pick<QualityDoc, 'validUntil'>, today: string): Validity {
  if (!d.validUntil) return 'unlimited'
  if (d.validUntil < today) return 'expired'
  const days = (Date.parse(d.validUntil) - Date.parse(today)) / 86400000
  return days <= EXPIRING_DAYS ? 'expiring' : 'valid'
}
export const VALIDITY_LABEL: Record<Validity, string> = { valid: 'действует', expiring: 'истекает', expired: 'истёк', unlimited: 'бессрочно' }
export const VALIDITY_TONE: Record<Validity, 'green' | 'amber' | 'red' | 'slate'> = { valid: 'green', expiring: 'amber', expired: 'red', unlimited: 'slate' }

/** Материалы, которые поступали на объект: остатки на складе объекта, приход/перемещение, заказы снабжения */
export function projectMaterialIds(state: Pick<DataState, 'warehouses' | 'stock' | 'movements' | 'orders'>, projectId: string): string[] {
  const whs = new Set(state.warehouses.filter((w) => w.projectId === projectId).map((w) => w.id))
  const ids = new Set<string>()
  state.stock.forEach((s) => { if (whs.has(s.warehouseId) && s.qty > 0) ids.add(s.materialId) })
  state.movements.forEach((m) => { if (m.toWarehouseId && whs.has(m.toWarehouseId)) ids.add(m.materialId) })
  state.orders.forEach((o) => { if (o.projectId === projectId && (o.status === 'delivered' || o.status === 'shipped')) o.items.forEach((i) => ids.add(i.materialId)) })
  return [...ids]
}

export interface CoverageRow {
  materialId: string
  docs: QualityDoc[]
  /** Действующий сертификат или декларация, не отклонённые на входном контроле */
  conformity: QualityDoc | undefined
  conformityRequired: boolean
  passport: QualityDoc | undefined
  passportRequired: boolean
  problems: string[]
}

const usable = (d: QualityDoc, today: string) => d.check !== 'rejected' && validity(d, today) !== 'expired'

export function coverage(state: Pick<DataState, 'warehouses' | 'stock' | 'movements' | 'orders' | 'qualityDocs'>, projectId: string, today: string): CoverageRow[] {
  const mats = new Set(projectMaterialIds(state, projectId))
  state.qualityDocs.forEach((d) => { if (d.projectId === projectId) mats.add(d.materialId) })
  return [...mats].map((materialId) => {
    const docs = state.qualityDocs.filter((d) => d.projectId === projectId && d.materialId === materialId)
    const conformity = docs.find((d) => (d.kind === 'Сертификат соответствия' || d.kind === 'Декларация о соответствии' || d.kind === 'Отказное письмо') && usable(d, today))
    const passport = docs.find((d) => (d.kind === 'Паспорт качества' || d.kind === 'Протокол испытаний') && usable(d, today))
    const passportRequired = PASSPORT_REQUIRED.has(materialId)
    const conformityRequired = !CONFORMITY_NOT_REQUIRED.has(materialId)
    const problems: string[] = []
    if (!docs.length) problems.push('нет документов о качестве')
    else {
      if (!conformity && conformityRequired) problems.push(docs.some((d) => validity(d, today) === 'expired') ? 'сертификат / декларация истёк' : 'нет действующего сертификата или декларации')
      if (passportRequired && !passport) problems.push('нет паспорта качества на партию')
      if (docs.some((d) => d.check === 'rejected')) problems.push('есть отклонённые на входном контроле')
      if (docs.some((d) => d.check === 'pending')) problems.push('ожидает входного контроля')
      if (docs.some((d) => usable(d, today) && validity(d, today) === 'expiring')) problems.push(`истекает в ближайшие ${EXPIRING_DAYS} дн.`)
    }
    return { materialId, docs, conformity, conformityRequired, passport, passportRequired, problems }
  }).sort((a, b) => b.problems.length - a.problems.length)
}

/** Серьёзные пробелы: материалы без действующего документа (для предупреждений) */
export const criticalGaps = (rows: CoverageRow[]) => rows.filter((r) => (r.conformityRequired && !r.conformity) || (r.passportRequired && !r.passport))

// ---------- выгрузка реестра ----------
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export function qualityRegistryHtml(projectName: string, docs: QualityDoc[], matName: (id: string) => string, today: string): string {
  const rows = docs.map((d, i) => `<tr><td>${i + 1}</td><td>${esc(matName(d.materialId))}</td><td>${esc(d.kind)}</td><td>${esc(d.number)}</td><td>${formatDate(d.issuedAt)}</td><td>${d.validUntil ? formatDate(d.validUntil) : 'бессрочно'}</td><td>${esc(d.issuer)}</td><td>${esc(d.batch ?? '')}</td><td>${esc(CHECK_LABEL[d.check])}</td></tr>`).join('')
  return `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>Реестр документов о качестве</title><style>
body{font-family:Arial,sans-serif;font-size:10pt;margin:1.5cm}h1{font-size:14pt;text-align:center}table{border-collapse:collapse;width:100%}
th,td{border:1px solid #444;padding:3px 5px}th{background:#eee}.demo{border:1px solid #b45309;color:#92400e;padding:5px 8px;font-size:9pt}</style></head><body>
<div class="demo">ДЕМОНСТРАЦИОННЫЙ ДОКУМЕНТ. Форма реестра — пример; сверить с требованиями заказчика и стройконтроля.</div>
<h1>Реестр документов о качестве материалов</h1><p>Объект: ${esc(projectName)} · на ${formatDate(today)}</p>
<table><tr><th>№</th><th>Материал</th><th>Документ</th><th>Номер</th><th>Дата</th><th>Действует до</th><th>Выдан / изготовитель</th><th>Партия</th><th>Входной контроль</th></tr>${rows}</table></body></html>`
}
export function qualityRegistryCsv(docs: QualityDoc[], matName: (id: string) => string): string {
  const q = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const L = [['Материал', 'Документ', 'Номер', 'Дата', 'Действует до', 'Выдан', 'Партия', 'Входной контроль'].join(';')]
  for (const d of docs) L.push([matName(d.materialId), d.kind, d.number, d.issuedAt, d.validUntil ?? 'бессрочно', d.issuer, d.batch ?? '', CHECK_LABEL[d.check]].map(q).join(';'))
  return '﻿' + L.join('\r\n')
}

/** Демо «распознавание» скана: в рабочей версии — Docling/OCR извлекает номер, даты, изготовителя и партию */
export function demoRecognize(fileName: string, today: string): Partial<QualityDoc> {
  const n = fileName.replace(/\.[^.]+$/, '')
  const num = n.match(/\d{3,}/)?.[0] ?? String(Math.abs([...n].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) % 1000000)
  const y = Number(today.slice(0, 4))
  return {
    kind: /паспорт|passport/i.test(n) ? 'Паспорт качества' : /деклар/i.test(n) ? 'Декларация о соответствии' : 'Сертификат соответствия',
    number: `РОСС RU.${num.padStart(6, '0').slice(-6)}`,
    issuedAt: `${y}-${today.slice(5, 7)}-01`,
    validUntil: /паспорт|passport/i.test(n) ? undefined : `${y + 2}-${today.slice(5, 7)}-01`,
  }
}

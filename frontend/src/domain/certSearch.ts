import type { DataState } from '../data/seed'
import type { QualityDoc, QualityDocKind, Supplier } from './types'
import { CONFORMITY_NOT_REQUIRED, PASSPORT_REQUIRED, validity } from './quality'
import { addDays, formatDate } from '../lib/date'

/** Поиск документов о качестве.
 *  1) Архив компании — РЕАЛЬНЫЙ поиск: тот же материал на других объектах (действующие, не отклонённые документы).
 *  2) Реестр Росаккредитации и сайт производителя — ДЕМО-результаты. В рабочей версии n8n на сервере
 *     обращается к открытому реестру сертификатов и деклараций (pub.fsa.gov.ru) и к сайтам производителей.
 *  3) Паспорт качества на партию публично не публикуется — система готовит письмо-запрос поставщику. */

export type SearchSource = 'archive' | 'registry' | 'manufacturer'
export const SOURCE_LABEL: Record<SearchSource, string> = {
  archive: 'Архив компании', registry: 'Реестр Росаккредитации (демо)', manufacturer: 'Сайт производителя (демо)',
}
export interface Candidate {
  key: string
  source: SearchSource
  kind: QualityDocKind
  number: string
  issuer: string
  issuedAt: string
  validUntil?: string
  batch?: string
  note: string
}

/** Производители по материалам (демо-справочник; в рабочей версии — из спецификаций и счетов поставщиков) */
const MAKERS: Record<string, { maker: string; kind: QualityDocKind; code: string }> = {
  m_rebar: { maker: 'ПАО «Северсталь»', kind: 'Сертификат соответствия', code: 'РОСС RU.АЯ46.Н' },
  m_conc: { maker: 'ООО «БетонСтрой»', kind: 'Протокол испытаний', code: 'ИЛ-' },
  m_cable: { maker: 'АО «Электрокабель»', kind: 'Сертификат соответствия', code: 'ЕАЭС RU С-RU.МЕ77.В.' },
  m_socket: { maker: 'ООО «Электроустановка»', kind: 'Декларация о соответствии', code: 'ЕАЭС N RU Д-RU.РА01.В.' },
  m_pipe: { maker: 'ООО «Полипластик»', kind: 'Сертификат соответствия', code: 'РОСС RU.АГ75.Н' },
  m_duct: { maker: 'ООО «ВентСистемы»', kind: 'Декларация о соответствии', code: 'ЕАЭС N RU Д-RU.АЖ26.В.' },
  m_gkl: { maker: 'ООО «Кнауф Гипс»', kind: 'Сертификат соответствия', code: 'РОСС RU.HA41.H' },
  m_wool: { maker: 'ООО «Технониколь»', kind: 'Сертификат соответствия', code: 'C-RU.ПБ34.В.' },
  m_window: { maker: 'ООО «ОкнаПро»', kind: 'Сертификат соответствия', code: 'РОСС RU.СЛ51.Н' },
  m_tile: { maker: 'ООО «Керамика Плюс»', kind: 'Декларация о соответствии', code: 'ЕАЭС N RU Д-RU.НА35.В.' },
  m_plaster: { maker: 'ООО «Волма»', kind: 'Декларация о соответствии', code: 'ЕАЭС N RU Д-RU.НВ56.В.' },
  m_paint: { maker: 'ООО «Тиккурила»', kind: 'Декларация о соответствии', code: 'ЕАЭС N RU Д-RU.ХП12.В.' },
}
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 1000003, 17)

export interface SearchResult {
  materialId: string
  candidates: Candidate[]
  /** Нужен паспорт на партию, а действующего нет */
  passportNeeded: boolean
  conformityNeeded: boolean
  supplier?: Supplier
  orders: { number: string; date: string; qty: number }[]
}

export function searchQualityDocs(state: Pick<DataState, 'qualityDocs' | 'orders' | 'suppliers' | 'projects'>, projectId: string, materialId: string, today: string): SearchResult {
  const own = state.qualityDocs.filter((d) => d.projectId === projectId && d.materialId === materialId)
  const usable = (d: QualityDoc) => d.check !== 'rejected' && validity(d, today) !== 'expired'
  const isConf = (k: QualityDocKind) => k === 'Сертификат соответствия' || k === 'Декларация о соответствии'
  const hasConf = own.some((d) => isConf(d.kind) && usable(d))
  const hasPass = own.some((d) => (d.kind === 'Паспорт качества' || d.kind === 'Протокол испытаний') && usable(d))
  const conformityNeeded = !CONFORMITY_NOT_REQUIRED.has(materialId) && !hasConf
  const passportNeeded = PASSPORT_REQUIRED.has(materialId) && !hasPass
  const have = new Set(own.map((d) => d.number))
  const candidates: Candidate[] = []

  if (conformityNeeded) {
    // 1. архив компании — реальный поиск по другим объектам
    const seen = new Set<string>()
    for (const d of state.qualityDocs) {
      if (d.projectId === projectId || d.materialId !== materialId || !isConf(d.kind) || !usable(d) || have.has(d.number) || seen.has(d.number)) continue
      seen.add(d.number)
      const p = state.projects.find((x) => x.id === d.projectId)
      candidates.push({ key: 'a' + d.id, source: 'archive', kind: d.kind, number: d.number, issuer: d.issuer, issuedAt: d.issuedAt, validUntil: d.validUntil, note: `Применялся на объекте «${p?.name}», прошёл входной контроль. Сверьте производителя и марку с фактической поставкой.` })
    }
    // 2. реестр / производитель — демо
    const mk = MAKERS[materialId]
    if (mk) {
      const n = String(hash(materialId + projectId)).padStart(5, '0')
      const issued = addDays(today, -200 - (hash(materialId) % 300))
      const number = `${mk.code}${n}`
      if (!have.has(number) && !candidates.some((c) => c.number === number)) {
        candidates.push({ key: 'r' + materialId, source: 'registry', kind: mk.kind === 'Протокол испытаний' ? 'Декларация о соответствии' : mk.kind, number, issuer: mk.maker, issuedAt: issued, validUntil: addDays(issued, 365 * 3), note: 'Статус в реестре: действует. Проверьте совпадение марки и производителя с поставкой.' })
      }
      candidates.push({ key: 'm' + materialId, source: 'manufacturer', kind: mk.kind === 'Протокол испытаний' ? 'Декларация о соответствии' : mk.kind, number: `${mk.code}${String(hash(materialId) % 100000).padStart(5, '0')}`, issuer: mk.maker, issuedAt: addDays(today, -500), validUntil: addDays(today, -500 + 365 * 3), note: 'Скан опубликован на сайте производителя в разделе «Документация»' })
    }
  }
  const myOrders = state.orders.filter((o) => o.projectId === projectId && o.items.some((i) => i.materialId === materialId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const anyOrder = myOrders[0] ?? state.orders.find((o) => o.items.some((i) => i.materialId === materialId))
  return {
    materialId, candidates: candidates.filter((c) => !c.validUntil || c.validUntil >= today), passportNeeded, conformityNeeded,
    supplier: state.suppliers.find((s) => s.id === anyOrder?.supplierId) ?? state.suppliers.find((s) => s.prices[materialId] !== undefined),
    orders: myOrders.map((o) => ({ number: o.number, date: o.createdAt, qty: o.items.find((i) => i.materialId === materialId)!.qty })),
  }
}

/** Письмо-запрос поставщику: паспорта качества / сертификаты на поставленные партии */
export function supplierRequestLetter(o: { projectName: string; supplier: string; items: { material: string; unit: string; orders: { number: string; date: string; qty: number }[]; need: string }[]; director: string; author: string; today: string }) {
  const lines = [
    'Уважаемые коллеги!', '',
    `Для оформления исполнительной документации по объекту «${o.projectName}» просим в течение 3 рабочих дней направить документы о качестве на поставленные Вами материалы:`, '',
  ]
  o.items.forEach((it, i) => {
    const ord = it.orders.length ? ` — поставки: ${it.orders.map((x) => `${x.number} от ${formatDate(x.date)} (${x.qty} ${it.unit})`).join('; ')}` : ''
    lines.push(`${i + 1}. ${it.material}: ${it.need}${ord}.`)
  })
  lines.push('', 'Документы просим направить в электронном виде (скан-копии, заверенные печатью) с указанием номеров партий, соответствующих товарным накладным.', '',
    'С уважением,', `Генеральный директор ${o.director}`, '', `Исп.: ${o.author}`)
  return { subject: `Запрос документов о качестве — ${o.projectName}`, body: lines.join('\n') }
}

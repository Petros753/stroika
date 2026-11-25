import type { BuildingKind, CostGroup, CostInput, FinishLevel, Project, Stage, StructureKind } from './types'

/** Себестоимость объектов: текущие (план / факт / прогноз) и новые (укрупнённо или по аналогу).
 *  Все ставки — ДЕМОНСТРАЦИОННЫЕ укрупнённые показатели. В рабочей версии берутся из НЦС Минстроя,
 *  собственной базы завершённых объектов и текущих цен поставщиков. */

export const KIND_LABEL: Record<BuildingKind, string> = {
  residential: 'Жилой дом (МКД)', school: 'Школа / детский сад', medical: 'Медицинский объект',
  office: 'Офисное здание', warehouse: 'Склад / производство', retail: 'Торговый центр',
}
export const STRUCTURE_LABEL: Record<StructureKind, string> = {
  monolith: 'Монолитный ж/б', brick: 'Кирпич / газобетон', steel: 'Металлокаркас', precast: 'Сборный ж/б',
}
export const FINISH_LABEL: Record<FinishLevel, string> = { rough: 'Черновая', whitebox: 'Предчистовая (white box)', turnkey: 'Под ключ' }
export const GROUP_LABEL: Record<CostGroup, string> = {
  prep: 'Подготовка и земляные работы', foundation: 'Фундаменты и подземная часть', frame: 'Каркас и стены', roof: 'Кровля',
  facade: 'Фасады и окна', engineering: 'Инженерные системы', finishing: 'Отделка', landscaping: 'Благоустройство и сети',
}
export const GROUPS = Object.keys(GROUP_LABEL) as CostGroup[]

/** Региональные коэффициенты к базе (демо) */
export const REGIONS: Record<string, number> = {
  'Москва': 1.25, 'Санкт-Петербург': 1.15, 'Казань': 1.0, 'Екатеринбург': 1.03, 'Астрахань': 0.93, 'Оренбург': 0.94, 'Другой регион': 1.0,
}
export const regionOf = (address: string) => Object.keys(REGIONS).find((r) => address.includes(r)) ?? 'Другой регион'

/** База, ₽ за м² общей площади: монолит, под ключ, «типовая» этажность, без подземной части */
const BASE_RATE: Record<BuildingKind, number> = { residential: 62000, school: 78000, medical: 95000, office: 72000, warehouse: 38000, retail: 65000 }
const BASE_FLOORS: Record<BuildingKind, number> = { residential: 17, school: 3, medical: 4, office: 12, warehouse: 1, retail: 3 }
const DEFAULT_SHARES: Record<CostGroup, number> = { prep: 0.04, foundation: 0.12, frame: 0.26, roof: 0.04, facade: 0.1, engineering: 0.22, finishing: 0.17, landscaping: 0.05 }
const SHARES: Partial<Record<BuildingKind, Record<CostGroup, number>>> = {
  medical: { prep: 0.03, foundation: 0.1, frame: 0.2, roof: 0.03, facade: 0.08, engineering: 0.32, finishing: 0.2, landscaping: 0.04 },
  warehouse: { prep: 0.04, foundation: 0.14, frame: 0.34, roof: 0.1, facade: 0.12, engineering: 0.18, finishing: 0.06, landscaping: 0.02 },
  school: { prep: 0.04, foundation: 0.11, frame: 0.22, roof: 0.06, facade: 0.1, engineering: 0.23, finishing: 0.18, landscaping: 0.06 },
}
/** Структура затрат группы: материалы / труд / машины */
export const MIX: Record<CostGroup, [number, number, number]> = {
  prep: [0.2, 0.35, 0.45], foundation: [0.6, 0.3, 0.1], frame: [0.6, 0.3, 0.1], roof: [0.65, 0.3, 0.05],
  facade: [0.6, 0.35, 0.05], engineering: [0.65, 0.3, 0.05], finishing: [0.55, 0.42, 0.03], landscaping: [0.5, 0.3, 0.2],
}
const STRUCTURE_K: Record<StructureKind, number> = { monolith: 1, brick: 1.2, steel: 0.75, precast: 0.85 }
const FINISH_K: Record<FinishLevel, number> = { rough: 0.45, whitebox: 0.7, turnkey: 1 }
/** Удорожание цен при расчёте по аналогу, % в год (демо) */
export const INFLATION = 0.08
export const VAT = 0.2

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/** Нормативная продолжительность строительства, мес (укрупнённо, демо) */
export const normMonths = (area: number, floors: number) => Math.round(clamp(6 + area / 2500 + floors * 0.4, 6, 48))

export interface CostLine { group: CostGroup; rate: number; sum: number; materials: number; labor: number; machines: number; note?: string }
export interface CostResult {
  lines: CostLine[]
  direct: number
  materials: number
  labor: number
  machines: number
  overhead: number
  reserve: number
  cost: number
  costPerM2: number
  margin: number
  price: number
  vat: number
  priceVat: number
  norm: number
  compression: number
  warnings: string[]
  basis: string
  /** На сколько вырастет себестоимость при росте цен на материалы на 10% */
  materials10: number
}

/** Перенос стоимости этапов текущего объекта в укрупнённые группы */
export function stageGroup(s: Pick<Stage, 'name' | 'workType'>): CostGroup {
  const n = s.name.toLowerCase()
  if (/благоустр/.test(n)) return 'landscaping'
  if (/фасад/.test(n)) return 'facade'
  if (/кровл/.test(n) && !/каркас/.test(n)) return 'roof'
  if (/фундамент|подземн|нулев|котлован и фундам/.test(n)) return 'foundation'
  if (/отделк/.test(n)) return 'finishing'
  switch (s.workType) {
    case 'Земляные работы': case 'Проектные работы': return 'prep'
    case 'Инженерные системы': case 'Пусконаладочные работы': return 'engineering'
    case 'Отделочные работы': return 'finishing'
    case 'Благоустройство': return 'landscaping'
    default: return 'frame'
  }
}

/** Ставки ₽/м² по группам из плановой себестоимости этапов объекта-аналога */
export function analogRates(project: Project, stages: Stage[]): Partial<Record<CostGroup, number>> | null {
  if (!project.area) return null
  const out: Partial<Record<CostGroup, number>> = {}
  for (const s of stages.filter((x) => x.projectId === project.id)) {
    const g = stageGroup(s)
    out[g] = (out[g] ?? 0) + s.plannedCost / project.area
  }
  return out
}

export function calcCost(input: CostInput, today: string, analog?: { project: Project; stages: Stage[] }): CostResult {
  const area = Math.max(0, input.area)
  const floors = Math.max(1, Math.round(input.floors))
  const regionK = REGIONS[input.region] ?? 1
  const warnings: string[] = []
  const rates: Partial<Record<CostGroup, number>> = {}
  const notes: Partial<Record<CostGroup, string>> = {}
  let basis: string

  if (input.method === 'analog' && analog) {
    const base = analogRates(analog.project, analog.stages) ?? {}
    const years = Math.max(0, (Date.parse(today) - Date.parse(analog.project.startDate)) / (365.25 * 86400000))
    const infl = (1 + INFLATION) ** years
    const rk = regionK / (REGIONS[regionOf(analog.project.address)] ?? 1)
    for (const g of GROUPS) if (base[g]) rates[g] = base[g]! * infl * rk
    basis = `По аналогу «${analog.project.name}» (${analog.project.area?.toLocaleString('ru-RU')} м²): плановая себестоимость этапов на 1 м², `
      + `удорожание ${((infl - 1) * 100).toFixed(1)}% (${(INFLATION * 100).toFixed(0)}%/год), регион ×${rk.toFixed(2)}`
    if (analog.project.kind && analog.project.kind !== input.kind) warnings.push(`Аналог другого назначения (${KIND_LABEL[analog.project.kind]}) — точность ниже`)
    if (analog.project.area && (area > analog.project.area * 2 || area < analog.project.area / 2)) warnings.push('Площадь отличается от аналога более чем в 2 раза — эффект масштаба не учтён')
  } else {
    const shares = SHARES[input.kind] ?? DEFAULT_SHARES
    const total = BASE_RATE[input.kind] * regionK
    const bf = BASE_FLOORS[input.kind]
    for (const g of GROUPS) {
      let k = 1
      if (g === 'frame') { k *= STRUCTURE_K[input.structure]; if (input.structure !== 'monolith') notes[g] = STRUCTURE_LABEL[input.structure] }
      if (g === 'roof') { k *= clamp(bf / floors, 0.3, 3); notes[g] = `площадь кровли ≈ ${Math.round(area / floors).toLocaleString('ru-RU')} м²` }
      if (g === 'foundation') k *= clamp(Math.sqrt(bf / floors), 0.6, 2)
      if ((g === 'frame' || g === 'engineering') && floors > 9) k *= floors > 25 ? 1.15 : 1.08
      if (input.underground && (g === 'foundation' || g === 'prep')) { k *= g === 'foundation' ? 1.6 : 1.5; notes[g] = 'с подземным этажом' }
      if (g === 'finishing') { k *= FINISH_K[input.finish]; notes[g] = FINISH_LABEL[input.finish] }
      rates[g] = total * shares[g] * k
    }
    basis = `Укрупнённые демо-нормативы: ${KIND_LABEL[input.kind]}, база ${BASE_RATE[input.kind].toLocaleString('ru-RU')} ₽/м², регион ${input.region} ×${regionK}`
    if (input.kind === 'warehouse' && floors > 3) warnings.push('Для складов этажность больше 3 нетипична — проверьте исходные данные')
  }

  const norm = normMonths(area, floors)
  const compression = input.months > 0 && input.months < norm ? Math.min(0.5, (norm - input.months) / norm) : 0
  if (compression > 0) warnings.push(`Срок ${input.months} мес. короче нормативного (~${norm} мес.): трудозатраты +${(compression * 30).toFixed(0)}% (сверхурочные, вторая смена)`)
  if (area <= 0) warnings.push('Укажите площадь')

  const lines: CostLine[] = GROUPS.filter((g) => (rates[g] ?? 0) > 0).map((g) => {
    const [m, l, mc] = MIX[g]
    const base = rates[g]! * area
    const labor = base * l * (1 + compression * 0.3)
    const materials = base * m
    const machines = base * mc
    const sum = materials + labor + machines
    return { group: g, rate: area ? sum / area : 0, sum, materials, labor, machines, note: notes[g] }
  })
  const sumOf = (k: 'sum' | 'materials' | 'labor' | 'machines') => lines.reduce((a, x) => a + x[k], 0)
  const direct = sumOf('sum')
  const overhead = direct * input.overheadPct / 100
  const reserve = (direct + overhead) * input.reservePct / 100
  const cost = direct + overhead + reserve
  const margin = cost * input.marginPct / 100
  const price = cost + margin
  const materials = sumOf('materials')
  const materials10 = materials * 0.1 * (1 + input.overheadPct / 100) * (1 + input.reservePct / 100)
  return {
    lines, direct, materials, labor: sumOf('labor'), machines: sumOf('machines'), overhead, reserve, cost,
    costPerM2: area ? cost / area : 0, margin, price, vat: price * VAT, priceVat: price * (1 + VAT), norm, compression,
    warnings, basis, materials10,
  }
}

export function defaultCostInput(): CostInput {
  return {
    name: 'Новый объект', kind: 'residential', area: 12000, floors: 9, underground: false, structure: 'monolith', finish: 'whitebox',
    region: 'Астрахань', months: 20, method: 'norms', overheadPct: 12, reservePct: 3, marginPct: 10,
  }
}

// ---------- текущие объекты ----------
export interface CurrentCostRow {
  group: CostGroup
  planned: number
  spent: number
  forecast: number
  deviation: number
}

/** Плановая / фактическая / прогнозная себестоимость текущего объекта по укрупнённым группам */
export function currentCost(project: Project, stages: Stage[]) {
  const own = stages.filter((s) => s.projectId === project.id)
  const map = new Map<CostGroup, CurrentCostRow>()
  for (const s of own) {
    const g = stageGroup(s)
    const forecast = s.progress >= 100 ? s.actualCost : s.progress > 0 ? s.actualCost / (s.progress / 100) : s.plannedCost
    const r = map.get(g) ?? { group: g, planned: 0, spent: 0, forecast: 0, deviation: 0 }
    r.planned += s.plannedCost; r.spent += s.actualCost; r.forecast += forecast
    map.set(g, r)
  }
  const rows = GROUPS.filter((g) => map.has(g)).map((g) => { const r = map.get(g)!; return { ...r, deviation: r.forecast - r.planned } })
  const planned = rows.reduce((a, r) => a + r.planned, 0)
  const spent = rows.reduce((a, r) => a + r.spent, 0)
  const forecast = rows.reduce((a, r) => a + r.forecast, 0)
  const profit = project.budget - forecast
  return {
    rows, planned, spent, forecast, deviation: forecast - planned,
    profit, profitability: project.budget ? (profit / project.budget) * 100 : 0,
    plannedProfitability: project.budget ? ((project.budget - planned) / project.budget) * 100 : 0,
    perM2: project.area ? forecast / project.area : 0,
    toComplete: Math.max(0, forecast - spent),
  }
}

// ---------- выгрузка ----------
const f = (v: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(v))
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function costHtml(input: CostInput, r: CostResult, date: string): string {
  const rows = r.lines.map((l) => `<tr><td>${esc(GROUP_LABEL[l.group])}${l.note ? ` <i>(${esc(l.note)})</i>` : ''}</td><td class="r">${f(l.rate)}</td><td class="r">${f(l.materials)}</td><td class="r">${f(l.labor)}</td><td class="r">${f(l.machines)}</td><td class="r"><b>${f(l.sum)}</b></td></tr>`).join('')
  const tot = (label: string, v: number, b = false) => `<tr><td colspan="5" class="r">${b ? '<b>' : ''}${label}${b ? '</b>' : ''}</td><td class="r">${b ? '<b>' : ''}${f(v)}${b ? '</b>' : ''}</td></tr>`
  return `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>${esc(input.name)}</title><style>
body{font-family:Arial,sans-serif;font-size:10pt;margin:1.5cm}h1{font-size:14pt}table{border-collapse:collapse;width:100%;margin:8px 0}
th,td{border:1px solid #444;padding:3px 6px}th{background:#eee}td.r{text-align:right}.demo{border:1px solid #b45309;color:#92400e;padding:5px 8px;font-size:9pt}</style></head><body>
<div class="demo">ПРЕДВАРИТЕЛЬНЫЙ РАСЧЁТ. Демонстрационные укрупнённые показатели, не заменяют сметный расчёт.</div>
<h1>Расчёт себестоимости: ${esc(input.name)}</h1>
<p>${esc(KIND_LABEL[input.kind])} · ${f(input.area)} м² · ${input.floors} эт.${input.underground ? ' + подземный этаж' : ''} · ${esc(STRUCTURE_LABEL[input.structure])} · отделка: ${esc(FINISH_LABEL[input.finish])} · ${esc(input.region)} · срок ${input.months} мес. · дата расчёта ${date}</p>
<p><i>${esc(r.basis)}</i></p>
<table><tr><th>Группа работ</th><th>₽/м²</th><th>Материалы</th><th>Труд</th><th>Машины</th><th>Итого, ₽</th></tr>${rows}
${tot('Прямые затраты', r.direct, true)}${tot(`Накладные расходы ${input.overheadPct}%`, r.overhead)}${tot(`Резерв на непредвиденные ${input.reservePct}%`, r.reserve)}
${tot('СЕБЕСТОИМОСТЬ', r.cost, true)}${tot('Себестоимость за м²', r.costPerM2)}${tot(`Маржа ${input.marginPct}%`, r.margin)}${tot('Цена без НДС', r.price)}${tot('НДС 20%', r.vat)}${tot('ЦЕНА С НДС', r.priceVat, true)}</table>
${r.warnings.length ? `<p><b>Замечания:</b></p><ul>${r.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
<p>Рост цен на материалы на 10% увеличит себестоимость на ${f(r.materials10)} ₽.</p></body></html>`
}

export function costCsv(input: CostInput, r: CostResult): string {
  const q = (v: string | number) => (/[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
  const L = [['Группа работ', '₽/м²', 'Материалы', 'Труд', 'Машины', 'Итого'].join(';')]
  for (const l of r.lines) L.push([GROUP_LABEL[l.group], Math.round(l.rate), Math.round(l.materials), Math.round(l.labor), Math.round(l.machines), Math.round(l.sum)].map(q).join(';'))
  for (const [k, v] of [['Прямые затраты', r.direct], [`Накладные ${input.overheadPct}%`, r.overhead], [`Резерв ${input.reservePct}%`, r.reserve], ['Себестоимость', r.cost], ['Себестоимость за м²', r.costPerM2], [`Маржа ${input.marginPct}%`, r.margin], ['Цена без НДС', r.price], ['НДС 20%', r.vat], ['Цена с НДС', r.priceVat]] as [string, number][])
    L.push([q(k), '', '', '', '', Math.round(v)].join(';'))
  return '﻿' + L.join('\r\n')
}

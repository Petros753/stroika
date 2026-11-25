import { coverage, criticalGaps } from './quality'
import { replyStatus } from './mail'
import { formatDate as formatDateShort } from '../lib/date'
import type { Project, Stage, Task, User } from './types'
import type { DataState } from '../data/seed'
import { ALL_PROJECTS_ROLES } from './permissions'
import { TODAY, daysBetween, isOverdue } from '../lib/date'

// Все расчёты — чистые функции над состоянием. Ничего не генерируется случайно.

export function stagePlannedProgress(stage: Stage, today = TODAY): number {
  const total = daysBetween(stage.startDate, stage.endDate)
  if (total <= 0) return today >= stage.endDate ? 100 : 0
  const elapsed = daysBetween(stage.startDate, today)
  return Math.max(0, Math.min(100, (elapsed / total) * 100))
}

export interface ProjectMetrics {
  stagesCount: number
  progress: number
  plannedProgress: number
  /** отставание в процентных пунктах (>0 — отстаёт) */
  delayPp: number
  behind: boolean
  plannedCost: number
  spent: number
  earned: number
  /** перерасход относительно освоенного объёма (EVM), не меньше 0 */
  overrun: number
  overrunPct: number
  plannedProfit: number
  forecastCost: number
  forecastProfit: number
}

export function projectMetrics(project: Project, stages: Stage[]): ProjectMetrics {
  const own = stages.filter((s) => s.projectId === project.id)
  if (own.length === 0) {
    return {
      stagesCount: 0, progress: project.progress, plannedProgress: project.progress, delayPp: 0, behind: false,
      plannedCost: 0, spent: 0, earned: 0, overrun: 0, overrunPct: 0, plannedProfit: project.budget,
      forecastCost: 0, forecastProfit: project.budget,
    }
  }
  const plannedCost = own.reduce((a, s) => a + s.plannedCost, 0)
  const spent = own.reduce((a, s) => a + s.actualCost, 0)
  const earned = own.reduce((a, s) => a + (s.plannedCost * s.progress) / 100, 0)
  const progress = plannedCost > 0 ? (earned / plannedCost) * 100 : 0
  const plannedProgress =
    plannedCost > 0 ? own.reduce((a, s) => a + s.plannedCost * stagePlannedProgress(s), 0) / plannedCost : 0
  const delayPp = plannedProgress - progress
  const overrun = Math.max(0, spent - earned)
  const forecastCost = own.reduce((a, s) => {
    if (s.progress >= 100) return a + s.actualCost
    if (s.progress > 0) return a + s.actualCost / (s.progress / 100)
    return a + s.plannedCost
  }, 0)
  return {
    stagesCount: own.length,
    progress,
    plannedProgress,
    delayPp,
    behind: delayPp >= 5,
    plannedCost,
    spent,
    earned,
    overrun,
    overrunPct: earned > 0 ? (overrun / earned) * 100 : 0,
    plannedProfit: project.budget - plannedCost,
    forecastCost,
    forecastProfit: project.budget - forecastCost,
  }
}

export function visibleProjects(state: DataState, user: User): Project[] {
  if (ALL_PROJECTS_ROLES.includes(user.role)) return state.projects
  return state.projects.filter((p) => user.projectIds.includes(p.id))
}

export function overdueTasks(tasks: Task[], today = TODAY): Task[] {
  return tasks.filter((t) => t.status !== 'done' && isOverdue(t.dueDate, today))
}

export interface StockRow {
  warehouseId: string
  materialId: string
  qty: number
  minQty: number
  low: boolean
  shortage: number
}

export function stockRows(state: DataState): StockRow[] {
  return state.stock.map((s) => ({
    ...s,
    low: s.qty < s.minQty,
    shortage: Math.max(0, s.minQty - s.qty),
  }))
}

/** Материалы к закупке: дефицит на складах объектов минус то, что уже заказано/согласовано */
export interface ProcurementNeed {
  projectId: string
  materialId: string
  shortage: number
  inPipeline: number
  toBuy: number
}

export function procurementNeeds(state: DataState): ProcurementNeed[] {
  const out: ProcurementNeed[] = []
  for (const row of stockRows(state)) {
    if (!row.low) continue
    const wh = state.warehouses.find((w) => w.id === row.warehouseId)
    if (!wh?.projectId) continue
    const inPipeline = state.requests
      .filter((r) => r.projectId === wh.projectId && ['pending', 'approved', 'ordered'].includes(r.status))
      .flatMap((r) => r.items)
      .filter((i) => i.materialId === row.materialId)
      .reduce((a, i) => a + i.qty, 0)
    out.push({
      projectId: wh.projectId, materialId: row.materialId, shortage: row.shortage, inPipeline,
      toBuy: Math.max(0, row.shortage - inPipeline),
    })
  }
  return out
}

export function missingExecDocs(state: DataState, projectId?: string) {
  const covered = new Set(state.execDocs.map((d) => d.requirementId).filter(Boolean))
  return state.requirements.filter((r) => (!projectId || r.projectId === projectId) && !covered.has(r.id))
}

export type Severity = 'high' | 'medium' | 'low'

export interface AiAlert {
  id: string
  severity: Severity
  projectId?: string
  text: string
  link: string
}

const SEV_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 }

/** Предупреждения формируются правилами по текущим данным и пересчитываются после любых действий */
export function computeAlerts(state: DataState): AiAlert[] {
  const alerts: AiAlert[] = []
  for (const p of state.projects) {
    const m = projectMetrics(p, state.stages)
    if (m.behind) {
      alerts.push({
        id: `behind_${p.id}`, severity: m.delayPp >= 10 ? 'high' : 'medium', projectId: p.id,
        text: `${p.name}: отставание от графика на ${m.delayPp.toFixed(0)} п.п. (план ${m.plannedProgress.toFixed(0)}%, факт ${m.progress.toFixed(0)}%)`,
        link: `/projects/${p.id}?tab=stages`,
      })
    }
    if (m.overrunPct >= 5) {
      alerts.push({
        id: `overrun_${p.id}`, severity: m.overrunPct >= 10 ? 'high' : 'medium', projectId: p.id,
        text: `${p.name}: перерасход ${Math.round(m.overrun / 1e6)} млн ₽ (${m.overrunPct.toFixed(1)}% от освоенного объёма)`,
        link: `/projects/${p.id}?tab=overview`,
      })
    }
    const overdue = overdueTasks(state.tasks.filter((t) => t.projectId === p.id))
    if (overdue.length > 0) {
      alerts.push({
        id: `overdue_${p.id}`, severity: overdue.length >= 3 ? 'high' : 'medium', projectId: p.id,
        text: `${p.name}: просрочено задач — ${overdue.length}`, link: `/projects/${p.id}?tab=stages`,
      })
    }
    const lows = stockRows(state).filter((r) => {
      const wh = state.warehouses.find((w) => w.id === r.warehouseId)
      return r.low && wh?.projectId === p.id
    })
    if (lows.length > 0) {
      alerts.push({
        id: `stock_${p.id}`, severity: lows.length >= 3 ? 'high' : 'medium', projectId: p.id,
        text: `${p.name}: дефицит материалов на складе объекта — ${lows.length} поз.`, link: `/projects/${p.id}?tab=warehouse`,
      })
    }
    const miss = missingExecDocs(state, p.id)
    if (miss.length > 0) {
      alerts.push({
        id: `exec_${p.id}`, severity: miss.length >= 3 ? 'medium' : 'low', projectId: p.id,
        text: `${p.name}: не подготовлено документов ИД — ${miss.length}`, link: `/projects/${p.id}?tab=exec`,
      })
    }
    const gaps = criticalGaps(coverage(state, p.id, TODAY))
    if (gaps.length > 0) {
      alerts.push({
        id: `quality_${p.id}`, severity: 'medium', projectId: p.id,
        text: `${p.name}: материалы без действующих документов о качестве — ${gaps.length} поз.`, link: `/pto?project=${p.id}&tab=quality`,
      })
    }
  }
  for (const l of state.letters ?? []) {
    const st = replyStatus(l, TODAY)
    if (st === 'overdue' || st === 'soon') {
      alerts.push({
        id: `mail_${l.id}`, severity: st === 'overdue' ? 'high' : 'medium', projectId: l.projectId,
        text: `${st === 'overdue' ? 'Просрочен' : 'Истекает'} срок ответа (${formatDateShort(l.replyBy!)}): ${l.from} — «${l.subject}»`, link: `/mail?letter=${l.id}`,
      })
    }
  }
  const pending = state.requests.filter((r) => r.status === 'pending')
  if (pending.length > 0) {
    alerts.push({
      id: 'pending_requests', severity: 'low', text: `Заявок на согласовании: ${pending.length}`, link: '/procurement',
    })
  }
  return alerts.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity])
}

export interface CompanyMetrics {
  activeProjects: number
  budget: number
  spent: number
  plannedProfit: number
  forecastProfit: number
  avgProgress: number
  overdueTasks: number
  openRequests: number
  unsignedDocs: number
  alerts: number
}

export function companyMetrics(state: DataState, projects: Project[]): CompanyMetrics {
  const ids = new Set(projects.map((p) => p.id))
  const ms = projects.map((p) => ({ p, m: projectMetrics(p, state.stages) }))
  const budget = projects.reduce((a, p) => a + p.budget, 0)
  const totalPlanned = ms.reduce((a, x) => a + x.m.plannedCost, 0)
  const weight = ms.reduce((a, x) => a + x.p.budget, 0)
  return {
    activeProjects: projects.filter((p) => p.status === 'in_progress').length,
    budget,
    spent: ms.reduce((a, x) => a + x.m.spent, 0),
    plannedProfit: budget - totalPlanned,
    forecastProfit: ms.reduce((a, x) => a + x.m.forecastProfit, 0),
    avgProgress: weight > 0 ? ms.reduce((a, x) => a + x.m.progress * x.p.budget, 0) / weight : 0,
    overdueTasks: overdueTasks(state.tasks.filter((t) => ids.has(t.projectId))).length,
    openRequests: state.requests.filter((r) => ids.has(r.projectId) && ['pending', 'approved', 'draft'].includes(r.status)).length,
    unsignedDocs: state.documents.filter((d) => ids.has(d.projectId) && d.status === 'unsigned').length,
    alerts: computeAlerts(state).filter((a) => !a.projectId || ids.has(a.projectId)).length,
  }
}

export function requestTotal(
  items: { materialId: string; qty: number }[],
  prices: Record<string, number>,
): number | null {
  let sum = 0
  for (const it of items) {
    const p = prices[it.materialId]
    if (p === undefined) return null
    sum += p * it.qty
  }
  return sum
}

export interface MonthPoint {
  month: string // yyyy-mm
  label: string
  plan: number
  fact: number | null
}

const MONTHS_RU = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

/** Накопительные расходы по месяцам. Затраты этапа распределяются равномерно по его срокам (допущение демо). */
export function cumulativeSpend(stages: Stage[], fromMonth: string, toMonth: string, today = TODAY): MonthPoint[] {
  const months: string[] = []
  let [y, m] = fromMonth.split('-').map(Number)
  const [ty, tm] = toMonth.split('-').map(Number)
  while (y < ty || (y === ty && m <= tm)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) { m = 1; y += 1 }
  }
  const monthEnd = (mo: string) => {
    const [yy, mm] = mo.split('-').map(Number)
    const d = new Date(Date.UTC(yy, mm, 0))
    return d.toISOString().slice(0, 10)
  }
  const spread = (s: Stage, total: number, until: string, upTo: string): number => {
    const end = s.progress >= 100 ? s.endDate : (until < s.endDate ? until : s.endDate)
    const span = Math.max(1, daysBetween(s.startDate, end))
    const cut = upTo < end ? upTo : end
    const done = Math.max(0, daysBetween(s.startDate, cut))
    return (total * Math.min(span, done)) / span
  }
  return months.map((mo) => {
    const e = monthEnd(mo)
    const plan = stages.reduce((a, s) => a + spread(s, s.plannedCost, s.endDate, e), 0)
    const fact = e <= today.slice(0, 7) + '-31' && mo <= today.slice(0, 7)
      ? stages.reduce((a, s) => a + spread(s, s.actualCost, today, e), 0)
      : null
    const [yy, mm] = mo.split('-')
    return { month: mo, label: `${MONTHS_RU[Number(mm) - 1]} ${yy.slice(2)}`, plan, fact }
  })
}
